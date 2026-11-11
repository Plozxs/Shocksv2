"use client";

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
import { EstudioRacha, Metricas, UNIDAD } from "@/lib/streaks";
import { colorSigno, pct, prob } from "@/lib/formato";

export function Caja({
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

export function Segmentado({
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

export function Fichas({ k }: { k: number }) {
  const n = Math.min(Math.abs(k), 12);
  return (
    <span className="mr-1 inline-flex gap-[2px] align-middle">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className={`inline-block h-2.5 w-1.5 rounded-[1px] ${k < 0 ? "bg-danger" : "bg-success"}`} />
      ))}
    </span>
  );
}

export function celdaProb(m: Metricas | undefined) {
  if (!m || m.n < 5) return <span className="text-tenue">—</span>;
  return (
    <span title={m.ic ? `IC 95%: ${prob(m.ic[0])} a ${prob(m.ic[1])}` : undefined}>
      {prob(m.pSuba)}
      <span className="ml-1 text-[10px] text-tenue">{m.ic ? `${prob(m.ic[0])}–${prob(m.ic[1])}` : ""}</span>
    </span>
  );
}

export function CurvaAdelante({ estudio }: { estudio: EstudioRacha }) {
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

export function Supervivencia({ estudio }: { estudio: EstudioRacha }) {
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

export function Recorrido({ estudio }: { estudio: EstudioRacha }) {
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
