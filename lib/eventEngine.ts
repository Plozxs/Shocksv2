import {
  buildRegimeFeatures,
  classifyTrend,
  classifyVolRegime,
  classifyVolumeShock,
  computeCloseToCloseReturns,
  RegimeFeatures,
} from "@/lib/regimes";
import { cvar, isFiniteNumber, mean, median, minimum, percentile, wilsonInterval } from "@/lib/stats";
import {
  Direction,
  EventObservation,
  EventStudyInput,
  EventStudyResult,
  HeatmapCell,
  HorizonMetrics,
  KpiSummary,
  PriceBar,
  RegimeBreakdownRow,
  ReturnType,
} from "@/lib/types";

const ENGINE_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_HORIZONS = [1, 2, 3, 5, 10];

type EngineCacheEntry = {
  value: EventStudyResult;
  expiresAt: number;
};

const globalCache = globalThis as typeof globalThis & {
  __shockLabEngineCache?: Map<string, EngineCacheEntry>;
};

const engineCache = globalCache.__shockLabEngineCache ?? new Map<string, EngineCacheEntry>();
globalCache.__shockLabEngineCache = engineCache;

function sortBars(bars: PriceBar[]): PriceBar[] {
  return [...bars].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeHorizons(horizons: number[], maxHorizon?: number): number[] {
  const limit = maxHorizon ?? Math.max(...horizons, ...DEFAULT_HORIZONS);
  return Array.from(new Set(horizons))
    .filter((horizon) => Number.isInteger(horizon) && horizon > 0 && horizon <= limit)
    .sort((a, b) => a - b);
}

export function computeEventReturns(
  bars: PriceBar[],
  returnType: ReturnType,
): Array<number | null> {
  const result: Array<number | null> = Array(bars.length).fill(null);
  for (let index = 1; index < bars.length; index += 1) {
    const previousClose = bars[index - 1].close;
    if (!previousClose || previousClose <= 0) {
      result[index] = null;
      continue;
    }

    const base =
      returnType === "lowToPrevClose" && bars[index].low > 0 ? bars[index].low : bars[index].close;
    if (!base || base <= 0) {
      result[index] = null;
      continue;
    }

    result[index] = base / previousClose - 1;
  }

  return result;
}

function isEvent(returnValue: number | null, direction: Direction, thresholdPct: number): boolean {
  if (!isFiniteNumber(returnValue)) {
    return false;
  }

  const threshold = Math.abs(thresholdPct) / 100;
  return direction === "down" ? returnValue <= -threshold : returnValue >= threshold;
}

function selectEventIndices(
  eventReturns: Array<number | null>,
  direction: Direction,
  thresholdPct: number,
  cooldownDays: number,
): { rawCandidates: number[]; selected: number[] } {
  const rawCandidates: number[] = [];
  for (let index = 1; index < eventReturns.length; index += 1) {
    if (isEvent(eventReturns[index], direction, thresholdPct)) {
      rawCandidates.push(index);
    }
  }

  const selected: number[] = [];
  let blockedUntil = -1;
  const cooldown = Math.max(0, Math.floor(cooldownDays));
  for (const index of rawCandidates) {
    if (index <= blockedUntil) {
      continue;
    }

    selected.push(index);
    blockedUntil = index + cooldown;
  }

  return { rawCandidates, selected };
}

function buildForwardReturns(
  closes: number[],
  index: number,
  horizons: number[],
): Record<number, number | null> {
  const forwardReturns = {} as Record<number, number | null>;
  for (const horizon of horizons) {
    const target = index + horizon;
    if (target >= closes.length || closes[index] <= 0 || closes[target] <= 0) {
      forwardReturns[horizon] = null;
      continue;
    }

    forwardReturns[horizon] = closes[target] / closes[index] - 1;
  }

  return forwardReturns;
}

function buildEventObservation(
  bars: PriceBar[],
  horizons: number[],
  features: RegimeFeatures,
  eventReturns: Array<number | null>,
  index: number,
): EventObservation | null {
  const eventReturn = eventReturns[index];
  if (!isFiniteNumber(eventReturn)) {
    return null;
  }

  const closes = bars.map((bar) => bar.close);
  return {
    index,
    date: bars[index].date,
    eventReturn,
    forwardReturns: buildForwardReturns(closes, index, horizons),
    trend: classifyTrend(features.maSlope[index]),
    volRegime: classifyVolRegime(features.rv[index], features.rvP20, features.rvP80),
    volumeShock: classifyVolumeShock(features.volumeZ[index]),
  };
}

function eventMatchesRegimeFilters(event: EventObservation, input: EventStudyInput): boolean {
  const filters = input.regimeFilters;
  if (!filters) {
    return true;
  }

  if (filters.trend && filters.trend !== "all" && event.trend !== filters.trend) {
    return false;
  }
  if (filters.vol && filters.vol !== "all" && event.volRegime !== filters.vol) {
    return false;
  }
  if (
    filters.volumeShock &&
    filters.volumeShock !== "all" &&
    event.volumeShock !== filters.volumeShock
  ) {
    return false;
  }

  return true;
}

function collectForwardReturns(events: EventObservation[], horizon: number): number[] {
  return events
    .map((event) => event.forwardReturns[horizon])
    .filter((value): value is number => isFiniteNumber(value));
}

function summarizeHorizon(horizon: number, events: EventObservation[]): HorizonMetrics {
  const values = collectForwardReturns(events, horizon);
  const n = values.length;
  const upCount = values.filter((value) => value > 0).length;

  return {
    horizon,
    n,
    pUp: n > 0 ? upCount / n : null,
    pUpCI: n > 0 ? wilsonInterval(upCount, n) : null,
    mean: mean(values),
    median: median(values),
    p10: percentile(values, 0.1),
    p90: percentile(values, 0.9),
    worst: minimum(values),
    cvar95: cvar(values, 0.95),
  };
}

function summarizeHorizonSet(events: EventObservation[], horizons: number[]): HorizonMetrics[] {
  return horizons.map((horizon) => summarizeHorizon(horizon, events));
}

function buildKpis(
  selectedEvents: EventObservation[],
  allEvents: EventObservation[],
  rawCandidateCount: number,
  horizonMetrics: HorizonMetrics[],
  yearsSpan: number,
): KpiSummary {
  const byHorizon = new Map(horizonMetrics.map((metric) => [metric.horizon, metric]));
  const h1 = byHorizon.get(1);
  const h3 = byHorizon.get(3);
  const h5 = byHorizon.get(5);

  return {
    eventCount: selectedEvents.length,
    annualFrequency: yearsSpan > 0 ? selectedEvents.length / yearsSpan : 0,
    independentPct: rawCandidateCount > 0 ? allEvents.length / rawCandidateCount : 0,
    pUp1d: { p: h1?.pUp ?? null, ci95: h1?.pUpCI ?? null },
    pUp3d: { p: h3?.pUp ?? null, ci95: h3?.pUpCI ?? null },
    pUp5d: { p: h5?.pUp ?? null, ci95: h5?.pUpCI ?? null },
    expected3d: h3?.mean ?? null,
    worst5d: h5?.worst ?? null,
    cvar95_5d: h5?.cvar95 ?? null,
  };
}

function buildRegimeRow(segment: string, events: EventObservation[]): RegimeBreakdownRow {
  const oneDay = collectForwardReturns(events, 1);
  const threeDay = collectForwardReturns(events, 3);
  const n = events.length;

  return {
    segment,
    n,
    pUp1d: oneDay.length > 0 ? oneDay.filter((value) => value > 0).length / oneDay.length : null,
    ev3d: mean(threeDay),
    worst3d: minimum(threeDay),
  };
}

function buildRegimeBreakdown(events: EventObservation[]): RegimeBreakdownRow[] {
  return [
    buildRegimeRow(
      "Trend: Uptrend",
      events.filter((event) => event.trend === "uptrend"),
    ),
    buildRegimeRow(
      "Trend: Downtrend",
      events.filter((event) => event.trend === "downtrend"),
    ),
    buildRegimeRow(
      "Vol: High",
      events.filter((event) => event.volRegime === "high"),
    ),
    buildRegimeRow(
      "Vol: Mid",
      events.filter((event) => event.volRegime === "mid"),
    ),
    buildRegimeRow(
      "Vol: Low",
      events.filter((event) => event.volRegime === "low"),
    ),
    buildRegimeRow(
      "Volume: Shock",
      events.filter((event) => event.volumeShock === "shock"),
    ),
    buildRegimeRow(
      "Volume: Normal",
      events.filter((event) => event.volumeShock === "normal"),
    ),
  ];
}

function buildHeatmap(
  bars: PriceBar[],
  eventReturns: Array<number | null>,
  features: RegimeFeatures,
  input: EventStudyInput,
  horizons: number[],
): HeatmapCell[] {
  const thresholdBase = Math.max(1, Math.abs(input.thresholdPct));
  const thresholds = Array.from(
    new Set([0.5, 0.75, 1, 1.25, 1.5].map((scale) => Number((thresholdBase * scale).toFixed(2)))),
  ).sort((a, b) => a - b);

  const heatmap: HeatmapCell[] = [];
  for (const threshold of thresholds) {
    const { selected } = selectEventIndices(
      eventReturns,
      input.direction,
      threshold,
      input.cooldownDays,
    );

    const events = selected
      .map((index) => buildEventObservation(bars, horizons, features, eventReturns, index))
      .filter((event): event is EventObservation => event !== null)
      .filter((event) => eventMatchesRegimeFilters(event, input));

    for (const horizon of horizons) {
      const values = collectForwardReturns(events, horizon);
      const n = values.length;

      heatmap.push({
        threshold,
        horizon,
        n,
        pUp: n > 0 ? values.filter((value) => value > 0).length / n : null,
        ev: mean(values),
      });
    }
  }

  return heatmap;
}

function makeCacheKey(bars: PriceBar[], input: EventStudyInput): string {
  const start = bars[0]?.date ?? "";
  const end = bars[bars.length - 1]?.date ?? "";
  const lastClose = bars[bars.length - 1]?.close ?? "";

  return JSON.stringify({
    ticker: input.ticker ?? "",
    direction: input.direction,
    thresholdPct: input.thresholdPct,
    horizons: input.horizons,
    maxHorizon: input.maxHorizon,
    cooldownDays: input.cooldownDays,
    returnType: input.returnType,
    windowVolDays: input.windowVolDays,
    trendMA: input.trendMA,
    volumeZWindow: input.volumeZWindow,
    regimeFilters: input.regimeFilters ?? {},
    barsCount: bars.length,
    start,
    end,
    lastClose,
  });
}

export function runEventStudy(bars: PriceBar[], input: EventStudyInput): EventStudyResult {
  const sortedBars = sortBars(bars);
  if (sortedBars.length < 2) {
    throw new Error("No hay suficientes datos diarios para calcular eventos.");
  }

  const horizons = normalizeHorizons(input.horizons, input.maxHorizon);
  if (!horizons.length) {
    throw new Error("Debe haber al menos un horizonte válido.");
  }

  const closeReturns = computeCloseToCloseReturns(sortedBars);
  const eventReturns = computeEventReturns(sortedBars, input.returnType);
  const features = buildRegimeFeatures(sortedBars, closeReturns, {
    windowVolDays: input.windowVolDays,
    trendMA: input.trendMA,
    volumeZWindow: input.volumeZWindow,
  });

  const { rawCandidates, selected } = selectEventIndices(
    eventReturns,
    input.direction,
    input.thresholdPct,
    input.cooldownDays,
  );

  const allEvents = selected
    .map((index) => buildEventObservation(sortedBars, horizons, features, eventReturns, index))
    .filter((event): event is EventObservation => event !== null);

  const selectedEvents = allEvents.filter((event) => eventMatchesRegimeFilters(event, input));
  const horizonMetrics = summarizeHorizonSet(selectedEvents, horizons);

  const startDate = new Date(sortedBars[0].date);
  const endDate = new Date(sortedBars[sortedBars.length - 1].date);
  const yearsSpan = Math.max(
    0.01,
    (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );

  const histogramByHorizon = horizons.reduce<Record<string, number[]>>((acc, horizon) => {
    acc[horizon] = collectForwardReturns(selectedEvents, horizon);
    return acc;
  }, {});

  const warnings: string[] = [];
  const minHistory = Math.max(input.trendMA, input.windowVolDays, input.volumeZWindow) + 20;
  if (sortedBars.length < minHistory) {
    warnings.push(
      "Histórico corto para estimar regímenes con estabilidad; revisar MA/volumen y vol ventana.",
    );
  }
  if (selectedEvents.length < 20) {
    warnings.push("Muestra insuficiente (<20 eventos) para inferencias robustas.");
  }

  return {
    ticker: input.ticker?.toUpperCase() ?? "UNKNOWN",
    generatedAt: new Date().toISOString(),
    dateRange: {
      start: sortedBars[0].date,
      end: sortedBars[sortedBars.length - 1].date,
    },
    barsCount: sortedBars.length,
    horizons,
    rawCandidateCount: rawCandidates.length,
    allEvents,
    selectedEvents,
    horizonMetrics,
    kpis: buildKpis(selectedEvents, allEvents, rawCandidates.length, horizonMetrics, yearsSpan),
    forwardCurve: horizonMetrics.map((metric) => ({
      horizon: metric.horizon,
      mean: metric.mean,
      median: metric.median,
    })),
    histogramByHorizon,
    regimeBreakdown: buildRegimeBreakdown(allEvents),
    heatmap: buildHeatmap(sortedBars, eventReturns, features, input, horizons),
    warnings,
    insufficientSample: selectedEvents.length < 20,
  };
}

export function runEventStudyCached(
  bars: PriceBar[],
  input: EventStudyInput,
  ttlMs = ENGINE_CACHE_TTL_MS,
): EventStudyResult {
  const key = makeCacheKey(bars, input);
  const cached = engineCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (cached && cached.expiresAt <= Date.now()) {
    engineCache.delete(key);
  }

  const value = runEventStudy(bars, input);
  engineCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

export function latestBarHasEvent(
  bars: PriceBar[],
  options: {
    direction: Direction;
    thresholdPct: number;
    returnType: ReturnType;
  },
): { isEvent: boolean; eventReturn: number | null } {
  const sortedBars = sortBars(bars);
  if (sortedBars.length < 2) {
    return { isEvent: false, eventReturn: null };
  }

  const returns = computeEventReturns(sortedBars, options.returnType);
  const eventReturn = returns[returns.length - 1];
  return {
    isEvent: isEvent(eventReturn, options.direction, options.thresholdPct),
    eventReturn,
  };
}
