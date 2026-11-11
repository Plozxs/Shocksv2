const nf = (d: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function num(v: number | null | undefined, d = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return nf(d).format(v);
}

/** +12,3% con signo. */
export function pct(v: number | null | undefined, d = 1, signo = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const x = Number((v * 100).toFixed(d));
  if (x === 0) return `${nf(d).format(0)}%`;
  return `${signo && x > 0 ? "+" : ""}${nf(d).format(x)}%`;
}

/** 62% sin signo, para probabilidades. */
export function prob(v: number | null | undefined, d = 0): string {
  return pct(v, d, false);
}

export function fecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function plural(n: number, una: string, varias: string): string {
  return `${num(n)} ${n === 1 ? una : varias}`;
}

export function colorSigno(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "text-foreground";
  return v > 0 ? "text-success" : "text-danger";
}
