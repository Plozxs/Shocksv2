import { RegimeBreakdownRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RegimeTableProps {
  rows: RegimeBreakdownRow[];
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(2)}%`;
}

export function RegimeTable({ rows }: RegimeTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Regime Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Segmento</TableHead>
              <TableHead>N</TableHead>
              <TableHead>P(Up 1D)</TableHead>
              <TableHead>EV 3D</TableHead>
              <TableHead>Worst 3D</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.segment}>
                <TableCell className="font-medium">{row.segment}</TableCell>
                <TableCell className="font-mono">{row.n}</TableCell>
                <TableCell>{formatPercent(row.pUp1d)}</TableCell>
                <TableCell>{formatPercent(row.ev3d)}</TableCell>
                <TableCell className={row.worst3d !== null && row.worst3d < 0 ? "text-danger" : ""}>
                  {formatPercent(row.worst3d)}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted">
                  Sin segmentos.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
