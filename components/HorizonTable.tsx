"use client";

import * as React from "react";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { HorizonMetrics } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";

interface HorizonTableProps {
  data: HorizonMetrics[];
}

function formatPct(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatCI(ci: [number, number] | null): string {
  if (!ci) {
    return "—";
  }
  return `${formatPct(ci[0], 1)} / ${formatPct(ci[1], 1)}`;
}

const columns: ColumnDef<HorizonMetrics>[] = [
  {
    header: "H",
    accessorKey: "horizon",
    cell: ({ row }) => <span className="font-mono">{row.original.horizon}D</span>,
  },
  {
    header: "P(Up)",
    accessorKey: "pUp",
    cell: ({ row }) => formatPct(row.original.pUp),
  },
  {
    header: "E[ret]",
    accessorKey: "mean",
    cell: ({ row }) => formatPct(row.original.mean),
  },
  {
    header: "Mediana",
    accessorKey: "median",
    cell: ({ row }) => formatPct(row.original.median),
  },
  {
    header: "P10",
    accessorKey: "p10",
    cell: ({ row }) => formatPct(row.original.p10),
  },
  {
    header: "P90",
    accessorKey: "p90",
    cell: ({ row }) => formatPct(row.original.p90),
  },
  {
    header: "Worst",
    accessorKey: "worst",
    cell: ({ row }) => formatPct(row.original.worst),
  },
  {
    header: "N",
    accessorKey: "n",
    cell: ({ row }) => <span className="font-mono">{row.original.n}</span>,
  },
  {
    header: "IC 95%",
    accessorKey: "pUpCI",
    cell: ({ row }) => formatCI(row.original.pUpCI),
  },
];

export function HorizonTable({ data }: HorizonTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Forward Metrics by Horizon</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted">
                  Sin datos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableCaption>
            Retornos forward en base a eventos con cooldown aplicado.
          </TableCaption>
        </Table>
      </CardContent>
    </Card>
  );
}
