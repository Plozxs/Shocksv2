"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ForwardCurvePoint } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ForwardCurveChartProps {
  data: ForwardCurvePoint[];
}

export function ForwardCurveChart({ data }: ForwardCurveChartProps) {
  const chartData = data.map((point) => ({
    horizon: `${point.horizon}D`,
    mean: point.mean !== null ? point.mean * 100 : null,
    median: point.median !== null ? point.median * 100 : null,
  }));

  const hasData = chartData.some((row) => row.mean !== null || row.median !== null);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm">Curva Forward: Media vs Mediana</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="horizon" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
              />
              <Tooltip
                formatter={(value: number | string | undefined) =>
                  typeof value === "number" ? `${value.toFixed(2)}%` : String(value ?? "—")
                }
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1f2937",
                  borderRadius: "8px",
                  color: "#e5e7eb",
                }}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="mean"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                name="Media"
              />
              <Line
                type="monotone"
                dataKey="median"
                stroke="#34d399"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                name="Mediana"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Sin datos suficientes para trazar curva.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
