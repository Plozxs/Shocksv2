import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getHistoricalPrices, rangeSchema, tickerSchema } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  ticker: tickerSchema.default("SPY"),
  range: rangeSchema.default("5y"),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      ticker: request.nextUrl.searchParams.get("ticker") ?? "SPY",
      range: request.nextUrl.searchParams.get("range") ?? "5y",
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Parametros invalidos",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { ticker, range } = parsed.data;
    const bars = await getHistoricalPrices({ ticker, range });

    return NextResponse.json({
      ticker,
      range,
      bars,
      count: bars.length,
      firstDate: bars[0]?.date ?? null,
      lastDate: bars[bars.length - 1]?.date ?? null,
      source: "Yahoo Finance",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error inesperado consultando precios.";
    const status = message.toLowerCase().includes("ticker invalido") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
