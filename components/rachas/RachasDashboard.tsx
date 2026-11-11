"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EstudioRacha,
  estudiarRacha,
  FilaPanel,
  Frecuencia,
  HORIZONTES,
  Metricas,
  superficie,
  UNIDAD,
  VENTANA_EXCURSION,
} from "@/lib/streaks";
import { colorSigno, fecha, num, pct, plural, prob } from "@/lib/formato";
import { PriceBar } from "@/lib/types";
import type { MetricaSuperficie } from "@/components/three/Superficie3D";

const Superficie3D = dynamic(() => import("@/components/three/Superficie3D"), { ssr: false });
const Nube3D = dynamic(() => import("@/components/three/Nube3D"), { ssr: false });

const FRECUENCIAS: { id: Frecuencia; label: string }[] = [
  { id: "D", label: "Ruedas" },
  { id: "W", label: "Semanas" },
  { id: "M", label: "Meses" },
];

const SUGERIDOS = ["GGAL.BA", "YPFD.BA", "PAMP.BA", "BMA.BA", "TXAR.BA", "GGAL", "YPF", "SPY", "QQQ", "EWZ", "BTC-USD"];

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  const [tolerancia, setTolerancia] = useState(0.5);

  const [bars, setBars] = useState<PriceBar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const [panel, setPanel] = useState<FilaPanel[] | null>(null);
  const [panelCargando, setPanelCargando] = useState(false);

  const [vista3d, setVista3d] = useState<"mapa" | "nube">("mapa");
  const [metrica, setMetrica] = useState<MetricaSuperficie>("exceso");
  const [horizonteNube, setHorizonteNube] = useState<number>(HORIZONTES[frecuencia][3] ?? HORIZONTES[frecuencia][1]);
  const [verTodas, setVerTodas] = useState(false);

  useEffect(() => {
    setHorizonteNube(HORIZONTES[frecuencia][frecuencia === "M" ? 2 : 3]);
  }, [frecuencia]);

  // URL compartible
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
    return estudiarRacha(usadas, { frecuencia, kForzado: kManual ?? undefined, tolerancia });
  }, [usadas, frecuencia, kManual, tolerancia]);

  const celdas = useMemo(() => (usadas ? superficie(usadas, frecuencia) : []), [usadas, frecuencia]);

  const cambiarTicker = (t: string) => {
    const limpio = t.trim().toUpperCase();
    if (!limpio) return;
    setKManual(null);
    setTicker(limpio);
    setBorrador(limpio);
  };

  const u = UNIDAD[frecuencia];
  const kConSigno = estudio ? (estudio.sentido === "baja" ? -estudio.k : estudio.k) : 0;

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
        <PanelManana
          filas={panel}
          cargando={panelCargando}
          frecuencia={frecuencia}
          activo={ticker}
          onElegir={cambiarTicker}
        />

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-panel px-4 py-3 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}

        {!estudio && cargando ? <div className="h-64 animate-pulse rounded-md border border-border bg-panel" /> : null}

        {estudio ? (
          <>
            <Encabezado estudio={estudio} ticker={ticker} kManual={kManual} onK={setKManual} />

            {estudio.sentido === null ? null : (
              <>
                <Cifras estudio={estudio} />

                <section className="grid gap-5 xl:grid-cols-12">
                  <div className="min-w-0 xl:col-span-8">
                    <Caja
                      titulo={`Qué pasó después de ${plural(estudio.k, `${u.una} de ${estudio.sentido}`, `${u.varias} de ${estudio.sentido} seguidas`)}`}
                      bajada={`Retorno desde el cierre en que la racha llegó a ${estudio.k}, contra cualquier ${u.una} del papel (la base). Caída parecida: entre ${pct(1 - tolerancia, 0, false)} y ${pct(1 + tolerancia, 0, false)} de la variación de hoy.`}
                      extra={
                        estudio.variacionActual !== null ? (
                          <label className="flex items-center gap-2 text-xs text-muted">
                            Parecida ±
                            <select
                              value={tolerancia}
                              onChange={(e) => setTolerancia(Number(e.target.value))}
                              className="rounded border border-border bg-panel px-1 py-0.5"
                            >
                              {[0.25, 0.5, 0.75].map((t) => (
                                <option key={t} value={t}>
                                  {t * 100}%
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null
                      }
                    >
                      <TablaHorizontes estudio={estudio} />
                    </Caja>
                  </div>
                  <div className="min-w-0 xl:col-span-4">
                    <Caja titulo="Retorno medio por horizonte" bajada="Racha contra la base del mismo papel.">
                      <CurvaAdelante estudio={estudio} />
                    </Caja>
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-12">
                  <div className="min-w-0 xl:col-span-5">
                    <Caja
                      titulo="¿Sigue la racha?"
                      bajada={`De las ${num(estudio.ocurrencias.length)} veces que llegó a ${estudio.k}, cuántas llegaron a cada largo (eje: ${UNIDAD[frecuencia].varias} seguidas).`}
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

            <Caja
              titulo={vista3d === "mapa" ? "Mapa de rachas en 3D" : "Cada vez que pasó, en 3D"}
              bajada={
                vista3d === "mapa"
                  ? `Cada columna es un largo de racha y cada fila un horizonte. La altura es ${
                      metrica === "exceso" ? "el retorno medio menos la base" : metrica === "media" ? "el retorno medio" : "la probabilidad de suba menos 50%"
                    }. Translúcidas: menos de 15 casos; tapa oscura: valor fuera de escala; grises: menos de 8 casos. Borde ámbar: la racha de hoy. Arrastrá para girar.`
                  : `Cada esfera es una vez que la racha llegó a ${estudio.k}: a lo ancho la variación acumulada, al fondo el tiempo, en altura el retorno posterior. Translúcidas: caída no parecida a la de hoy.`
              }
              extra={
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Segmentado
                    valor={vista3d}
                    opciones={[
                      { id: "mapa", label: "Mapa" },
                      { id: "nube", label: "Ocurrencias" },
                    ]}
                    onChange={(v) => setVista3d(v as "mapa" | "nube")}
                  />
                  {vista3d === "mapa" ? (
                    <Segmentado
                      valor={metrica}
                      opciones={[
                        { id: "exceso", label: "vs. base" },
                        { id: "media", label: "Media" },
                        { id: "pSuba", label: "P(suba)" },
                      ]}
                      onChange={(v) => setMetrica(v as MetricaSuperficie)}
                    />
                  ) : (
                    <Segmentado
                      valor={String(horizonteNube)}
                      opciones={estudio.horizontes.map((h) => ({ id: String(h), label: `${h} ${u.corta}` }))}
                      onChange={(v) => setHorizonteNube(Number(v))}
                    />
                  )}
                </div>
              }
            >
              {vista3d === "mapa" ? (
                <Superficie3D celdas={celdas} frecuencia={frecuencia} kActual={kConSigno} metrica={metrica} />
              ) : estudio.ocurrencias.length ? (
                <Nube3D
                  ocurrencias={estudio.ocurrencias}
                  horizonte={horizonteNube}
                  frecuencia={frecuencia}
                  variacionActual={estudio.variacionActual}
                />
              ) : (
                <p className="py-16 text-center text-sm text-muted">No hay ocurrencias anteriores para dibujar.</p>
              )}
            </Caja>

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
              ajustados por dividendos y splits. Una {u.una} sin cambio corta la racha. Es estadística descriptiva de lo que pasó, no
              una recomendación.
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas

function Caja({
  titulo,
  bajada,
  extra,
  children,
}: {
  titulo: string;
  bajada?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="h-full rounded-md border border-border bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="max-w-3xl">
          <h2 className="font-serif text-xl text-foreground">{titulo}</h2>
          {bajada ? <p className="mt-1 text-xs leading-relaxed text-muted">{bajada}</p> : null}
        </div>
        {extra}
      </div>
      <div className="px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}

function Segmentado({
  valor,
  opciones,
  onChange,
}: {
  valor: string;
  opciones: { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded border border-border bg-background p-0.5">
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-sm px-2.5 py-1 ${valor === o.id ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
  const h1 = HORIZONTES[frecuencia][0];
  const hM = HORIZONTES[frecuencia][frecuencia === "D" ? 3 : 2];
  const ordenadas = filas ? [...filas].sort((a, b) => (b.percentilLargo ?? 0) - (a.percentilLargo ?? 0)) : null;
  return (
    <Caja
      titulo="Rachas de hoy"
      bajada={`Racha actual de cada papel, ordenada por lo rara que es: qué porcentaje de las rachas del mismo sentido fueron más cortas. Clic para abrir el estudio.`}
    >
      {cargando && !ordenadas ? <div className="h-32 animate-pulse rounded bg-background" /> : null}
      {ordenadas ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pr-3 font-medium">Papel</th>
                <th className="py-2 pr-3 font-medium">Racha</th>
                <th className="py-2 pr-3 text-right font-medium">Variación</th>
                <th className="py-2 pr-3 text-right font-medium">Más larga que</th>
                <th className="py-2 pr-3 text-right font-medium">Veces</th>
                <th className="py-2 pr-3 text-right font-medium">Subió a {h1} {u.corta}</th>
                <th className="py-2 pr-3 text-right font-medium">Media {h1} {u.corta}</th>
                <th className="py-2 pr-3 text-right font-medium">Media {hM} {u.corta}</th>
                <th className="py-2 text-right font-medium">Base {h1} {u.corta}</th>
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
                  <td className="py-1.5 pr-3 text-right">
                    <span className={(f.percentilLargo ?? 0) >= 0.9 ? "font-semibold text-signal" : ""}>{prob(f.percentilLargo)}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{num(f.n)}</td>
                  <td className="py-1.5 pr-3 text-right">{f.n >= 5 ? prob(f.pSuba1) : "—"}</td>
                  <td className={`py-1.5 pr-3 text-right ${colorSigno(f.media1)}`}>{f.n >= 5 ? pct(f.media1, 2) : "—"}</td>
                  <td className={`py-1.5 pr-3 text-right ${colorSigno(f.mediaH)}`}>{f.n >= 5 ? pct(f.mediaH, 2) : "—"}</td>
                  <td className="py-1.5 text-right text-muted">{pct(f.base1, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Caja>
  );
}

function Fichas({ k }: { k: number }) {
  const n = Math.min(Math.abs(k), 12);
  return (
    <span className="mr-1 inline-flex gap-[2px] align-middle">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={`inline-block h-2.5 w-1.5 rounded-[1px] ${k < 0 ? "bg-danger" : "bg-success"}`} />
      ))}
    </span>
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
                  , {estudio.variacionActual < 0 ? "bajó" : "subió"} {pct(Math.abs(estudio.variacionActual), 1, false)} en la racha
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
    {
      cifra: num(estudio.ocurrencias.length),
      texto: `veces que una racha de ${estudio.sentido} llegó a ${estudio.k} ${u.varias}`,
    },
    {
      cifra: prob(estudio.percentilLargo),
      texto: `de las ${num(estudio.rachasMismoSentido)} rachas de ${estudio.sentido} fueron más cortas`,
      tono: (estudio.percentilLargo ?? 0) >= 0.9 ? "text-signal" : undefined,
    },
    {
      cifra: sigue ? prob(sigue.prob) : "—",
      texto: sigue ? `siguió al menos una ${u.una} más (llegó a ${sigue.largo})` : "sin datos para la siguiente",
    },
    {
      cifra: estudio.largoEsperado !== null ? num(estudio.largoEsperado, 1) : "—",
      texto: `${u.varias} de largo final promedio, dado que llegó a ${estudio.k}`,
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

function celdaProb(m: Metricas | undefined) {
  if (!m || m.n < 5) return <span className="text-tenue">—</span>;
  return (
    <span title={m.ic ? `IC 95%: ${prob(m.ic[0])} a ${prob(m.ic[1])}` : undefined}>
      {prob(m.pSuba)}
      <span className="ml-1 text-[10px] text-tenue">{m.ic ? `${prob(m.ic[0])}–${prob(m.ic[1])}` : ""}</span>
    </span>
  );
}

function TablaHorizontes({ estudio }: { estudio: EstudioRacha }) {
  const u = UNIDAD[estudio.frecuencia];
  const hayParecidas = estudio.variacionActual !== null;
  const th = "py-2 px-2 text-right font-medium";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted">
            <th />
            <th colSpan={6} className="border-b border-accent/40 px-2 pb-1 text-center font-medium text-accent">
              Todas las rachas de {estudio.k}
            </th>
            {hayParecidas ? (
              <th colSpan={3} className="border-b border-signal/50 px-2 pb-1 text-center font-medium text-signal">
                Caída parecida
              </th>
            ) : null}
            <th colSpan={2} className="border-b border-border px-2 pb-1 text-center font-medium">
              Base
            </th>
          </tr>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pr-2 text-left font-medium">A</th>
            <th className={th}>Casos</th>
            <th className={th}>Subió</th>
            <th className={th}>Media</th>
            <th className={th}>Mediana</th>
            <th className={th}>p10 / p90</th>
            <th className={th}>CVaR 95</th>
            {hayParecidas ? (
              <>
                <th className={th}>Casos</th>
                <th className={th}>Subió</th>
                <th className={th}>Media</th>
              </>
            ) : null}
            <th className={th}>Subió</th>
            <th className={th}>Media</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {estudio.horizontes.map((h) => {
            const t = estudio.todas[h];
            const p = estudio.parecidas[h];
            const b = estudio.base[h];
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
                {hayParecidas ? (
                  <>
                    <td className="px-2 text-right">{num(p?.n)}</td>
                    <td className="px-2 text-right">{celdaProb(p)}</td>
                    <td className={`px-2 text-right ${p && p.n >= 5 ? colorSigno(p.media) : ""}`}>{p && p.n >= 5 ? pct(p.media, 2) : "—"}</td>
                  </>
                ) : null}
                <td className="px-2 text-right text-muted">{prob(b?.pSuba)}</td>
                <td className="px-2 text-right text-muted">{pct(b?.media, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {estudio.ocurrencias.length < 10 ? (
        <p className="mt-2 text-xs text-signal">
          Pocos casos ({num(estudio.ocurrencias.length)}): tomalo como anécdota, no como estadística.
        </p>
      ) : null}
    </div>
  );
}

function CurvaAdelante({ estudio }: { estudio: EstudioRacha }) {
  const u = UNIDAD[estudio.frecuencia];
  const datos = estudio.horizontes.map((h) => ({
    h: `${h} ${u.corta}`,
    racha: estudio.todas[h]?.n >= 5 ? (estudio.todas[h].media ?? 0) * 100 : null,
    mediana: estudio.todas[h]?.n >= 5 ? (estudio.todas[h].mediana ?? 0) * 100 : null,
    base: (estudio.base[h]?.media ?? 0) * 100,
  }));
  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#ECEAE4" vertical={false} />
          <XAxis dataKey="h" tick={{ fontSize: 11, fill: "#6B7276" }} axisLine={{ stroke: "#D9D6CE" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#6B7276" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}
          />
          <ReferenceLine y={0} stroke="#9AA0A3" />
          <Tooltip
            formatter={(v) => (typeof v === "number" ? `${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%` : "—")}
            contentStyle={{ fontSize: 12, borderColor: "#E6E4DE" }}
          />
          <Line type="monotone" dataKey="base" name="Base" stroke="#9AA0A3" strokeDasharray="4 3" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="mediana" name="Mediana racha" stroke="#B07A2A" dot={{ r: 2 }} strokeWidth={1.5} />
          <Line type="monotone" dataKey="racha" name="Media racha" stroke="#1F6E7E" dot={{ r: 3 }} strokeWidth={2.2} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <i className="inline-block h-0.5 w-4 bg-accent" /> media racha
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-0.5 w-4 bg-signal" /> mediana racha
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-0.5 w-4 border-t border-dashed border-tenue" /> base
        </span>
      </div>
    </div>
  );
}

function Supervivencia({ estudio }: { estudio: EstudioRacha }) {
  const datos = estudio.supervivencia.map((f) => ({
    largo: `${f.largo}`,
    p: (f.prob ?? 0) * 100,
    llegan: f.llegan,
  }));
  if (!datos.length) return <p className="py-10 text-center text-sm text-muted">Nunca pasó de {estudio.k}.</p>;
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#ECEAE4" vertical={false} />
          <XAxis
            dataKey="largo"
            tick={{ fontSize: 11, fill: "#6B7276" }}
            axisLine={{ stroke: "#D9D6CE" }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 11, fill: "#6B7276" }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            formatter={(v, _n, item) => [`${Number(v).toFixed(0)}% (${(item.payload as { llegan: number }).llegan} casos)`, "llegaron"]}
            contentStyle={{ fontSize: 12, borderColor: "#E6E4DE" }}
          />
          <Bar dataKey="p" radius={[2, 2, 0, 0]}>
            {datos.map((d, i) => (
              <Cell key={d.largo} fill={estudio.sentido === "baja" ? "#A4473B" : "#4F7A4A"} fillOpacity={1 - i * 0.08} />
            ))}
            <LabelList dataKey="p" position="top" formatter={(v) => `${Number(v).toFixed(0)}%`} style={{ fontSize: 10, fill: "#6B7276" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Recorrido({ estudio }: { estudio: EstudioRacha }) {
  const u = UNIDAD[estudio.frecuencia];
  const filas = [
    { label: "Peor caída promedio (MAE)", v: estudio.maeTodas, tono: "text-danger" },
    { label: "Mejor suba promedio (MFE)", v: estudio.mfeTodas, tono: "text-success" },
    { label: `Peor caída promedio de cualquier ${u.una}`, v: estudio.baseMae, tono: "text-muted" },
    { label: `${u.una[0].toUpperCase()}${u.una.slice(1)} que cortó la racha, promedio`, v: estudio.corteMedia, tono: colorSigno(estudio.corteMedia) },
  ];
  const maes = estudio.ocurrencias.map((o) => o.mae).filter((x): x is number => x !== null);
  const mfes = estudio.ocurrencias.map((o) => o.mfe).filter((x): x is number => x !== null);
  const pDe = (arr: number[], umbral: number, abajo: boolean) =>
    arr.length ? arr.filter((x) => (abajo ? x <= umbral : x >= umbral)).length / arr.length : null;
  const umbrales = estudio.frecuencia === "D" ? [0.03, 0.05, 0.1] : estudio.frecuencia === "W" ? [0.05, 0.1, 0.2] : [0.1, 0.2, 0.3];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <dl className="space-y-2.5">
        {filas.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-2">
            <dt className="text-sm text-muted">{f.label}</dt>
            <dd className={`font-mono text-lg ${f.tono}`}>{pct(f.v, 1)}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full self-start text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 text-left font-medium">Tocó</th>
            <th className="py-2 text-right font-medium">Abajo</th>
            <th className="py-2 text-right font-medium">Arriba</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {umbrales.map((t) => (
            <tr key={t} className="border-b border-border/70">
              <td className="py-1.5 font-sans">±{pct(t, 0, false)}</td>
              <td className="text-right text-danger">{prob(pDe(maes, -t, true))}</td>
              <td className="text-right text-success">{prob(pDe(mfes, t, false))}</td>
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
            <th className="py-2 pr-2 text-left font-medium">Fecha</th>
            <th className="px-2 text-right font-medium">Hasta {estudio.k}</th>
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
            <tr key={o.i} className={`border-b border-border/70 ${o.parecida && estudio.variacionActual !== null ? "bg-signal/5" : ""}`}>
              <td className="py-1.5 pr-2">
                {fecha(o.fecha)}
                {o.parecida && estudio.variacionActual !== null ? <span className="ml-1.5 text-[10px] text-signal">parecida</span> : null}
              </td>
              <td className={`px-2 text-right ${colorSigno(o.variacionK)}`}>{pct(o.variacionK)}</td>
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
