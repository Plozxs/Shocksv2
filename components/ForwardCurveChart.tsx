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
        <CardTitle>Curva Forward: Media vs Mediana</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="#EFEDE8" vertical={false} />
              <XAxis dataKey="horizon" tick={{ fill: "#6B7276", fontSize: 11, fontFamily: "var(--font-ibm-mono)" }} axisLine={{ stroke: "#C9C6BE" }} tickLine={false} />
              <YAxis
                tick={{ fill: "#6B7276", fontSize: 11, fontFamily: "var(--font-ibm-mono)" }} axisLine={{ stroke: "#C9C6BE" }} tickLine={false}
                tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
              />
              <Tooltip
                formatter={(value: number | string | undefined) =>
                  typeof value === "number" ? `${value.toFixed(2)}%` : String(value ?? "—")
                }
                contentStyle={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E6E4DE",
                  borderRadius: "4px",
                  color: "#1E2326",
                  fontSize: "12px",
                }}
              />
              <Legend iconType="plainline" wrapperStyle={{ color: "#6B7276", fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="mean"
                stroke="#3E9DB0"
                strokeWidth={2}
                dot={{ r: 3, fill: "#3E9DB0", stroke: "#3E9DB0" }}
                connectNulls
                name="Media"
              />
              <Line
                type="monotone"
                dataKey="median"
                stroke="#8A9296"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: "#FFFFFF", stroke: "#8A9296" }}
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
