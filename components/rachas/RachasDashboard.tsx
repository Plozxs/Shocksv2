"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { EstudioRacha, estudiarRacha, Frecuencia, HORIZONTES, metricas, Metricas, UNIDAD, VENTANA_EXCURSION } from "@/lib/streaks";
import {
  buscarAnalogos,
  CeldaBarrera,
  costoPorDefecto,
  FilaPanel,
  Lado,
  RASGOS,
  ResultadoAnalogos,
  superficieBarreras,
  TestVentaja,
  testHorizontes,
} from "@/lib/quant";
import { isFiniteNumber } from "@/lib/stats";
import { colorSigno, fecha, num, pct, plural, prob } from "@/lib/formato";
import { PriceBar } from "@/lib/types";
import { Caja, celdaProb, CurvaAdelante, Fichas, Recorrido, Segmentado, Supervivencia } from "@/components/rachas/piezas";
import type { MetricaBarrera } from "@/components/three/Barreras3D";
import { valorBarrera } from "@/components/three/Barreras3D";

const Barreras3D = dynamic(() => import("@/components/three/Barreras3D"), { ssr: false });

const FRECUENCIAS: { id: Frecuencia; label: string }[] = [
  { id: "D", label: "Ruedas" },
  { id: "W", label: "Semanas" },
  { id: "M", label: "Meses" },
];

const SUGERIDOS = ["GGAL.BA", "YPFD.BA", "PAMP.BA", "BMA.BA", "TXAR.BA", "GGAL", "YPF", "SPY", "QQQ", "EWZ", "BTC-USD"];

const VENTANAS: Record<Frecuencia, number[]> = { D: [3, 5, 10, 20], W: [2, 4, 8, 13], M: [1, 3, 6] };

type Muestra = "rachas" | "parecidas" | "analogos";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sigma(z: number | null | undefined, d = 1): string {
  if (z === null || z === undefined || !Number.isFinite(z)) return "—";
  return `${z > 0 ? "+" : ""}${num(z, d)}σ`;
}

// ---------------------------------------------------------------------------

export default function RachasDashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [ticker, setTicker] = useState((params.get("t") ?? "GGAL.BA").toUpperCase());
  const [borrador, setBorrador] = useState(ticker);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(
    (["D", "W", "M"].includes(params.get("f") ?? "") ? params.get("f") : "D") as Frecuencia,
  );
  const [kManual, setKManual] = useState<number | null>(params.get("k") ? Number(params.get("k")) || null : null);
  const [ignorarHoy, setIgnorarHoy] = useState(params.get("cerradas") === "1");
  const [toleranciaZ, setToleranciaZ] = useState(0.75);
  const [costo, setCosto] = useState(costoPorDefecto(ticker));

  const [bars, setBars] = useState<PriceBar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const [panel, setPanel] = useState<FilaPanel[] | null>(null);
  const [panelCargando, setPanelCargando] = useState(false);

  const [muestraDetalle, setMuestraDetalle] = useState<Muestra>("rachas");
  const [muestraB, setMuestraB] = useState<Muestra>("rachas");
  const [lado, setLado] = useState<Lado>("compra");
  const [ventana, setVentana] = useState<number>(VENTANA_EXCURSION[frecuencia]);
  const [metricaB, setMetricaB] = useState<MetricaBarrera>("ev");
  const [verTodas, setVerTodas] = useState(false);

  useEffect(() => {
    setVentana(VENTANA_EXCURSION[frecuencia]);
  }, [frecuencia]);

  useEffect(() => {
    setCosto(costoPorDefecto(ticker));
  }, [ticker]);

  useEffect(() => {
    const q = new URLSearchParams();
    q.set("t", ticker);
    q.set("f", frecuencia);
    if (kManual) q.set("k", String(kManual));
    if (ignorarHoy) q.set("cerradas", "1");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [ticker, frecuencia, kManual, ignorarHoy, pathname, router]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    fetch(`/api/prices?ticker=${encodeURIComponent(ticker)}&range=max`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "No se pudieron traer los precios.");
        if (vivo) setBars(d.bars as PriceBar[]);
      })
      .catch((e: Error) => vivo && (setError(e.message), setBars(null)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [ticker, recarga]);

  useEffect(() => {
    let vivo = true;
    setPanelCargando(true);
    fetch(`/api/panel-rachas?frecuencia=${frecuencia}`)
      .then((r) => r.json())
      .then((d) => vivo && setPanel(d.filas as FilaPanel[]))
      .catch(() => vivo && setPanel(null))
      .finally(() => vivo && setPanelCargando(false));
    return () => {
      vivo = false;
    };
  }, [frecuencia, recarga]);

  const usadas = useMemo(() => {
    if (!bars) return null;
    if (ignorarHoy && bars.length && bars[bars.length - 1].date === hoyISO()) return bars.slice(0, -1);
    return bars;
  }, [bars, ignorarHoy]);

  const estudio = useMemo<EstudioRacha | null>(() => {
    if (!usadas) return null;
    return estudiarRacha(usadas, { frecuencia, kForzado: kManual ?? undefined, toleranciaZ });
  }, [usadas, frecuencia, kManual, toleranciaZ]);

  const analogos = useMemo<ResultadoAnalogos | null>(
    () => (estudio ? buscarAnalogos(estudio.barrasR, frecuencia) : null),
    [estudio, frecuencia],
  );

  const muestras = useMemo(() => {
    if (!estudio) return null;
    const porH = (fwds: Array<Record<number, number | null>>) => {
      const out: Record<number, number[]> = {};
      for (const h of estudio.horizontes) out[h] = fwds.map((f) => f[h]).filter(isFiniteNumber);
      return out;
    };
    const parecidas = estudio.ocurrencias.filter((o) => o.parecida);
    const lista = analogos?.lista ?? [];
    return {
      rachas: { ret: porH(estudio.ocurrencias.map((o) => o.fwd)), idx: estudio.ocurrencias.map((o) => o.i) },
      parecidas: { ret: porH(parecidas.map((o) => o.fwd)), idx: parecidas.map((o) => o.i) },
      analogos: { ret: porH(lista.map((a) => a.fwd)), idx: lista.map((a) => a.i) },
    } as Record<Muestra, { ret: Record<number, number[]>; idx: number[] }>;
  }, [estudio, analogos]);

  const tests = useMemo(() => {
    if (!estudio || !muestras) return null;
    const out = {} as Record<Muestra, TestVentaja[]>;
    (Object.keys(muestras) as Muestra[]).forEach((m, i) => {
      out[m] = testHorizontes(muestras[m].ret, estudio.baseFwd, estudio.horizontes, costo, 11 + i * 101);
    });
    return out;
  }, [estudio, muestras, costo]);

  const celdasB = useMemo<CeldaBarrera[]>(() => {
    if (!estudio || !muestras) return [];
    return superficieBarreras(estudio.barrasR, muestras[muestraB].idx, frecuencia, ventana, lado, costo);
  }, [estudio, muestras, muestraB, frecuencia, ventana, lado, costo]);

  const mejorB = useMemo(() => {
    const validas = celdasB.filter((c) => c.n >= 10);
    if (!validas.length) return null;
    return validas.reduce((m, c) => (valorBarrera(c, metricaB) > valorBarrera(m, metricaB) ? c : m));
  }, [celdasB, metricaB]);

  const cambiarTicker = (t: string) => {
    const limpio = t.trim().toUpperCase();
    if (!limpio) return;
    setKManual(null);
    setTicker(limpio);
    setBorrador(limpio);
  };

  const u = UNIDAD[frecuencia];
  const nombreMuestra: Record<Muestra, string> = estudio
    ? { rachas: `Rachas de ${estudio.k}`, parecidas: "Intensidad parecida", analogos: "Análogos" }
    : { rachas: "", parecidas: "", analogos: "" };
  const opcionesMuestra = (Object.keys(nombreMuestra) as Muestra[])
    .filter((m) => m !== "parecidas" || estudio?.zActual !== null)
    .map((m) => ({ id: m, label: nombreMuestra[m] }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-end justify-between gap-4 px-4 pb-4 pt-6">
          <h1 className="font-serif text-3xl font-normal text-foreground sm:text-4xl">
            Rachas <span className="text-muted">· qué pasó las otras veces</span>
          </h1>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              cambiarTicker(borrador);
            }}
          >
            <input
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              list="sugeridos"
              aria-label="Ticker"
              className="h-9 w-36 rounded border border-border bg-panel px-3 font-mono text-sm uppercase outline-none focus:border-accent"
            />
            <datalist id="sugeridos">
              {SUGERIDOS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="flex rounded border border-border bg-panel p-0.5">
              {FRECUENCIAS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setKManual(null);
                    setFrecuencia(f.id);
                  }}
                  className={`h-8 rounded-sm px-3 text-sm ${frecuencia === f.id ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Costo ida y vuelta
              <input
                type="number"
                step="0.05"
                min="0"
                max="5"
                value={Number((costo * 100).toFixed(2))}
                onChange={(e) => setCosto(Math.max(0, Number(e.target.value) || 0) / 100)}
                className="h-8 w-16 rounded border border-border bg-panel px-2 text-right font-mono"
              />
              %
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={ignorarHoy} onChange={(e) => setIgnorarHoy(e.target.checked)} />
              Sin la rueda de hoy
            </label>
            <button
              type="button"
              onClick={() => setRecarga((x) => x + 1)}
              className="flex h-9 items-center gap-1.5 rounded border border-border bg-panel px-3 text-sm text-muted hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5">
        <PanelManana filas={panel} cargando={panelCargando} frecuencia={frecuencia} activo={ticker} onElegir={cambiarTicker} />

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-panel px-4 py-3 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {!estudio && cargando ? <div className="h-64 animate-pulse rounded-md border border-border bg-panel" /> : null}

        {estudio && tests && muestras ? (
          <>
            <Encabezado estudio={estudio} ticker={ticker} kManual={kManual} onK={setKManual} />

            {estudio.sentido === null ? null : (
              <>
                <Cifras estudio={estudio} />

                <Caja
                  titulo="¿Hay ventaja?"
                  bajada={`Retorno medio después de la señal contra cualquier ${u.una} del papel. El p-valor sale de sortear 2.000 veces la misma cantidad de ${u.varias} al azar y está corregido por probar ${estudio.horizontes.length} horizontes (Holm). Neta: lo que dejaba operar en la dirección de la ventaja, menos ${pct(costo, 2, false)} de costo. Verde: p < 0,05 y neta positiva.`}
                >
                  <TablaVentaja tests={tests} nombres={nombreMuestra} opciones={opcionesMuestra.map((o) => o.id as Muestra)} frecuencia={frecuencia} />
                </Caja>

                <section className="grid gap-5 xl:grid-cols-12">
                  <div className="min-w-0 xl:col-span-8">
                    <Caja
                      titulo="Distribución por horizonte"
                      bajada={
                        muestraDetalle === "parecidas"
                          ? `Solo las veces con intensidad a menos de ${num(toleranciaZ, 2)}σ de la de hoy (${sigma(estudio.zActual)}).`
                          : muestraDetalle === "analogos"
                            ? `Los ${num(analogos?.lista.length ?? 0)} días más parecidos a hoy en racha, intensidad, retorno corto, distancia a la media, volatilidad y gap.`
                            : `Todas las veces que una racha de ${estudio.sentido} llegó a ${estudio.k} ${u.varias}.`
                      }
                      extra={
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Segmentado valor={muestraDetalle} opciones={opcionesMuestra} onChange={(v) => setMuestraDetalle(v as Muestra)} />
                          {muestraDetalle === "parecidas" ? (
                            <select
                              value={toleranciaZ}
                              onChange={(e) => setToleranciaZ(Number(e.target.value))}
                              className="rounded border border-border bg-panel px-1 py-1"
                              aria-label="Tolerancia de intensidad"
                            >
                              {[0.5, 0.75, 1].map((t) => (
                                <option key={t} value={t}>
                                  ±{num(t, 2)}σ
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      }
                    >
                      <TablaDetalle
                        horizontes={estudio.horizontes}
                        frecuencia={frecuencia}
                        m={Object.fromEntries(estudio.horizontes.map((h) => [h, metricas(muestras[muestraDetalle].ret[h] ?? [])]))}
                        base={estudio.base}
                      />
                    </Caja>
                  </div>
                  <div className="min-w-0 xl:col-span-4">
                    <Caja titulo="Retorno medio por horizonte" bajada={`Todas las rachas de ${estudio.k} contra la base del mismo papel.`}>
                      <CurvaAdelante estudio={estudio} />
                    </Caja>
                  </div>
                </section>

                <Caja
                  titulo="Stop y target: qué se tocaba primero"
                  bajada={`Entrando al cierre del día de la señal y saliendo a las ${ventana} ${u.varias} si no tocó nada. Si en una misma ${u.una} toca los dos, cuenta como stop; si abre más allá del nivel, se ejecuta a la apertura. Neto de ${pct(costo, 2, false)} de costo.`}
                  extra={
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Segmentado valor={muestraB} opciones={opcionesMuestra} onChange={(v) => setMuestraB(v as Muestra)} />
                      <Segmentado
                        valor={lado}
                        opciones={[
                          { id: "compra", label: "Compra" },
                          { id: "venta", label: "Venta" },
                        ]}
                        onChange={(v) => setLado(v as Lado)}
                      />
                      <Segmentado
                        valor={String(ventana)}
                        opciones={VENTANAS[frecuencia].map((v) => ({ id: String(v), label: `${v} ${u.corta}` }))}
                        onChange={(v) => setVentana(Number(v))}
                      />
                      <Segmentado
                        valor={metricaB}
                        opciones={[
                          { id: "ev", label: "Esperado" },
                          { id: "exceso", label: "vs. cualquier día" },
                          { id: "pTarget", label: "P(target)" },
                        ]}
                        onChange={(v) => setMetricaB(v as MetricaBarrera)}
                      />
                    </div>
                  }
                >
                  <StopTarget celdas={celdasB} mejor={mejorB} metrica={metricaB} frecuencia={frecuencia} lado={lado} ventana={ventana} />
                </Caja>

                <section className="grid gap-5 xl:grid-cols-12">
                  <div className="min-w-0 xl:col-span-5">
                    <Caja
                      titulo="¿Sigue la racha?"
                      bajada={`De las ${num(estudio.ocurrencias.length)} veces que llegó a ${estudio.k}, cuántas llegaron a cada largo (${u.varias} seguidas).`}
                    >
                      <Supervivencia estudio={estudio} />
                    </Caja>
                  </div>
                  <div className="min-w-0 xl:col-span-7">
                    <Caja
                      titulo="Recorrido en las próximas ruedas"
                      bajada={`Peor mínimo y mejor máximo de las ${VENTANA_EXCURSION[frecuencia]} ${u.varias} siguientes, contra el cierre del día que la racha llegó a ${estudio.k}.`}
                    >
                      <Recorrido estudio={estudio} />
                    </Caja>
                  </div>
                </section>
              </>
            )}

            {analogos && analogos.lista.length ? (
              <Caja
                titulo={`Los ${num(analogos.lista.length)} días más parecidos a hoy`}
                bajada={`Distancia ponderada en ${RASGOS.length} rasgos medidos en desvíos de su propia historia, separados para no repetir el mismo episodio. ${num(analogos.mismaRacha)} de ${num(analogos.lista.length)} venían con racha del mismo sentido.`}
              >
                <TablaAnalogos analogos={analogos} estudio={estudio} />
              </Caja>
            ) : null}

            {estudio.ocurrencias.length ? (
              <Caja
                titulo={`Las ${num(estudio.ocurrencias.length)} veces anteriores`}
                bajada="De la más reciente a la más vieja. Fecha: el cierre en que la racha llegó al largo de hoy."
              >
                <TablaOcurrencias estudio={estudio} todas={verTodas} />
                {estudio.ocurrencias.length > 25 ? (
                  <button onClick={() => setVerTodas((v) => !v)} className="mt-3 text-sm text-accent hover:underline">
                    {verTodas ? "Ver menos" : `Ver las ${num(estudio.ocurrencias.length)}`}
                  </button>
                ) : null}
              </Caja>
            ) : null}

            <p className="pb-6 text-xs text-tenue">
              {num(estudio.barras)} {u.varias} de {ticker} entre el {fecha(estudio.desde)} y el {fecha(estudio.hasta)}, con precios
              ajustados por dividendos y splits. Una {u.una} sin cambio corta la racha. Intensidad: variación logarítmica de la racha
              dividida por la volatilidad previa y por la raíz del largo. Es estadística descriptiva de lo que pasó, no una
              recomendación.
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PanelManana({
  filas,
  cargando,
  frecuencia,
  activo,
  onElegir,
}: {
  filas: FilaPanel[] | null;
  cargando: boolean;
  frecuencia: Frecuencia;
  activo: string;
  onElegir: (t: string) => void;
}) {
  const u = UNIDAD[frecuencia];
  const h = HORIZONTES[frecuencia][frecuencia === "D" ? 3 : 2];
  const ordenadas = filas
    ? [...filas].sort((a, b) => Number(b.significativa) - Number(a.significativa) || Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))
    : null;
  return (
    <Caja
      titulo="Rachas de hoy"
      bajada={`Primero los papeles con ventaja significativa en algún horizonte, después por intensidad. Ventaja: retorno medio a ${h} ${u.varias} después de rachas iguales, menos el de cualquier ${u.una}. Clic para abrir el estudio.`}
    >
      {cargando && !ordenadas ? <div className="h-32 animate-pulse rounded bg-background" /> : null}
      {ordenadas ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-medium">Papel</th>
                <th className="py-2 pr-3 font-medium">Racha</th>
                <th className="py-2 pr-3 text-right font-medium">Variación</th>
                <th className="py-2 pr-3 text-right font-medium">Intensidad</th>
                <th className="py-2 pr-3 text-right font-medium">Más intensa que</th>
                <th className="py-2 pr-3 text-right font-medium">Veces</th>
                <th className="py-2 pr-3 text-right font-medium">Media {h} {u.corta}</th>
                <th className="py-2 pr-3 text-right font-medium">Ventaja {h} {u.corta}</th>
                <th className="py-2 pr-3 text-right font-medium">p ajust.</th>
                <th className="py-2 text-left font-medium">Lectura</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {ordenadas.map((f) => (
                <tr
                  key={f.ticker}
                  onClick={() => onElegir(f.ticker)}
                  className={`cursor-pointer border-b border-border/70 hover:bg-accent-soft/50 ${f.ticker === activo ? "bg-accent-soft/60" : ""}`}
                >
                  <td className="py-1.5 pr-3 font-sans font-semibold">{f.ticker}</td>
                  <td className={`py-1.5 pr-3 font-sans ${f.k < 0 ? "text-danger" : "text-success"}`}>
                    {f.k === 0 ? (
                      <span className="text-muted">sin cambio</span>
                    ) : (
                      <>
                        <Fichas k={f.k} /> {Math.abs(f.k)} de {f.k < 0 ? "baja" : "suba"}
                      </>
                    )}
                  </td>
                  <td className={`py-1.5 pr-3 text-right ${colorSigno(f.variacion)}`}>{pct(f.variacion)}</td>
                  <td className={`py-1.5 pr-3 text-right ${Math.abs(f.z ?? 0) >= 2 ? "font-semibold text-signal" : ""}`}>{sigma(f.z)}</td>
                  <td className="py-1.5 pr-3 text-right">{prob(f.percentilZ)}</td>
                  <td className="py-1.5 pr-3 text-right">{num(f.n)}</td>
                  <td className={`py-1.5 pr-3 text-right ${colorSigno(f.media)}`}>{f.n >= 5 ? pct(f.media, 2) : "—"}</td>
                  <td className={`py-1.5 pr-3 text-right ${colorSigno(f.ventaja)}`}>{f.n >= 5 ? pct(f.ventaja, 2) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right text-muted">{f.pAjustado !== null ? num(f.pAjustado, 2) : "—"}</td>
                  <td className="py-1.5 font-sans text-xs">
                    {f.n < 10 ? (
                      <span className="text-tenue">pocos casos</span>
                    ) : f.significativa ? (
                      <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success">hay ventaja</span>
                    ) : (
                      <span className="text-muted">sin ventaja</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Caja>
  );
}

function Encabezado({
  estudio,
  ticker,
  kManual,
  onK,
}: {
  estudio: EstudioRacha;
  ticker: string;
  kManual: number | null;
  onK: (k: number | null) => void;
}) {
  const u = UNIDAD[estudio.frecuencia];
  const kSig = estudio.sentido === "baja" ? -estudio.k : estudio.k;
  const opciones: number[] = [];
  for (let k = -12; k <= 12; k += 1) if (k !== 0) opciones.push(k);
  return (
    <section className="rounded-md border border-border bg-panel px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">
            {ticker} · cierre {fecha(estudio.hasta)} · {num(estudio.ultimoCierre, 2)}
          </p>
          {estudio.sentido === null ? (
            <p className="mt-2 font-serif text-2xl">La última {u.una} cerró sin cambio: no hay racha en curso.</p>
          ) : kManual ? (
            <p className="mt-2 font-serif text-2xl">
              Estudiando {plural(estudio.k, u.una, u.varias)} de {estudio.sentido} seguidas
            </p>
          ) : (
            <p className="mt-2 font-serif text-2xl leading-snug sm:text-3xl">
              Lleva{" "}
              <span className={estudio.sentido === "baja" ? "text-danger" : "text-success"}>
                {plural(estudio.k, `${u.una} de ${estudio.sentido}`, `${u.varias} de ${estudio.sentido} seguidas`)}
              </span>
              {estudio.variacionActual !== null ? (
                <>
                  , {estudio.variacionActual < 0 ? "bajó" : "subió"} {pct(Math.abs(estudio.variacionActual), 1, false)}
                  {estudio.zActual !== null ? <span className="text-muted"> ({sigma(estudio.zActual)})</span> : null}
                </>
              ) : null}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Estudiar otra racha
          <select
            value={kManual ?? ""}
            onChange={(e) => onK(e.target.value ? Number(e.target.value) : null)}
            className="rounded border border-border bg-background px-2 py-1 font-mono"
          >
            <option value="">la de hoy ({kSig > 0 ? `+${kSig}` : kSig})</option>
            {opciones.map((k) => (
              <option key={k} value={k}>
                {Math.abs(k)} de {k < 0 ? "baja" : "suba"}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function Cifras({ estudio }: { estudio: EstudioRacha }) {
  const u = UNIDAD[estudio.frecuencia];
  const sigue = estudio.supervivencia[0];
  const tiles: { cifra: string; texto: string; tono?: string }[] = [
    { cifra: num(estudio.ocurrencias.length), texto: `veces que una racha de ${estudio.sentido} llegó a ${estudio.k} ${u.varias}` },
    {
      cifra: sigma(estudio.zActual),
      texto:
        estudio.percentilZ !== null
          ? `de intensidad: más fuerte que el ${prob(estudio.percentilZ)} de esas ${num(estudio.ocurrencias.length)} veces`
          : "intensidad de la racha",
      tono: Math.abs(estudio.zActual ?? 0) >= 2 ? "text-signal" : undefined,
    },
    { cifra: prob(estudio.percentilLargo), texto: `de las ${num(estudio.rachasMismoSentido)} rachas de ${estudio.sentido} fueron más cortas` },
    {
      cifra: sigue ? prob(sigue.prob) : "—",
      texto: sigue ? `siguió al menos una ${u.una} más (una moneda daría 50%)` : "sin datos para la siguiente",
    },
    {
      cifra: estudio.maxHistorico ? num(estudio.maxHistorico.largo) : "—",
      texto: estudio.maxHistorico
        ? `récord de ${u.varias} de ${estudio.sentido}, terminó el ${fecha(estudio.maxHistorico.fecha)} (${pct(estudio.maxHistorico.variacion)})`
        : "",
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.texto} className="rounded-md border border-border bg-panel px-4 py-3">
          <div className={`font-mono text-2xl ${t.tono ?? "text-foreground"}`}>{t.cifra}</div>
          <div className="mt-1 text-xs leading-snug text-muted">{t.texto}</div>
        </div>
      ))}
    </section>
  );
}

function TablaVentaja({
  tests,
  nombres,
  opciones,
  frecuencia,
}: {
  tests: Record<Muestra, TestVentaja[]>;
  nombres: Record<Muestra, string>;
  opciones: Muestra[];
  frecuencia: Frecuencia;
}) {
  const u = UNIDAD[frecuencia];
  const horizontes = tests.rachas.map((t) => t.h);
  const td = "px-2 text-right";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted">
            <th />
            {opciones.map((m) => (
              <th key={m} colSpan={4} className="border-b border-accent/40 px-2 pb-1 text-center font-medium text-accent">
                {nombres[m]} · {num(tests[m][0]?.n ?? 0)} casos
              </th>
            ))}
            <th className="border-b border-border px-2 pb-1 text-center font-medium">Base</th>
          </tr>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pr-2 text-left font-medium">A</th>
            {opciones.flatMap((m) => [
              <th key={`${m}-m`} className={`${td} py-2 font-medium`}>Media</th>,
              <th key={`${m}-v`} className={`${td} font-medium`}>Ventaja</th>,
              <th key={`${m}-n`} className={`${td} font-medium`}>Neta</th>,
              <th key={`${m}-p`} className={`${td} font-medium`}>p</th>,
            ])}
            <th className={`${td} font-medium`}>Media</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {horizontes.map((h, i) => (
            <tr key={h} className="border-b border-border/70">
              <td className="py-1.5 pr-2 font-sans">
                {h} {h === 1 ? u.una : u.varias}
              </td>
              {opciones.flatMap((m) => {
                const t = tests[m][i];
                if (!t || t.n < 5) {
                  return [0, 1, 2, 3].map((x) => (
                    <td key={`${m}-${x}`} className={`${td} text-tenue`}>
                      —
                    </td>
                  ));
                }
                const f = t.significativa ? "bg-success/10" : "";
                return [
                  <td key={`${m}-m`} className={`${td} ${f} ${colorSigno(t.media)}`}>{pct(t.media, 2)}</td>,
                  <td key={`${m}-v`} className={`${td} ${f} ${colorSigno(t.ventaja)}`}>{pct(t.ventaja, 2)}</td>,
                  <td key={`${m}-n`} className={`${td} ${f} ${colorSigno(t.neta)}`}>{pct(t.neta, 2)}</td>,
                  <td key={`${m}-p`} className={`${td} ${f} ${t.significativa ? "font-semibold text-success" : "text-muted"}`}>
                    {t.pAjustado !== null ? num(t.pAjustado, 2) : "—"}
                  </td>,
                ];
              })}
              <td className={`${td} text-muted`}>{pct(tests.rachas[i]?.mediaBase, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaDetalle({
  horizontes,
  frecuencia,
  m,
  base,
}: {
  horizontes: number[];
  frecuencia: Frecuencia;
  m: Record<number, Metricas>;
  base: Record<number, Metricas>;
}) {
  const u = UNIDAD[frecuencia];
  const th = "py-2 px-2 text-right font-medium";
  const n0 = m[horizontes[0]]?.n ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pr-2 text-left font-medium">A</th>
            <th className={th}>Casos</th>
            <th className={th}>Subió</th>
            <th className={th}>Media</th>
            <th className={th}>Mediana</th>
            <th className={th}>p10 / p90</th>
            <th className={th}>CVaR 95</th>
            <th className={th}>Base subió</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {horizontes.map((h) => {
            const t = m[h];
            const ok = t && t.n >= 5;
            return (
              <tr key={h} className="border-b border-border/70">
                <td className="py-1.5 pr-2 font-sans">
                  {h} {h === 1 ? u.una : u.varias}
                </td>
                <td className="px-2 text-right">{num(t?.n)}</td>
                <td className="px-2 text-right">{celdaProb(t)}</td>
                <td className={`px-2 text-right ${ok ? colorSigno(t.media) : ""}`}>{ok ? pct(t.media, 2) : "—"}</td>
                <td className={`px-2 text-right ${ok ? colorSigno(t.mediana) : ""}`}>{ok ? pct(t.mediana, 2) : "—"}</td>
                <td className="px-2 text-right text-muted">{ok ? `${pct(t.p10, 1)} / ${pct(t.p90, 1)}` : "—"}</td>
                <td className="px-2 text-right text-danger">{ok ? pct(t.cvar95, 1) : "—"}</td>
                <td className="px-2 text-right text-muted">{prob(base[h]?.pSuba)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {n0 < 10 ? <p className="mt-2 text-xs text-signal">Pocos casos ({num(n0)}): tomalo como anécdota, no como estadística.</p> : null}
    </div>
  );
}

function StopTarget({
  celdas,
  mejor,
  metrica,
  frecuencia,
  lado,
  ventana,
}: {
  celdas: CeldaBarrera[];
  mejor: CeldaBarrera | null;
  metrica: MetricaBarrera;
  frecuencia: Frecuencia;
  lado: Lado;
  ventana: number;
}) {
  const u = UNIDAD[frecuencia];
  if (!celdas.length || (celdas[0]?.n ?? 0) < 10) {
    return <p className="py-10 text-center text-sm text-muted">Menos de 10 casos con la ventana completa: no alcanza para simular.</p>;
  }
  const stops = Array.from(new Set(celdas.map((c) => c.stop))).sort((a, b) => a - b);
  const targets = Array.from(new Set(celdas.map((c) => c.target))).sort((a, b) => a - b);
  const escala = Math.max(...celdas.map((c) => Math.abs(valorBarrera(c, metrica))), 1e-6);
  const fondo = (v: number) => {
    const a = Math.min(1, Math.abs(v) / escala) * 0.55;
    return v >= 0 ? `rgba(79,122,74,${a})` : `rgba(164,71,59,${a})`;
  };
  const texto = (c: CeldaBarrera) => (metrica === "pTarget" ? prob(c.pTarget) : pct(valorBarrera(c, metrica), 2));
  return (
    <div className="space-y-4">
      {mejor ? (
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">
            Mejor combinación: {lado === "compra" ? "comprar" : "vender"} con stop −{pct(mejor.stop, 1, false)} y target +
            {pct(mejor.target, 0, false)}
          </span>
          . Tocó el target primero el {prob(mejor.pTarget)} de las veces, el stop el {prob(mejor.pStop)}, y el {prob(mejor.pNada)}{" "}
          salió a las {ventana} {u.varias}. Esperado {pct(mejor.ev, 2)} neto por operación, contra {pct(mejor.evBase, 2)} entrando
          cualquier día ({num(mejor.n)} operaciones).
          {mejor.stop === stops[stops.length - 1] ? (
            <span className="text-muted"> Está en el stop más amplio de la grilla: en la práctica, casi no usar stop.</span>
          ) : null}
          {mejor.ev <= 0 ? <span className="text-danger"> Ninguna combinación dejaba plata después de costos.</span> : null}
        </p>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <Barreras3D celdas={celdas} metrica={metrica} mejor={mejor} />
        </div>
        <div className="min-w-0 overflow-x-auto xl:col-span-5">
          <table className="w-full min-w-[460px] font-mono text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted">
                <th className="py-1.5 pr-1 text-left font-medium">Stop \ Target</th>
                {targets.map((t) => (
                  <th key={t} className="px-1 text-right font-medium">
                    +{pct(t, 0, false)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stops.map((s) => (
                <tr key={s}>
                  <td className="py-1 pr-1 text-muted">−{pct(s, s < 0.02 ? 1 : 0, false)}</td>
                  {targets.map((t) => {
                    const c = celdas.find((x) => x.stop === s && x.target === t) as CeldaBarrera;
                    const esMejor = mejor && c.stop === mejor.stop && c.target === mejor.target;
                    return (
                      <td
                        key={t}
                        className={`px-1 py-1 text-right ${esMejor ? "outline outline-2 outline-signal" : ""}`}
                        style={{ background: fondo(valorBarrera(c, metrica)) }}
                        title={`target primero ${prob(c.pTarget)} · stop ${prob(c.pStop)} · ninguno ${prob(c.pNada)} · cualquier día ${pct(c.evBase, 2)}`}
                      >
                        {texto(c)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">
            {metrica === "ev"
              ? "Resultado esperado por operación, neto de costos."
              : metrica === "exceso"
                ? "Resultado esperado menos el de entrar cualquier día con el mismo stop y target."
                : "Porcentaje de veces que tocó el target antes que el stop."}{" "}
            Pasá el mouse por una celda para ver el detalle.
          </p>
        </div>
      </div>
    </div>
  );
}

function TablaAnalogos({ analogos, estudio }: { analogos: ResultadoAnalogos; estudio: EstudioRacha }) {
  const u = UNIDAD[estudio.frecuencia];
  const diario = estudio.frecuencia === "D";
  const celdas = (r: Record<string, number>) => [
    <td key="r" className={`px-2 text-right ${colorSigno(r.racha)}`}>{r.racha > 0 ? `+${r.racha}` : r.racha}</td>,
    <td key="z" className="px-2 text-right">{sigma(r.z)}</td>,
    <td key="c" className="px-2 text-right">{sigma(r.r5)}</td>,
    <td key="m" className={`px-2 text-right ${colorSigno(r.ma)}`}>{pct(Math.exp(r.ma) - 1, 0)}</td>,
    <td key="v" className="px-2 text-right">{pct(Math.exp(r.vol) - 1, 0)}</td>,
    ...(diario ? [<td key="g" className="px-2 text-right">{sigma(r.gap)}</td>] : []),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pr-2 text-left font-medium">Fecha</th>
            <th className="px-2 text-right font-medium">Dist.</th>
            <th className="px-2 text-right font-medium">Racha</th>
            <th className="px-2 text-right font-medium">Intens.</th>
            <th className="px-2 text-right font-medium">Corto</th>
            <th className="px-2 text-right font-medium">vs. media</th>
            <th className="px-2 text-right font-medium">Vol. vs. normal</th>
            {diario ? <th className="px-2 text-right font-medium">Gap</th> : null}
            {estudio.horizontes.map((h) => (
              <th key={h} className="px-2 text-right font-medium">
                {h} {u.corta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {analogos.hoy ? (
            <tr className="border-b border-border bg-signal/10">
              <td className="py-1.5 pr-2 font-sans font-semibold text-signal">Hoy</td>
              <td className="px-2 text-right">—</td>
              {celdas(analogos.hoy)}
              {estudio.horizontes.map((h) => (
                <td key={h} className="px-2 text-right text-tenue">
                  ?
                </td>
              ))}
            </tr>
          ) : null}
          {analogos.lista.map((a) => (
            <tr key={a.i} className="border-b border-border/70">
              <td className="py-1.5 pr-2">{fecha(a.fecha)}</td>
              <td className="px-2 text-right text-muted">{num(a.distancia, 2)}</td>
              {celdas(a.rasgos)}
              {estudio.horizontes.map((h) => (
                <td key={h} className={`px-2 text-right ${colorSigno(a.fwd[h])}`}>
                  {pct(a.fwd[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaOcurrencias({ estudio, todas }: { estudio: EstudioRacha; todas: boolean }) {
  const u = UNIDAD[estudio.frecuencia];
  const filas = todas ? estudio.ocurrencias : estudio.ocurrencias.slice(0, 25);
  const marcar = estudio.zActual !== null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pr-2 text-left font-medium">Fecha</th>
            <th className="px-2 text-right font-medium">Hasta {estudio.k}</th>
            <th className="px-2 text-right font-medium">Intens.</th>
            <th className="px-2 text-right font-medium">Largo final</th>
            <th className="px-2 text-right font-medium">Racha completa</th>
            {estudio.horizontes.map((h) => (
              <th key={h} className="px-2 text-right font-medium">
                {h} {u.corta}
              </th>
            ))}
            <th className="px-2 text-right font-medium">MAE</th>
            <th className="pl-2 text-right font-medium">MFE</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {filas.map((o) => (
            <tr key={o.i} className={`border-b border-border/70 ${o.parecida && marcar ? "bg-signal/5" : ""}`}>
              <td className="py-1.5 pr-2">
                {fecha(o.fecha)}
                {o.parecida && marcar ? <span className="ml-1.5 text-[10px] text-signal">parecida</span> : null}
              </td>
              <td className={`px-2 text-right ${colorSigno(o.variacionK)}`}>{pct(o.variacionK)}</td>
              <td className="px-2 text-right">{sigma(o.zK)}</td>
              <td className="px-2 text-right">{o.largoFinal}</td>
              <td className={`px-2 text-right ${colorSigno(o.variacionFinal)}`}>{pct(o.variacionFinal)}</td>
              {estudio.horizontes.map((h) => (
                <td key={h} className={`px-2 text-right ${colorSigno(o.fwd[h])}`}>
                  {pct(o.fwd[h])}
                </td>
              ))}
              <td className="px-2 text-right text-danger">{pct(o.mae)}</td>
              <td className="pl-2 text-right text-success">{pct(o.mfe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
