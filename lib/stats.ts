export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function mean(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return values.reduce((acc, current) => acc + current, 0) / values.length;
}

export function minimum(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return Math.min(...values);
}

export function maximum(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  return Math.max(...values);
}

export function stdDev(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const avg = mean(values);
  if (avg === null) {
    return null;
  }

  const variance =
    values.reduce((acc, value) => acc + (value - avg) * (value - avg), 0) / (values.length - 1);

  return Math.sqrt(variance);
}

export function percentile(values: number[], q: number): number | null {
  if (!values.length) {
    return null;
  }

  if (q <= 0) {
    return minimum(values);
  }

  if (q >= 1) {
    return maximum(values);
  }

  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.959963984540054,
): [number, number] | null {
  if (n <= 0) {
    return null;
  }

  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin =
    (z / denominator) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function cvar(values: number[], alpha = 0.95): number | null {
  if (!values.length) {
    return null;
  }

  const tailCut = percentile(values, 1 - alpha);
  if (tailCut === null) {
    return null;
  }

  const tail = values.filter((value) => value <= tailCut);
  return mean(tail);
}
