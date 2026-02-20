import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { latestBarHasEvent, runEventStudyCached } from "@/lib/eventEngine";
import { ScreenerItem } from "@/lib/types";
import { getHistoricalPrices, rangeSchema } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_WATCHLIST = [
  "AAPL",
  "MSFT",
  "SPY",
  "QQQ",
  "NVDA",
  "TSLA",
  "AMZN",
  "META",
  "NFLX",
  "BTC-USD",
  "ETH-USD",
];

const querySchema = z.object({
  threshold: z.coerce.number().min(1).max(35).default(10),
  direction: z.enum(["down", "up"]).default("down"),
  cooldown: z.coerce.number().int().min(0).max(30).default(5),
  range: rangeSchema.default("5y"),
  rankBy: z.enum(["ev3d", "pUp1d"]).default("ev3d"),
});

function rankScreener(rows: ScreenerItem[], rankBy: "ev3d" | "pUp1d"): ScreenerItem[] {
  const sorted = [...rows].sort((a, b) => {
    if (rankBy === "ev3d") {
      const first = a.ev3d ?? Number.NEGATIVE_INFINITY;
      const second = b.ev3d ?? Number.NEGATIVE_INFINITY;
      if (first !== second) {
        return second - first;
      }
      return (b.pUp1d ?? 0) - (a.pUp1d ?? 0);
    }

    const first = a.pUp1d ?? Number.NEGATIVE_INFINITY;
    const second = b.pUp1d ?? Number.NEGATIVE_INFINITY;
    if (first !== second) {
      return second - first;
    }
    return (b.ev3d ?? 0) - (a.ev3d ?? 0);
  });

  return sorted;
}

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      threshold: request.nextUrl.searchParams.get("threshold") ?? "10",
      direction: request.nextUrl.searchParams.get("direction") ?? "down",
      cooldown: request.nextUrl.searchParams.get("cooldown") ?? "5",
      range: request.nextUrl.searchParams.get("range") ?? "5y",
      rankBy: request.nextUrl.searchParams.get("rankBy") ?? "ev3d",
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Parámetros inválidos",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { threshold, direction, cooldown, range, rankBy } = parsed.data;

    const checks = await Promise.allSettled(
      DEFAULT_WATCHLIST.map(async (ticker) => {
        const bars = await getHistoricalPrices({ ticker, range });
        const latest = latestBarHasEvent(bars, {
          direction,
          thresholdPct: threshold,
          returnType: "closeToClose",
        });

        if (!latest.isEvent || latest.eventReturn === null) {
          return null;
        }

        const analysis = runEventStudyCached(bars, {
          ticker,
          direction,
          thresholdPct: threshold,
          horizons: [1, 2, 3, 5, 10],
          maxHorizon: 10,
          cooldownDays: cooldown,
          returnType: "closeToClose",
          windowVolDays: 20,
          trendMA: 200,
          volumeZWindow: 20,
          regimeFilters: {
            trend: "all",
            vol: "all",
            volumeShock: "all",
          },
        });

        const oneDay = analysis.horizonMetrics.find((metric) => metric.horizon === 1);
        const threeDay = analysis.horizonMetrics.find((metric) => metric.horizon === 3);

        const row: ScreenerItem = {
          ticker,
          date: bars[bars.length - 1].date,
          eventReturn: latest.eventReturn,
          ev3d: threeDay?.mean ?? null,
          pUp1d: oneDay?.pUp ?? null,
          n: threeDay?.n ?? 0,
        };
        return row;
      }),
    );

    const candidates = checks
      .filter((result): result is PromiseFulfilledResult<ScreenerItem | null> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((value): value is ScreenerItem => value !== null);

    const ranked = rankScreener(candidates, rankBy).slice(0, 10);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      rankBy,
      threshold,
      direction,
      count: ranked.length,
      watchlistSize: DEFAULT_WATCHLIST.length,
      items: ranked,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado en screener.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
