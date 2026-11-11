import { cvar, isFiniteNumber, mean, median, percentile, wilsonInterval } from "@/lib/stats";
import { PriceBar } from "@/lib/types";

/** D = ruedas, W = semanas (cierre del último día hábil), M = meses. */
export type Frecuencia = "D" | "W" | "M";
export type Sentido = "baja" | "suba";

export interface Barra {
  date: string; // fecha del último día del período
  start: string; // primer día del período
  open: number;
  high: number;
  low: number;
  close: number; // cierre ajustado (dividendos y splits)
}

export const UNIDAD: Record<Frecuencia, { una: string; varias: string; corta: string }> = {
  D: { una: "rueda", varias: "ruedas", corta: "r" },
  W: { una: "semana", varias: "semanas", corta: "s" },
  M: { una: "mes", varias: "meses", corta: "m" },
};

export const HORIZONTES: Record<Frecuencia, number[]> = {
  D: [1, 2, 3, 5, 10, 20],
  W: [1, 2, 4, 8, 13, 26],
  M: [1, 2, 3, 6, 12],
};

/** Ventana para MAE/MFE: peor caída y mejor suba dentro de las próximas N barras. */
export const VENTANA_EXCURSION: Record<Frecuencia, number> = { D: 10, W: 8, M: 6 };

/** Ventana de volatilidad para medir las rachas en desvíos. */
export const VENTANA_VOL: Record<Frecuencia, number> = { D: 20, W: 13, M: 12 };

/** Desvío de los retornos logarítmicos de las `w` barras que terminan en t (null si no alcanza). */
export function sigmas(barras: Barra[], w: number): Array<number | null> {
  const r = barras.map((b, i) => (i === 0 ? 0 : Math.log(b.close / barras[i - 1].close)));
  const out: Array<number | null> = new Array(barras.length).fill(null);
  let s = 0;
  let s2 = 0;
  for (let i = 1; i < barras.length; i += 1) {
    s += r[i];
    s2 += r[i] * r[i];
    if (i > w) {
      s -= r[i - w];
      s2 -= r[i - w] * r[i - w];
    }
    if (i >= w) {
      const m = s / w;
      const v = (s2 - w * m * m) / (w - 1);
      out[i] = v > 0 ? Math.sqrt(v) : null;
    }
  }
  return out;
}

/** Variación de la racha entre `inicio` e `i` en desvíos: ln(c_i/c_inicio) / (σ·√largo), con σ medido antes de que empiece. */
export function zRacha(barras: Barra[], sig: Array<number | null>, inicio: number, i: number): number | null {
  const s = sig[inicio];
  const k = i - inicio;
  if (!s || k <= 0) return null;
  return Math.log(barras[i].close / barras[inicio].close) / (s * Math.sqrt(k));
}

// ---------------------------------------------------------------------------
// Re-muestreo

function claveSemana(fecha: string): string {
  // Lunes de la semana ISO, en UTC, para agrupar.
  const d = new Date(`${fecha}T00:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

/**
 * Yahoo trae aperturas y extremos falsos en historia vieja de papeles locales (p. ej. mínimos de 3,75
 * repetidos en 2002 con cierres de 4,60). Un extremo que se aleja más de 15% del cierre del día y del
 * anterior a la vez se descarta; la apertura, igual. Así no se disparan stops que nunca existieron.
 */
function limpiarOHLC(barras: Barra[]): void {
  const TOPE = 0.15;
  for (let i = 0; i < barras.length; i += 1) {
    const b = barras[i];
    const prev = i > 0 ? barras[i - 1].close : b.close;
    const lejos = (x: number) => Math.abs(x / b.close - 1) > TOPE && Math.abs(x / prev - 1) > TOPE;
    if (lejos(b.open)) b.open = prev;
    const piso = Math.min(b.close, prev, b.open);
    const techo = Math.max(b.close, prev, b.open);
    if (b.low < piso * (1 - TOPE)) b.low = Math.min(b.close, b.open);
    if (b.high > techo * (1 + TOPE)) b.high = Math.max(b.close, b.open);
    b.low = Math.min(b.low, b.open, b.close);
    b.high = Math.max(b.high, b.open, b.close);
  }
}

export function remuestrear(bars: PriceBar[], frecuencia: Frecuencia): Barra[] {
  // Ajusta OHLC por el factor adjClose/close para que todo quede en la misma base.
  const ajustadas: Barra[] = bars
    .filter((b) => b.close > 0 && b.adjClose > 0)
    .map((b) => {
      const f = b.adjClose / b.close;
      return {
        date: b.date,
        start: b.date,
        open: (b.open > 0 ? b.open : b.close) * f,
        high: (b.high > 0 ? b.high : b.close) * f,
        low: (b.low > 0 ? b.low : b.close) * f,
        close: b.adjClose,
      };
    });
  limpiarOHLC(ajustadas);
  if (frecuencia === "D") return ajustadas;

  const clave = frecuencia === "W" ? claveSemana : (fecha: string) => fecha.slice(0, 7);
  const salida: Barra[] = [];
  let actual: Barra | null = null;
  let claveActual = "";
  for (const b of ajustadas) {
    const k = clave(b.date);
    if (!actual || k !== claveActual) {
      if (actual) salida.push(actual);
      actual = { ...b };
      claveActual = k;
    } else {
      actual.date = b.date;
      actual.high = Math.max(actual.high, b.high);
      actual.low = Math.min(actual.low, b.low);
      actual.close = b.close;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

// ---------------------------------------------------------------------------
// Rachas

/** Largo con signo de la racha que termina en cada barra: +3 = tercera suba seguida. Una barra sin cambio corta la racha (0). */
export function largos(barras: Barra[]): number[] {
  const L = new Array<number>(barras.length).fill(0);
  for (let i = 1; i < barras.length; i += 1) {
    const r = barras[i].close / barras[i - 1].close - 1;
    if (r > 0) L[i] = L[i - 1] > 0 ? L[i - 1] + 1 : 1;
    else if (r < 0) L[i] = L[i - 1] < 0 ? L[i - 1] - 1 : -1;
    else L[i] = 0;
  }
  return L;
}

export interface Racha {
  sentido: Sentido;
  inicio: number; // índice de la barra previa a la primera de la racha (base de la variación)
  fin: number; // índice de la última barra de la racha
  largo: number;
  variacion: number; // close[fin] / close[inicio] - 1
}

export function rachas(barras: Barra[], L: number[]): Racha[] {
  const salida: Racha[] = [];
  for (let i = 1; i < barras.length; i += 1) {
    const termina = L[i] !== 0 && (i === barras.length - 1 || Math.sign(L[i + 1]) !== Math.sign(L[i]));
    if (!termina) continue;
    const largo = Math.abs(L[i]);
    const inicio = i - largo;
    salida.push({
      sentido: L[i] > 0 ? "suba" : "baja",
      inicio,
      fin: i,
      largo,
      variacion: barras[i].close / barras[inicio].close - 1,
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Estadística por horizonte

export interface Metricas {
  n: number;
  pSuba: number | null;
  ic: [number, number] | null;
  media: number | null;
  mediana: number | null;
  p10: number | null;
  p90: number | null;
  peor: number | null;
  cvar95: number | null;
}

export function metricas(valores: number[]): Metricas {
  const v = valores.filter(isFiniteNumber);
  const sube = v.filter((x) => x > 0).length;
  return {
    n: v.length,
    pSuba: v.length ? sube / v.length : null,
    ic: wilsonInterval(sube, v.length),
    media: mean(v),
    mediana: median(v),
    p10: percentile(v, 0.1),
    p90: percentile(v, 0.9),
    peor: v.length ? Math.min(...v) : null,
    cvar95: cvar(v, 0.95),
  };
}

function adelante(barras: Barra[], i: number, h: number): number | null {
  const j = i + h;
  if (j >= barras.length) return null;
  return barras[j].close / barras[i].close - 1;
}

/** Peor mínimo y mejor máximo de las próximas N barras contra el cierre de la barra i. */
function excursion(barras: Barra[], i: number, n: number): { mae: number | null; mfe: number | null } {
  if (i + 1 >= barras.length) return { mae: null, mfe: null };
  const hasta = Math.min(barras.length - 1, i + n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = i + 1; j <= hasta; j += 1) {
    lo = Math.min(lo, barras[j].low);
    hi = Math.max(hi, barras[j].high);
  }
  return { mae: lo / barras[i].close - 1, mfe: hi / barras[i].close - 1 };
}

// ---------------------------------------------------------------------------
// Estudio de la racha actual

export interface Ocurrencia {
  i: number; // barra en la que la racha llegó a k
  fechaInicio: string;
  fecha: string;
  variacionK: number; // variación acumulada hasta llegar a k
  largoFinal: number;
  variacionFinal: number;
  fwd: Record<number, number | null>;
  mae: number | null;
  mfe: number | null;
  barraQueCorta: number | null; // variación de la barra que cortó la racha
  zK: number | null; // intensidad de la racha al llegar a k, en desvíos
  parecida: boolean;
}

export interface FilaSupervivencia {
  largo: number;
  llegan: number;
  prob: number | null; // P(llegar a este largo | llegó a k)
  ic: [number, number] | null;
}

export interface EstudioRacha {
  frecuencia: Frecuencia;
  barras: number;
  desde: string;
  hasta: string;
  ultimoCierre: number;
  sentido: Sentido | null;
  k: number;
  variacionActual: number | null;
  zActual: number | null;
  percentilZ: number | null; // % de las ocurrencias con una racha menos intensa que la de hoy
  horizontes: number[];
  barrasR: Barra[];
  baseFwd: Record<number, number[]>;
  ocurrencias: Ocurrencia[];
  todas: Record<number, Metricas>;
  parecidas: Record<number, Metricas>;
  base: Record<number, Metricas>;
  baseMae: number | null;
  maeTodas: number | null;
  mfeTodas: number | null;
  supervivencia: FilaSupervivencia[];
  largoEsperado: number | null; // largo final medio, dado que llegó a k
  percentilLargo: number | null; // % de rachas del mismo sentido que fueron más cortas que k
  maxHistorico: { largo: number; fecha: string; variacion: number } | null;
  rachasMismoSentido: number;
  corteMedia: number | null; // variación media de la barra que corta
}

export interface OpcionesEstudio {
  frecuencia: Frecuencia;
  /** Si se pasa, estudia esta racha en vez de la actual. Signo: negativo = baja. */
  kForzado?: number;
  /** Intensidad parecida: |z de la ocurrencia − z de hoy| ≤ toleranciaZ. */
  toleranciaZ?: number;
}

export function estudiarRacha(bars: PriceBar[], opciones: OpcionesEstudio): EstudioRacha | null {
  const { frecuencia, kForzado, toleranciaZ = 0.75 } = opciones;
  const barras = remuestrear(bars, frecuencia);
  if (barras.length < 30) return null;
  const L = largos(barras);
  const ultimo = barras.length - 1;
  const signo = kForzado !== undefined ? Math.sign(kForzado) : Math.sign(L[ultimo]);
  const k = kForzado !== undefined ? Math.abs(kForzado) : Math.abs(L[ultimo]);
  const horizontes = HORIZONTES[frecuencia];
  const ventana = VENTANA_EXCURSION[frecuencia];
  const lista = rachas(barras, L);

  const sig = sigmas(barras, VENTANA_VOL[frecuencia]);
  const base: Record<number, Metricas> = {};
  const baseFwd: Record<number, number[]> = {};
  for (const h of horizontes) {
    const v: number[] = [];
    for (let i = 1; i < ultimo; i += 1) {
      const x = adelante(barras, i, h);
      if (x !== null) v.push(x);
    }
    base[h] = metricas(v);
    baseFwd[h] = v;
  }
  const maesBase: number[] = [];
  for (let i = 1; i + ventana <= ultimo; i += 1) {
    const e = excursion(barras, i, ventana);
    if (e.mae !== null) maesBase.push(e.mae);
  }

  const vacio: EstudioRacha = {
    frecuencia,
    barras: barras.length,
    desde: barras[0].date,
    hasta: barras[ultimo].date,
    ultimoCierre: barras[ultimo].close,
    sentido: signo > 0 ? "suba" : signo < 0 ? "baja" : null,
    k,
    variacionActual: null,
    zActual: null,
    percentilZ: null,
    horizontes,
    barrasR: barras,
    baseFwd,
    ocurrencias: [],
    todas: {},
    parecidas: {},
    base,
    baseMae: mean(maesBase),
    maeTodas: null,
    mfeTodas: null,
    supervivencia: [],
    largoEsperado: null,
    percentilLargo: null,
    maxHistorico: null,
    rachasMismoSentido: 0,
    corteMedia: null,
  };
  if (signo === 0 || k === 0) return vacio;

  const sentido: Sentido = signo > 0 ? "suba" : "baja";
  const variacionActual =
    kForzado === undefined && ultimo - k >= 0 ? barras[ultimo].close / barras[ultimo - k].close - 1 : null;
  const zActual = kForzado === undefined && ultimo - k >= 0 ? zRacha(barras, sig, ultimo - k, ultimo) : null;

  const mismoSentido = lista.filter((r) => r.sentido === sentido);
  // La racha actual todavía no terminó: no cuenta como ocurrencia ni para la supervivencia.
  const cerradas = mismoSentido.filter((r) => r.fin < ultimo);
  const llegan = cerradas.filter((r) => r.largo >= k);

  const ocurrencias: Ocurrencia[] = llegan
    .map((r) => {
      const i = r.inicio + k;
      const variacionK = barras[i].close / barras[r.inicio].close - 1;
      const fwd: Record<number, number | null> = {};
      for (const h of horizontes) fwd[h] = adelante(barras, i, h);
      const ex = excursion(barras, i, ventana);
      const corta = r.fin + 1 <= ultimo ? barras[r.fin + 1].close / barras[r.fin].close - 1 : null;
      const zK = zRacha(barras, sig, r.inicio, i);
      const parecida = zActual !== null ? zK !== null && Math.abs(zK - zActual) <= toleranciaZ : true;
      return {
        i,
        fechaInicio: barras[r.inicio + 1].start,
        fecha: barras[i].date,
        variacionK,
        largoFinal: r.largo,
        variacionFinal: r.variacion,
        fwd,
        mae: ex.mae,
        mfe: ex.mfe,
        barraQueCorta: corta,
        zK,
        parecida,
      };
    })
    .reverse();

  const todas: Record<number, Metricas> = {};
  const parecidas: Record<number, Metricas> = {};
  for (const h of horizontes) {
    todas[h] = metricas(ocurrencias.map((o) => o.fwd[h]).filter(isFiniteNumber));
    parecidas[h] = metricas(ocurrencias.filter((o) => o.parecida).map((o) => o.fwd[h]).filter(isFiniteNumber));
  }

  const maxLargo = Math.max(k, ...cerradas.map((r) => r.largo));
  const supervivencia: FilaSupervivencia[] = [];
  for (let j = k + 1; j <= Math.min(maxLargo, k + 8); j += 1) {
    const c = llegan.filter((r) => r.largo >= j).length;
    supervivencia.push({
      largo: j,
      llegan: c,
      prob: llegan.length ? c / llegan.length : null,
      ic: wilsonInterval(c, llegan.length),
    });
  }

  const max = mismoSentido.reduce<Racha | null>((m, r) => (!m || r.largo > m.largo ? r : m), null);

  return {
    ...vacio,
    sentido,
    variacionActual,
    zActual,
    percentilZ:
      zActual !== null && ocurrencias.length
        ? ocurrencias.filter((o) => o.zK !== null && Math.abs(o.zK) < Math.abs(zActual)).length / ocurrencias.length
        : null,
    ocurrencias,
    todas,
    parecidas,
    maeTodas: mean(ocurrencias.map((o) => o.mae).filter(isFiniteNumber)),
    mfeTodas: mean(ocurrencias.map((o) => o.mfe).filter(isFiniteNumber)),
    supervivencia,
    largoEsperado: mean(llegan.map((r) => r.largo)),
    percentilLargo: cerradas.length ? cerradas.filter((r) => r.largo < k).length / cerradas.length : null,
    maxHistorico: max ? { largo: max.largo, fecha: barras[max.fin].date, variacion: max.variacion } : null,
    rachasMismoSentido: cerradas.length,
    corteMedia: mean(ocurrencias.map((o) => o.barraQueCorta).filter(isFiniteNumber)),
  };
}
