import yahooFinance from "yahoo-finance2";
import { z } from "zod";
import { PriceBar, RangeOption } from "@/lib/types";

const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

type CacheEntry = {
  value: PriceBar[];
  expiresAt: number;
};

const globalCache = globalThis as typeof globalThis & {
  __shockLabPriceCache?: Map<string, CacheEntry>;
};

const priceCache = globalCache.__shockLabPriceCache ?? new Map<string, CacheEntry>();
globalCache.__shockLabPriceCache = priceCache;

export const tickerSchema = z
  .string()
  .trim()
  .min(1, "Ticker requerido")
  .max(20, "Ticker demasiado largo")
  .regex(/^[A-Za-z0-9.\-^=]+$/, "Ticker invalido")
  .transform((value) => value.toUpperCase());

export const rangeSchema = z.enum(["1y", "2y", "5y", "10y", "max"]);

const rangeToDays: Record<RangeOption, number | null> = {
  "1y": 380,
  "2y": 760,
  "5y": 1900,
  "10y": 3800,
  max: null,
};

interface YahooHistoricalRow {
  date?: Date | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  adjClose?: number | null;
  volume?: number | null;
}

interface YahooChartQuote {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
}

interface YahooChartAdjClose {
  adjclose?: Array<number | null>;
}

interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: YahooChartQuote[];
    adjclose?: YahooChartAdjClose[];
  };
}

interface YahooChartPayload {
  chart?: {
    result?: YahooChartResult[];
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
}

function resolvePeriodStart(range: RangeOption): Date {
  const days = rangeToDays[range];
  if (days === null) {
    return new Date("1970-01-01T00:00:00.000Z");
  }

  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function sanitizeNumber(value: number | null | undefined, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeBars(rows: YahooHistoricalRow[]): PriceBar[] {
  return rows
    .filter((row) => row.date && row.close !== null)
    .map((row) => {
      const close = Number(row.close ?? 0);
      const dateObj = row.date instanceof Date ? row.date : new Date(String(row.date));

      return {
        date: dateObj.toISOString().slice(0, 10),
        open: sanitizeNumber(row.open, close),
        high: sanitizeNumber(row.high, close),
        low: sanitizeNumber(row.low, close),
        close,
        adjClose: sanitizeNumber(row.adjClose, close),
        volume: sanitizeNumber(row.volume, 0),
      };
    })
    .filter(
      (row) =>
        Number.isFinite(row.close) &&
        row.close > 0 &&
        Number.isFinite(new Date(row.date).getTime()),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeChartBars(payload: YahooChartPayload, ticker: string): PriceBar[] {
  const chart = payload.chart;
  if (!chart) {
    throw new Error("Respuesta chart sin nodo chart.");
  }

  if (chart.error) {
    throw new Error(
      chart.error.description || chart.error.code || "Yahoo chart devolvio un error.",
    );
  }

  const result = chart.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const adjClose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];

  if (!timestamps.length || !quote?.close?.length) {
    throw new Error(`Yahoo chart sin datos para ${ticker}.`);
  }

  const bars: PriceBar[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = timestamps[index];
    const close = quote.close?.[index];
    if (!Number.isFinite(close) || close === null || close <= 0) {
      continue;
    }

    const dateObj = new Date(timestamp * 1000);
    if (!Number.isFinite(dateObj.getTime())) {
      continue;
    }

    const normalizedClose = Number(close);
    bars.push({
      date: dateObj.toISOString().slice(0, 10),
      open: sanitizeNumber(quote.open?.[index], normalizedClose),
      high: sanitizeNumber(quote.high?.[index], normalizedClose),
      low: sanitizeNumber(quote.low?.[index], normalizedClose),
      close: normalizedClose,
      adjClose: sanitizeNumber(adjClose[index], normalizedClose),
      volume: sanitizeNumber(quote.volume?.[index], 0),
    });
  }

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

function readCache(key: string): PriceBar[] | null {
  const hit = priceCache.get(key);
  if (!hit) {
    return null;
  }

  if (hit.expiresAt <= Date.now()) {
    priceCache.delete(key);
    return null;
  }

  return hit.value;
}

function writeCache(key: string, value: PriceBar[], ttlMs: number): void {
  priceCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function looksLikeInvalidTicker(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("symbol may be delisted") ||
    lower.includes("no data") ||
    lower.includes("invalid ticker") ||
    lower.includes("not exist")
  );
}

async function fetchChartFallback(ticker: string, range: RangeOption): Promise<PriceBar[]> {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(
    ticker,
  )}?range=${range}&interval=1d&events=div,split&includePrePost=false`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 ShockLab/1.0",
      Accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${body.slice(0, 100)}`);
  }

  let payload: YahooChartPayload;
  try {
    payload = JSON.parse(body) as YahooChartPayload;
  } catch {
    throw new Error(`Respuesta no JSON del endpoint chart: ${body.slice(0, 100)}`);
  }

  const bars = normalizeChartBars(payload, ticker);
  if (!bars.length) {
    throw new Error(`Yahoo chart no devolvio barras validas para ${ticker}.`);
  }

  return bars;
}

export async function getHistoricalPrices(params: {
  ticker: string;
  range?: RangeOption;
  ttlMs?: number;
}): Promise<PriceBar[]> {
  const ticker = tickerSchema.parse(params.ticker);
  const range = rangeSchema.parse(params.range ?? "5y");
  const ttlMs = params.ttlMs ?? PRICE_CACHE_TTL_MS;

  const cacheKey = `prices:${ticker}:${range}`;
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  let primaryErrorMessage = "";
  try {
    const rows = (await yahooFinance.historical(ticker, {
      period1: resolvePeriodStart(range),
      period2: new Date(),
      interval: "1d",
    })) as YahooHistoricalRow[];

    const bars = normalizeBars(rows);
    if (!bars.length) {
      throw new Error(`Yahoo no devolvio datos para ${ticker}.`);
    }

    writeCache(cacheKey, bars, ttlMs);
    return bars;
  } catch (error) {
    primaryErrorMessage =
      error instanceof Error ? error.message : "No se pudo consultar yahoo-finance2.";
  }

  try {
    const fallbackBars = await fetchChartFallback(ticker, range);
    writeCache(cacheKey, fallbackBars, ttlMs);
    return fallbackBars;
  } catch (fallbackError) {
    const fallbackMessage =
      fallbackError instanceof Error ? fallbackError.message : "Fallo endpoint chart.";
    const combined = `${primaryErrorMessage} | ${fallbackMessage}`;

    if (looksLikeInvalidTicker(combined)) {
      throw new Error(`Ticker invalido o sin historico disponible: ${ticker}.`);
    }

    throw new Error(
      `Error consultando Yahoo Finance. wrapper: ${primaryErrorMessage}. chart fallback: ${fallbackMessage}`,
    );
  }
}
