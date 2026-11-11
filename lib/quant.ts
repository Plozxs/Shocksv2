import { isFiniteNumber, mean } from "@/lib/stats";
import {
  Barra,
  estudiarRacha,
  Frecuencia,
  HORIZONTES,
  largos,
  metricas,
  Metricas,
  sigmas,
  VENTANA_VOL,
  zRacha,
} from "@/lib/streaks";
import { PriceBar } from "@/lib/types";

// ---------------------------------------------------------------------------
// Utilidades

/** Generador reproducible: el mismo papel da siempre el mismo p-valor. */
export function rng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Costo de ida y vuelta por defecto: acciones locales (comisión + derechos) vs. mercado de EE.UU. */
export function costoPorDefecto(ticker: string): number {
  return ticker.toUpperCase().endsWith(".BA") ? 0.006 : 0.001;
}

// ---------------------------------------------------------------------------
// 1. ¿La racha agrega información? Test contra la base

export interface TestVentaja {
  h: number;
  n: number;
  media: number | null;
  mediaBase: number | null;
  ventaja: number | null; // media de la muestra − media de cualquier día
  neta: number | null; // lo que dejaba operar en la dirección de la ventaja, menos costos
  p: number | null; // bootstrap a dos colas
  pAjustado: number | null; // Holm sobre todos los horizontes
  significativa: boolean;
}

/**
 * Hipótesis nula: la racha no dice nada y sus n retornos son n días cualquiera.
 * Se sortean B muestras de n días de la base y se mira qué tan seguido la media
 * se aleja de la base tanto como la de la racha.
 */
export function bootstrapP(muestra: number[], base: number[], B = 2000, semilla = 7): number | null {
  const n = muestra.length;
  if (n < 5 || base.length < 50) return null;
  const mb = mean(base) as number;
  const obs = Math.abs((mean(muestra) as number) - mb);
  if (n > 300) {
    // Con muestras grandes el bootstrap converge a la normal: mismo resultado, mil veces más rápido.
    const sd = Math.sqrt(base.reduce((a, x) => a + (x - mb) ** 2, 0) / (base.length - 1));
    return 2 * (1 - normalCDF(obs / (sd / Math.sqrt(n))));
  }
  const r = rng(semilla + n * 31);
  let extremos = 0;
  for (let b = 0; b < B; b += 1) {
    let s = 0;
    for (let j = 0; j < n; j += 1) s += base[Math.floor(r() * base.length)];
    if (Math.abs(s / n - mb) >= obs) extremos += 1;
  }
  return (extremos + 1) / (B + 1);
}

function normalCDF(x: number): number {
  // Abramowitz y Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function holm(ps: Array<number | null>): Array<number | null> {
  const idx = ps.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p !== null);
  idx.sort((a, b) => a.p - b.p);
  const m = idx.length;
  const out: Array<number | null> = ps.map(() => null);
  let previo = 0;
  idx.forEach((x, rank) => {
    const adj = Math.min(1, Math.max(previo, (m - rank) * x.p));
    previo = adj;
    out[x.i] = adj;
  });
  return out;
}

export function testHorizontes(
  muestras: Record<number, number[]>,
  base: Record<number, number[]>,
  horizontes: number[],
  costo: number,
  semilla = 7,
): TestVentaja[] {
  const filas = horizontes.map((h) => {
    const v = (muestras[h] ?? []).filter(isFiniteNumber);
    const media = mean(v);
    const mediaBase = mean(base[h] ?? []);
    const ventaja = media !== null && mediaBase !== null ? media - mediaBase : null;
    const neta = media !== null && ventaja !== null ? Math.sign(ventaja) * media - costo : null;
    return { h, n: v.length, media, mediaBase, ventaja, neta, p: bootstrapP(v, base[h] ?? [], 2000, semilla + h) };
  });
  const adj = holm(filas.map((f) => f.p));
  return filas.map((f, i) => ({
    ...f,
    pAjustado: adj[i],
    significativa: adj[i] !== null && (adj[i] as number) < 0.05 && f.neta !== null && f.neta > 0,
  }));
}

// ---------------------------------------------------------------------------
// 3. Análogos: los días más parecidos a hoy

export const RASGOS = [
  { id: "racha", label: "Racha", peso: 1 },
  { id: "z", label: "Intensidad (σ)", peso: 1.5 },
  { id: "r5", label: "Retorno corto (σ)", peso: 1 },
  { id: "ma", label: "Distancia a la media larga", peso: 0.75 },
  { id: "vol", label: "Volatilidad vs. su normal", peso: 0.75 },
  { id: "gap", label: "Gap de apertura (σ)", peso: 0.5 },
] as const;
export type Rasgo = (typeof RASGOS)[number]["id"];

const MEDIA_LARGA: Record<Frecuencia, number> = { D: 200, W: 40, M: 10 };
const VOL_LARGA: Record<Frecuencia, number> = { D: 250, W: 52, M: 36 };
const CORTO: Record<Frecuencia, number> = { D: 5, W: 4, M: 3 };
const SEPARACION: Record<Frecuencia, number> = { D: 10, W: 4, M: 2 };
export const CANTIDAD_ANALOGOS: Record<Frecuencia, number> = { D: 30, W: 25, M: 15 };

export interface Analogo {
  i: number;
  fecha: string;
  distancia: number;
  rasgos: Record<Rasgo, number>;
  fwd: Record<number, number | null>;
}

export interface ResultadoAnalogos {
  hoy: Record<Rasgo, number> | null;
  lista: Analogo[];
  distanciaMedia: number | null;
  mismaRacha: number; // cuántos análogos tenían racha del mismo sentido
}

export function rasgosPorBarra(barras: Barra[], frecuencia: Frecuencia): Array<Record<Rasgo, number> | null> {
  const L = largos(barras);
  const sig = sigmas(barras, VENTANA_VOL[frecuencia]);
  const sigLargo = sigmas(barras, VOL_LARGA[frecuencia]);
  const nMa = MEDIA_LARGA[frecuencia];
  const corto = CORTO[frecuencia];
  const salida: Array<Record<Rasgo, number> | null> = new Array(barras.length).fill(null);
  let suma = 0;
  for (let t = 0; t < barras.length; t += 1) {
    suma += barras[t].close;
    if (t >= nMa) suma -= barras[t - nMa].close;
    const s = sig[t];
    const sl = sigLargo[t];
    if (t < Math.max(nMa, VOL_LARGA[frecuencia]) || !s || !sl) continue;
    const ma = suma / nMa;
    const k = Math.abs(L[t]);
    const z = k ? zRacha(barras, sig, t - k, t) ?? 0 : 0;
    salida[t] = {
      racha: Math.max(-10, Math.min(10, L[t])),
      z,
      r5: Math.log(barras[t].close / barras[t - corto].close) / (s * Math.sqrt(corto)),
      ma: Math.log(barras[t].close / ma),
      vol: Math.log(s / sl),
      gap: frecuencia === "D" ? Math.log(barras[t].open / barras[t - 1].close) / s : 0,
    };
  }
  return salida;
}

export function buscarAnalogos(barras: Barra[], frecuencia: Frecuencia, K?: number): ResultadoAnalogos {
  const rasgos = rasgosPorBarra(barras, frecuencia);
  const ultimo = barras.length - 1;
  const hoy = rasgos[ultimo];
  if (!hoy) return { hoy: null, lista: [], distanciaMedia: null, mismaRacha: 0 };

  // Escala de cada rasgo: su desvío en toda la historia.
  const escala = {} as Record<Rasgo, number>;
  for (const { id } of RASGOS) {
    const v = rasgos.filter((x): x is Record<Rasgo, number> => x !== null).map((x) => x[id]);
    const m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
    escala[id] = sd > 0 ? sd : 1;
  }

  const sep = SEPARACION[frecuencia];
  const candidatos: Array<{ i: number; d: number }> = [];
  for (let t = 0; t < ultimo - sep; t += 1) {
    const r = rasgos[t];
    if (!r) continue;
    let d = 0;
    for (const { id, peso } of RASGOS) d += peso * ((r[id] - hoy[id]) / escala[id]) ** 2;
    candidatos.push({ i: t, d: Math.sqrt(d) });
  }
  candidatos.sort((a, b) => a.d - b.d);

  // Separación mínima: que no sean días seguidos del mismo episodio.
  const cuantos = K ?? CANTIDAD_ANALOGOS[frecuencia];
  const elegidos: Array<{ i: number; d: number }> = [];
  for (const c of candidatos) {
    if (elegidos.every((e) => Math.abs(e.i - c.i) > sep)) elegidos.push(c);
    if (elegidos.length >= cuantos) break;
  }

  const horizontes = HORIZONTES[frecuencia];
  const lista: Analogo[] = elegidos
    .map(({ i, d }) => {
      const fwd: Record<number, number | null> = {};
      for (const h of horizontes) fwd[h] = i + h <= ultimo ? barras[i + h].close / barras[i].close - 1 : null;
      return { i, fecha: barras[i].date, distancia: d, rasgos: rasgos[i] as Record<Rasgo, number>, fwd };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    hoy,
    lista,
    distanciaMedia: mean(lista.map((a) => a.distancia)),
    mismaRacha: lista.filter((a) => Math.sign(a.rasgos.racha) === Math.sign(hoy.racha)).length,
  };
}

// ---------------------------------------------------------------------------
// 4. Stop y target: qué se toca primero

export type Lado = "compra" | "venta";

export interface CeldaBarrera {
  stop: number;
  target: number;
  n: number;
  pTarget: number; // tocó el target antes que el stop
  pStop: number;
  pNada: number; // ninguno dentro de la ventana: sale al cierre
  ev: number; // resultado esperado por operación, neto de costos
  evBase: number; // lo mismo entrando cualquier día
}

export const GRILLA: Record<Frecuencia, { stops: number[]; targets: number[] }> = {
  D: { stops: [0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1], targets: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15] },
  W: { stops: [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15], targets: [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3] },
  M: { stops: [0.03, 0.05, 0.07, 0.1, 0.12, 0.15, 0.2, 0.25], targets: [0.05, 0.08, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5] },
};

/**
 * Entra al cierre de la barra i y recorre las N siguientes.
 * Si una barra toca stop y target a la vez se cuenta como stop (no sabemos el orden).
 * Si abre más allá del nivel, se ejecuta a la apertura (el gap no perdona).
 */
function simular(barras: Barra[], i: number, stop: number, target: number, N: number, lado: Lado): { r: number; tipo: 0 | 1 | 2 } | null {
  const entrada = barras[i].close;
  const fin = Math.min(barras.length - 1, i + N);
  if (fin <= i) return null;
  const largo = lado === "compra";
  const nivelStop = largo ? entrada * (1 - stop) : entrada * (1 + stop);
  const nivelTarget = largo ? entrada * (1 + target) : entrada * (1 - target);
  const ret = (precio: number) => (largo ? precio / entrada - 1 : 1 - precio / entrada);
  for (let j = i + 1; j <= fin; j += 1) {
    const b = barras[j];
    const tocaStop = largo ? b.low <= nivelStop : b.high >= nivelStop;
    const tocaTarget = largo ? b.high >= nivelTarget : b.low <= nivelTarget;
    if (tocaStop) {
      const gap = largo ? b.open <= nivelStop : b.open >= nivelStop;
      return { r: ret(gap ? b.open : nivelStop), tipo: 2 };
    }
    if (tocaTarget) {
      const gap = largo ? b.open >= nivelTarget : b.open <= nivelTarget;
      return { r: ret(gap ? b.open : nivelTarget), tipo: 1 };
    }
  }
  if (fin < i + N) return null; // ventana incompleta: no se cuenta
  return { r: ret(barras[fin].close), tipo: 0 };
}

export function superficieBarreras(
  barras: Barra[],
  eventos: number[],
  frecuencia: Frecuencia,
  N: number,
  lado: Lado,
  costo: number,
): CeldaBarrera[] {
  const { stops, targets } = GRILLA[frecuencia];
  // Base: un día de cada 3 alcanza para estimarla y es tres veces más rápido.
  const baseIdx: number[] = [];
  for (let i = 1; i < barras.length - N; i += frecuencia === "D" ? 3 : 1) baseIdx.push(i);
  const celdas: CeldaBarrera[] = [];
  for (const stop of stops) {
    for (const target of targets) {
      let n = 0;
      let suma = 0;
      const tipos = [0, 0, 0];
      for (const i of eventos) {
        const r = simular(barras, i, stop, target, N, lado);
        if (!r) continue;
        n += 1;
        suma += r.r;
        tipos[r.tipo] += 1;
      }
      let nb = 0;
      let sb = 0;
      for (const i of baseIdx) {
        const r = simular(barras, i, stop, target, N, lado);
        if (!r) continue;
        nb += 1;
        sb += r.r;
      }
      celdas.push({
        stop,
        target,
        n,
        pTarget: n ? tipos[1] / n : 0,
        pStop: n ? tipos[2] / n : 0,
        pNada: n ? tipos[0] / n : 0,
        ev: n ? suma / n - costo : 0,
        evBase: nb ? sb / nb - costo : 0,
      });
    }
  }
  return celdas;
}

// ---------------------------------------------------------------------------
// Panel de la mañana

export interface FilaPanel {
  ticker: string;
  fecha: string;
  cierre: number;
  k: number; // con signo
  variacion: number | null;
  z: number | null;
  percentilLargo: number | null;
  percentilZ: number | null;
  n: number;
  h: number; // horizonte del test
  media: number | null;
  ventaja: number | null;
  pAjustado: number | null;
  significativa: boolean;
}

export function filaPanel(ticker: string, bars: PriceBar[], frecuencia: Frecuencia): FilaPanel | null {
  const e = estudiarRacha(bars, { frecuencia });
  if (!e) return null;
  const hs = HORIZONTES[frecuencia];
  const h = hs[frecuencia === "D" ? 3 : 2];
  const muestras: Record<number, number[]> = {};
  for (const x of hs) muestras[x] = e.ocurrencias.map((o) => o.fwd[x]).filter(isFiniteNumber);
  const tests = testHorizontes(muestras, e.baseFwd, hs, costoPorDefecto(ticker));
  const t = tests.find((x) => x.h === h);
  return {
    ticker,
    fecha: e.hasta,
    cierre: e.ultimoCierre,
    k: e.sentido === "baja" ? -e.k : e.k,
    variacion: e.variacionActual,
    z: e.zActual,
    percentilLargo: e.percentilLargo,
    percentilZ: e.percentilZ,
    n: e.ocurrencias.length,
    h,
    media: t?.media ?? null,
    ventaja: t?.ventaja ?? null,
    pAjustado: t?.pAjustado ?? null,
    significativa: tests.some((x) => x.significativa),
  };
}

export type { Metricas };
export { metricas };
