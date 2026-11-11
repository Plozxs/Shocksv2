import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { filaPanel, FilaPanel, Frecuencia } from "@/lib/streaks";
import { getHistoricalPrices, tickerSchema } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTA_PANEL = [
  "GGAL.BA",
  "YPFD.BA",
  "PAMP.BA",
  "BMA.BA",
  "TXAR.BA",
  "BYMA.BA",
  "GGAL",
  "YPF",
  "SPY",
  "QQQ",
  "EWZ",
  "BTC-USD",
];

const querySchema = z.object({
  frecuencia: z.enum(["D", "W", "M"]).default("D"),
  tickers: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    frecuencia: request.nextUrl.searchParams.get("frecuencia") ?? "D",
    tickers: request.nextUrl.searchParams.get("tickers") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  }
  const frecuencia = parsed.data.frecuencia as Frecuencia;
  const pedidos = parsed.data.tickers
    ? parsed.data.tickers.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 25)
    : LISTA_PANEL;

  const filas: FilaPanel[] = [];
  const errores: string[] = [];
  await Promise.all(
    pedidos.map(async (crudo) => {
      const t = tickerSchema.safeParse(crudo);
      if (!t.success) {
        errores.push(crudo);
        return;
      }
      try {
        const bars = await getHistoricalPrices({ ticker: t.data, range: "max" });
        const fila = filaPanel(t.data, bars, frecuencia);
        if (fila) filas.push(fila);
        else errores.push(t.data);
      } catch {
        errores.push(t.data);
      }
    }),
  );

  const orden = new Map(pedidos.map((t, i) => [t.toUpperCase(), i]));
  filas.sort((a, b) => (orden.get(a.ticker) ?? 99) - (orden.get(b.ticker) ?? 99));
  return NextResponse.json({ frecuencia, filas, errores });
}
