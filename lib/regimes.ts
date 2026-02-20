import {
  PriceBar,
  TrendRegime,
  VolRegime,
  VolumeShockRegime,
} from "@/lib/types";
import { isFiniteNumber, percentile, stdDev } from "@/lib/stats";

const SLOPE_LOOKBACK_DAYS = 20;

export interface RegimeFeatures {
  ma: Array<number | null>;
  maSlope: Array<number | null>;
  rv: Array<number | null>;
  volumeZ: Array<number | null>;
  rvP20: number | null;
  rvP80: number | null;
}

function rollingMean(values: number[], window: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  if (window <= 1) {
    return values.map((value) => value);
  }

  for (let index = window - 1; index < values.length; index += 1) {
    const slice = values.slice(index - window + 1, index + 1);
    const total = slice.reduce((acc, value) => acc + value, 0);
    result[index] = total / window;
  }

  return result;
}

function rollingStd(values: Array<number | null>, window: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  if (window <= 1) {
    return values.map((value) => (isFiniteNumber(value) ? 0 : null));
  }

  for (let index = window - 1; index < values.length; index += 1) {
    const slice = values.slice(index - window + 1, index + 1);
    if (slice.some((value) => !isFiniteNumber(value))) {
      continue;
    }

    result[index] = stdDev(slice as number[]);
  }

  return result;
}

export function computeCloseToCloseReturns(bars: PriceBar[]): Array<number | null> {
  if (!bars.length) {
    return [];
  }

  const result: Array<number | null> = Array(bars.length).fill(null);
  for (let index = 1; index < bars.length; index += 1) {
    const previousClose = bars[index - 1].close;
    const currentClose = bars[index].close;

    if (!previousClose || !currentClose) {
      result[index] = null;
      continue;
    }

    result[index] = currentClose / previousClose - 1;
  }

  return result;
}

export function buildRegimeFeatures(
  bars: PriceBar[],
  closeReturns: Array<number | null>,
  options: {
    windowVolDays: number;
    trendMA: number;
    volumeZWindow: number;
  },
): RegimeFeatures {
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);

  const ma = rollingMean(closes, Math.max(2, options.trendMA));
  const maSlope = ma.map((value, index) => {
    const pastIndex = index - SLOPE_LOOKBACK_DAYS;
    if (value === null || pastIndex < 0 || ma[pastIndex] === null) {
      return null;
    }

    return value - (ma[pastIndex] as number);
  });

  const rvRaw = rollingStd(closeReturns, Math.max(2, options.windowVolDays));
  const rv = rvRaw.map((value) => (isFiniteNumber(value) ? value * Math.sqrt(252) : null));
  const rvValues = rv.filter(isFiniteNumber);
  const rvP20 = percentile(rvValues, 0.2);
  const rvP80 = percentile(rvValues, 0.8);

  const volumeMean = rollingMean(volumes, Math.max(2, options.volumeZWindow));
  const volumeStd = rollingStd(volumes, Math.max(2, options.volumeZWindow));
  const volumeZ = volumes.map((volume, index) => {
    const mu = volumeMean[index];
    const sigma = volumeStd[index];
    if (!isFiniteNumber(mu) || !isFiniteNumber(sigma) || sigma <= 0) {
      return null;
    }

    return (volume - mu) / sigma;
  });

  return {
    ma,
    maSlope,
    rv,
    volumeZ,
    rvP20,
    rvP80,
  };
}

export function classifyTrend(maSlope: number | null): TrendRegime {
  if (!isFiniteNumber(maSlope)) {
    return "downtrend";
  }

  return maSlope > 0 ? "uptrend" : "downtrend";
}

export function classifyVolRegime(
  rv: number | null,
  rvP20: number | null,
  rvP80: number | null,
): VolRegime {
  if (!isFiniteNumber(rv) || !isFiniteNumber(rvP20) || !isFiniteNumber(rvP80)) {
    return "mid";
  }

  if (rv > rvP80) {
    return "high";
  }
  if (rv < rvP20) {
    return "low";
  }
  return "mid";
}

export function classifyVolumeShock(volumeZ: number | null): VolumeShockRegime {
  if (!isFiniteNumber(volumeZ)) {
    return "normal";
  }

  return volumeZ > 2 ? "shock" : "normal";
}
