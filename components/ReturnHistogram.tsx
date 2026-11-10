"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReturnHistogramProps {
  values: number[];
  horizon: number;
}

function toPercentLabel(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function makeBins(values: number[]): Array<{ bucket: string; count: number }> {
  if (!values.length) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const nBins = 14;

  if (min === max) {
    return [{ bucket: toPercentLabel(min), count: values.length }];
  }

  const width = (max - min) / nBins;
  const bins = Array.from({ length: nBins }, (_, index) => {
    const from = min + index * width;
    const to = from + width;
    const count =
      index === nBins - 1
        ? values.filter((value) => value >= from && value <= to).length
        : values.filter((value) => value >= from && value < to).length;

    return {
      bucket: `${toPercentLabel(from)} a ${toPercentLabel(to)}`,
      count,
    };
  });

  return bins;
}

export function ReturnHistogram({ values, horizon }: ReturnHistogramProps) {
  const bins = useMemo(() => makeBins(values), [values]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Histograma Post Evento ({horizon}D)</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {bins.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="#EFEDE8" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fill: "#6B7276", fontSize: 10, fontFamily: "var(--font-ibm-mono)" }} axisLine={{ stroke: "#C9C6BE" }} tickLine={false} interval={2} />
              <YAxis tick={{ fill: "#6B7276", fontSize: 11, fontFamily: "var(--font-ibm-mono)" }} axisLine={{ stroke: "#C9C6BE" }} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#E3F1F4" }}
                contentStyle={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E6E4DE",
                  borderRadius: "4px",
                  color: "#1E2326",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="count" fill="#3E9DB0" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Sin retornos para construir histograma.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
