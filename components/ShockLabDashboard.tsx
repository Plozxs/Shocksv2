"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Database, Radar } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KpiCard } from "@/components/KpiCard";
import { DashboardInputs, InputsPanel } from "@/components/InputsPanel";
import { HorizonTable } from "@/components/HorizonTable";
import { ReturnHistogram } from "@/components/ReturnHistogram";
import { ForwardCurveChart } from "@/components/ForwardCurveChart";
import { RegimeTable } from "@/components/RegimeTable";
import { SnapshotExport } from "@/components/SnapshotExport";
import {
  ResultsLoadingSkeleton,
  ScreenerLoadingSkeleton,
} from "@/components/LoadingSkeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_HORIZONS, runEventStudyCached } from "@/lib/eventEngine";
import { PriceBar, RangeOption, ScreenerItem } from "@/lib/types";

interface PricesApiResponse {
  ticker: string;
  range: RangeOption;
  bars: PriceBar[];
  error?: string;
}

interface ScreenerApiResponse {
  items: ScreenerItem[];
  rankBy: "ev3d" | "pUp1d";
  error?: string;
}

const DEFAULT_INPUTS: DashboardInputs = {
  ticker: "SPY",
  range: "5y",
  direction: "down",
  thresholdPct: 10,
  maxHorizon: 10,
  cooldownDays: 5,
  windowVolDays: 20,
  trendMA: 200,
  volumeZWindow: 20,
  returnType: "closeToClose",
  trendFilter: "all",
  volFilter: "all",
  volumeShockFilter: "all",
  screenerRankBy: "ev3d",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseNumericParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return clamp(parsed, min, max);
}

function parseInputsFromQuery(searchParams: URLSearchParams): Partial<DashboardInputs> {
  const parsed: Partial<DashboardInputs> = {};
  const ticker = searchParams.get("ticker");
  if (ticker) {
    parsed.ticker = ticker.toUpperCase();
  }

  const range = searchParams.get("range");
  if (range && ["1y", "2y", "5y", "10y", "max"].includes(range)) {
    parsed.range = range as RangeOption;
  }

  const direction = searchParams.get("direction");
  if (direction === "down" || direction === "up") {
    parsed.direction = direction;
  }

  parsed.thresholdPct = parseNumericParam(searchParams.get("threshold"), DEFAULT_INPUTS.thresholdPct, 1, 35);
  parsed.cooldownDays = parseNumericParam(searchParams.get("cooldown"), DEFAULT_INPUTS.cooldownDays, 0, 30);
  parsed.maxHorizon = parseNumericParam(searchParams.get("maxH"), DEFAULT_INPUTS.maxHorizon, 3, 10);

  const rankBy = searchParams.get("rankBy");
  if (rankBy === "ev3d" || rankBy === "pUp1d") {
    parsed.screenerRankBy = rankBy;
  }

  return parsed;
}

function formatPercent(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function heatColor(probability: number | null): string {
  if (probability === null) {
    return "bg-panel-900";
  }
  if (probability >= 0.6) {
    return "bg-success/30";
  }
  if (probability <= 0.4) {
    return "bg-danger/25";
  }
  return "bg-accent/20";
}

export default function ShockLabDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const snapshotRef = useRef<HTMLDivElement>(null);

  const [inputs, setInputs] = useState<DashboardInputs>(DEFAULT_INPUTS);
  const [initialized, setInitialized] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [bars, setBars] = useState<PriceBar[]>([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<string | null>(null);

  const [screenerRows, setScreenerRows] = useState<ScreenerItem[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState<string | null>(null);

  const [histogramHorizon, setHistogramHorizon] = useState(3);

  useEffect(() => {
    if (initialized) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    setInputs((previous) => ({
      ...previous,
      ...parseInputsFromQuery(params),
    }));
    setInitialized(true);
  }, [initialized, searchParams]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    const params = new URLSearchParams();
    params.set("ticker", inputs.ticker);
    params.set("range", inputs.range);
    params.set("threshold", String(inputs.thresholdPct));
    params.set("direction", inputs.direction);
    params.set("cooldown", String(inputs.cooldownDays));
    params.set("maxH", String(inputs.maxHorizon));
    params.set("rankBy", inputs.screenerRankBy);

    const nextQuery = params.toString();
    if (nextQuery !== searchParams.toString()) {
      router.replace(`${pathname}?${nextQuery}`, { scroll: false });
    }
  }, [
    initialized,
    inputs.cooldownDays,
    inputs.direction,
    inputs.maxHorizon,
    inputs.range,
    inputs.screenerRankBy,
    inputs.thresholdPct,
    inputs.ticker,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setPricesLoading(true);
      setPricesError(null);
      try {
        const response = await fetch(
          `/api/prices?ticker=${encodeURIComponent(inputs.ticker)}&range=${inputs.range}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as PricesApiResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudieron cargar precios.");
        }

        setBars(payload.bars ?? []);
        setPricesUpdatedAt(new Date().toISOString());
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Error desconocido consultando precios.";
        setPricesError(message);
        setBars([]);
      } finally {
        if (!controller.signal.aborted) {
          setPricesLoading(false);
        }
      }
    }, 280);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [initialized, inputs.range, inputs.ticker, reloadToken]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setScreenerLoading(true);
      setScreenerError(null);
      try {
        const response = await fetch(
          `/api/screener?threshold=${inputs.thresholdPct}&direction=${inputs.direction}&cooldown=${inputs.cooldownDays}&range=${inputs.range}&rankBy=${inputs.screenerRankBy}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as ScreenerApiResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudo cargar screener.");
        }
        setScreenerRows(payload.items ?? []);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Error desconocido en screener.";
        setScreenerError(message);
        setScreenerRows([]);
      } finally {
        if (!controller.signal.aborted) {
          setScreenerLoading(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    initialized,
    inputs.cooldownDays,
    inputs.direction,
    inputs.range,
    inputs.screenerRankBy,
    inputs.thresholdPct,
    reloadToken,
  ]);

  const horizons = useMemo(
    () => DEFAULT_HORIZONS.filter((horizon) => horizon <= inputs.maxHorizon),
    [inputs.maxHorizon],
  );

  useEffect(() => {
    if (!horizons.length) {
      return;
    }
    if (!horizons.includes(histogramHorizon)) {
      setHistogramHorizon(horizons.includes(3) ? 3 : horizons[horizons.length - 1]);
    }
  }, [histogramHorizon, horizons]);

  const analysisState = useMemo(() => {
    if (!bars.length) {
      return { data: null, error: null as string | null };
    }
    try {
      const data = runEventStudyCached(bars, {
        ticker: inputs.ticker,
        direction: inputs.direction,
        thresholdPct: inputs.thresholdPct,
        horizons,
        maxHorizon: inputs.maxHorizon,
        cooldownDays: inputs.cooldownDays,
        returnType: inputs.returnType,
        windowVolDays: inputs.windowVolDays,
        trendMA: inputs.trendMA,
        volumeZWindow: inputs.volumeZWindow,
        regimeFilters: {
          trend: inputs.trendFilter,
          vol: inputs.volFilter,
          volumeShock: inputs.volumeShockFilter,
        },
      });
      return { data, error: null as string | null };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falló el cálculo del motor cuant.";
      return { data: null, error: message };
    }
  }, [
    bars,
    horizons,
    inputs.cooldownDays,
    inputs.direction,
    inputs.maxHorizon,
    inputs.returnType,
    inputs.thresholdPct,
    inputs.ticker,
    inputs.trendFilter,
    inputs.trendMA,
    inputs.volFilter,
    inputs.volumeShockFilter,
    inputs.volumeZWindow,
    inputs.windowVolDays,
  ]);

  const analysis = analysisState.data;
  const heatmapThresholds = useMemo(() => {
    if (!analysis) {
      return [];
    }
    return Array.from(new Set(analysis.heatmap.map((cell) => cell.threshold))).sort(
      (a, b) => a - b,
    );
  }, [analysis]);

  const heatmapLookup = useMemo(() => {
    if (!analysis) {
      return new Map<string, { pUp: number | null; n: number }>();
    }
    return new Map(
      analysis.heatmap.map((cell) => [`${cell.threshold}-${cell.horizon}`, { pUp: cell.pUp, n: cell.n }]),
    );
  }, [analysis]);

  const updatedLabel = useMemo(() => {
    const timestamp = analysis?.generatedAt ?? pricesUpdatedAt;
    if (!timestamp) {
      return "sin actualización";
    }

    try {
      const date = new Date(timestamp);
      return `${format(date, "PPP p")} (${formatDistanceToNowStrict(date, { addSuffix: true })})`;
    } catch {
      return timestamp;
    }
  }, [analysis?.generatedAt, pricesUpdatedAt]);

  const histogramValues = analysis?.histogramByHorizon[String(histogramHorizon)] ?? [];

  return (
    <div className="min-h-screen bg-terminal-grid">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-mono text-xl font-semibold uppercase tracking-[0.22em] text-accent">
              Shock Lab
            </p>
            <p className="text-xs text-muted">Quant event analytics terminal</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted">Updated {updatedLabel}</p>
            <SnapshotExport targetRef={snapshotRef} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-4 px-4 py-4 xl:grid-cols-12">
        <aside className="xl:col-span-3">
          <InputsPanel
            value={inputs}
            onChange={(patch) => setInputs((previous) => ({ ...previous, ...patch }))}
            onRefresh={() => setReloadToken((previous) => previous + 1)}
            loading={pricesLoading || screenerLoading}
          />
        </aside>

        <section className="space-y-4 xl:col-span-9">
          {pricesError ? (
            <Card className="border-danger/40">
              <CardContent className="flex items-center gap-2 py-4 text-sm text-danger">
                <AlertTriangle className="h-4 w-4" />
                {pricesError}
              </CardContent>
            </Card>
          ) : null}

          {analysisState.error ? (
            <Card className="border-danger/40">
              <CardContent className="flex items-center gap-2 py-4 text-sm text-danger">
                <AlertTriangle className="h-4 w-4" />
                {analysisState.error}
              </CardContent>
            </Card>
          ) : null}

          {pricesLoading && !analysis ? <ResultsLoadingSkeleton /> : null}

          {!pricesLoading && !analysis && !pricesError && !analysisState.error ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted">
                No hay resultados todavía. Ajustá inputs o recargá datos.
              </CardContent>
            </Card>
          ) : null}

          {analysis ? (
            <div ref={snapshotRef} className="space-y-4 rounded-xl border border-border/70 bg-panel-900/50 p-4">
              {analysis.warnings.length ? (
                <Card className="border-amber-500/40 bg-amber-500/5">
                  <CardContent className="space-y-1 py-3 text-xs text-amber-200">
                    {analysis.warnings.map((warning) => (
                      <div key={warning} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {analysis.ticker} {analysis.dateRange.start} → {analysis.dateRange.end}
                </Badge>
                <Badge variant="secondary">Bars {analysis.barsCount}</Badge>
                <Badge variant="secondary">Eventos {analysis.kpis.eventCount}</Badge>
                {inputs.trendFilter !== "all" || inputs.volFilter !== "all" || inputs.volumeShockFilter !== "all" ? (
                  <Badge>Regime Filter ON</Badge>
                ) : null}
              </div>

              {analysis.insufficientSample ? (
                <Card className="border-danger/40 bg-danger/5">
                  <CardContent className="py-3 text-sm text-danger">
                    Muestra insuficiente: menos de 20 eventos luego de filtros/cooldown. Interpretar con cautela.
                  </CardContent>
                </Card>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <KpiCard
                  title="N eventos"
                  value={String(analysis.kpis.eventCount)}
                  subtitle={`raw candidatos: ${analysis.rawCandidateCount}`}
                />
                <KpiCard
                  title="Frecuencia anual"
                  value={`${analysis.kpis.annualFrequency.toFixed(2)} /año`}
                />
                <KpiCard
                  title="% independientes"
                  value={formatPercent(analysis.kpis.independentPct)}
                  subtitle="post cooldown"
                  tooltip="Ratio entre eventos tras cooldown y candidatos crudos."
                />
                <KpiCard
                  title="P(Up 1D)"
                  value={formatPercent(analysis.kpis.pUp1d.p)}
                  subtitle={`IC95: ${
                    analysis.kpis.pUp1d.ci95
                      ? `${formatPercent(analysis.kpis.pUp1d.ci95[0], 1)} / ${formatPercent(
                          analysis.kpis.pUp1d.ci95[1],
                          1,
                        )}`
                      : "—"
                  }`}
                  tooltip="Probabilidad de retorno forward > 0 al día siguiente."
                />
                <KpiCard
                  title="P(Up 3D)"
                  value={formatPercent(analysis.kpis.pUp3d.p)}
                  subtitle={`IC95: ${
                    analysis.kpis.pUp3d.ci95
                      ? `${formatPercent(analysis.kpis.pUp3d.ci95[0], 1)} / ${formatPercent(
                          analysis.kpis.pUp3d.ci95[1],
                          1,
                        )}`
                      : "—"
                  }`}
                />
                <KpiCard
                  title="P(Up 5D)"
                  value={formatPercent(analysis.kpis.pUp5d.p)}
                  subtitle={`IC95: ${
                    analysis.kpis.pUp5d.ci95
                      ? `${formatPercent(analysis.kpis.pUp5d.ci95[0], 1)} / ${formatPercent(
                          analysis.kpis.pUp5d.ci95[1],
                          1,
                        )}`
                      : "—"
                  }`}
                />
                <KpiCard title="Retorno esperado 3D" value={formatPercent(analysis.kpis.expected3d)} />
                <KpiCard title="Worst-case 5D" value={formatPercent(analysis.kpis.worst5d)} tone="negative" />
                <KpiCard
                  title="CVaR 95% 5D"
                  value={formatPercent(analysis.kpis.cvar95_5d)}
                  tone="negative"
                  tooltip="Promedio condicional del 5% peor cola de retornos a 5 días."
                />
              </div>

              <HorizonTable data={analysis.horizonMetrics} />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border border-border/70 bg-panel px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Histograma por horizonte
                    </p>
                    <Tabs value={String(histogramHorizon)} onValueChange={(value) => setHistogramHorizon(Number(value))}>
                      <TabsList className="h-8">
                        {horizons.map((horizon) => (
                          <TabsTrigger key={horizon} value={String(horizon)} className="px-2 py-1 text-[11px]">
                            {horizon}D
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                  <ReturnHistogram values={histogramValues} horizon={histogramHorizon} />
                </div>

                <ForwardCurveChart data={analysis.forwardCurve} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Heatmap Umbral vs Horizonte</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="w-full min-w-[480px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border/80">
                          <th className="px-2 py-2 text-left text-muted">Umbral %</th>
                          {analysis.horizons.map((horizon) => (
                            <th key={horizon} className="px-2 py-2 text-left text-muted">
                              {horizon}D
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapThresholds.map((threshold) => (
                          <tr key={threshold} className="border-b border-border/60">
                            <td className="px-2 py-2 font-mono">{threshold.toFixed(2)}%</td>
                            {analysis.horizons.map((horizon) => {
                              const cell = heatmapLookup.get(`${threshold}-${horizon}`);
                              const probability = cell?.pUp ?? null;
                              return (
                                <td key={`${threshold}-${horizon}`} className="px-2 py-2">
                                  <div
                                    className={`rounded-sm px-2 py-1 font-mono ${heatColor(probability)}`}
                                    title={`N=${cell?.n ?? 0}`}
                                  >
                                    {formatPercent(probability, 1)}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Color basado en P(Up): rojo (&lt;40%), neutro (~50%), verde (&gt;60%).
                  </p>
                </CardContent>
              </Card>

              <RegimeTable rows={analysis.regimeBreakdown} />
            </div>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">Today Screener</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Watchlist fija; detecta evento en el último día y rankea por {inputs.screenerRankBy}.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Radar className="h-4 w-4" />
                Top 10
              </div>
            </CardHeader>
            <CardContent>
              {screenerLoading ? <ScreenerLoadingSkeleton /> : null}
              {screenerError ? (
                <div className="flex items-center gap-2 text-sm text-danger">
                  <AlertTriangle className="h-4 w-4" />
                  {screenerError}
                </div>
              ) : null}
              {!screenerLoading && !screenerError ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Fecha Evento</TableHead>
                      <TableHead>Ret Evento</TableHead>
                      <TableHead>P(Up 1D)</TableHead>
                      <TableHead>EV 3D</TableHead>
                      <TableHead>N</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {screenerRows.map((row) => (
                      <TableRow key={row.ticker}>
                        <TableCell className="font-mono">{row.ticker}</TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell className={row.eventReturn < 0 ? "text-danger" : "text-success"}>
                          {formatPercent(row.eventReturn)}
                        </TableCell>
                        <TableCell>{formatPercent(row.pUp1d)}</TableCell>
                        <TableCell>{formatPercent(row.ev3d)}</TableCell>
                        <TableCell className="font-mono">{row.n}</TableCell>
                      </TableRow>
                    ))}
                    {!screenerRows.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted">
                          No hubo eventos en el último día para la watchlist por el umbral actual.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-panel/40">
            <CardContent className="flex items-center gap-2 py-3 text-xs text-muted">
              <Database className="h-3.5 w-3.5" />
              Fuente exclusiva: Yahoo Finance (daily OHLCV).
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
