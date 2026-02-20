"use client";

import { RefreshCcw, Info } from "lucide-react";
import {
  Direction,
  RangeOption,
  ReturnType,
  TrendFilter,
  VolFilter,
  VolumeShockFilter,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface DashboardInputs {
  ticker: string;
  range: RangeOption;
  direction: Direction;
  thresholdPct: number;
  maxHorizon: number;
  cooldownDays: number;
  windowVolDays: number;
  trendMA: number;
  volumeZWindow: number;
  returnType: ReturnType;
  trendFilter: TrendFilter;
  volFilter: VolFilter;
  volumeShockFilter: VolumeShockFilter;
  screenerRankBy: "ev3d" | "pUp1d";
}

interface InputsPanelProps {
  value: DashboardInputs;
  onChange: (patch: Partial<DashboardInputs>) => void;
  onRefresh: () => void;
  loading?: boolean;
}

function Hint({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted transition-colors hover:text-accent"
            aria-label="Ayuda"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-xs leading-relaxed">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LabelRow({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
      <span>{label}</span>
      {hint ? <Hint text={hint} /> : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function InputsPanel({ value, onChange, onRefresh, loading = false }: InputsPanelProps) {
  const updateNumber =
    (field: keyof DashboardInputs, min: number, max: number) =>
    (nextValue: string) => {
      const parsed = Number(nextValue);
      if (Number.isNaN(parsed)) {
        return;
      }
      onChange({ [field]: clamp(parsed, min, max) } as Partial<DashboardInputs>);
    };

  return (
    <Card className="sticky top-16">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Shock Setup</CardTitle>
          <Badge variant="secondary">{value.direction === "down" ? "Mean Reversion" : "Momentum"}</Badge>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="w-full justify-center gap-2"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Recalcular
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <LabelRow label="Ticker" />
          <Input
            value={value.ticker}
            onChange={(event) => onChange({ ticker: event.target.value.toUpperCase().trim() })}
            placeholder="SPY"
          />
        </div>

        <div>
          <LabelRow label="Range Yahoo" />
          <Select value={value.range} onValueChange={(range) => onChange({ range: range as RangeOption })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1y">1 año</SelectItem>
              <SelectItem value="2y">2 años</SelectItem>
              <SelectItem value="5y">5 años</SelectItem>
              <SelectItem value="10y">10 años</SelectItem>
              <SelectItem value="max">Máximo disponible</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <LabelRow label="Dirección" />
            <Select
              value={value.direction}
              onValueChange={(direction) => onChange({ direction: direction as Direction })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="down">Caída</SelectItem>
                <SelectItem value="up">Suba</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <LabelRow label="Umbral %" />
            <Input
              type="number"
              step="0.5"
              min={1}
              max={40}
              value={value.thresholdPct}
              onChange={(event) => updateNumber("thresholdPct", 1, 40)(event.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <LabelRow
              label="Máx horizonte"
              hint="La tabla y charts usarán [1,2,3,5,10] filtrado hasta este valor."
            />
            <Select
              value={String(value.maxHorizon)}
              onValueChange={(maxHorizon) => onChange({ maxHorizon: Number(maxHorizon) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3D</SelectItem>
                <SelectItem value="5">5D</SelectItem>
                <SelectItem value="10">10D</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <LabelRow
              label="Cooldown"
              hint="Tras un evento, ignora los siguientes N días para evitar clusters."
            />
            <Input
              type="number"
              min={0}
              max={30}
              value={value.cooldownDays}
              onChange={(event) => updateNumber("cooldownDays", 0, 30)(event.target.value)}
            />
          </div>
        </div>

        <div>
          <LabelRow label="Tipo de retorno evento" />
          <Select
            value={value.returnType}
            onValueChange={(returnType) => onChange({ returnType: returnType as ReturnType })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="closeToClose">Close / Prev Close - 1</SelectItem>
              <SelectItem value="lowToPrevClose">Low / Prev Close - 1</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <LabelRow label="Vol ventana" hint="Rolling std para RV (días)." />
            <Input
              type="number"
              min={5}
              max={120}
              value={value.windowVolDays}
              onChange={(event) => updateNumber("windowVolDays", 5, 120)(event.target.value)}
            />
          </div>
          <div>
            <LabelRow label="Trend MA" />
            <Input
              type="number"
              min={20}
              max={400}
              value={value.trendMA}
              onChange={(event) => updateNumber("trendMA", 20, 400)(event.target.value)}
            />
          </div>
          <div>
            <LabelRow label="Vol Z win" />
            <Input
              type="number"
              min={5}
              max={120}
              value={value.volumeZWindow}
              onChange={(event) => updateNumber("volumeZWindow", 5, 120)(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-border/70 pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Filtros de régimen
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <LabelRow label="Trend" />
              <Select
                value={value.trendFilter}
                onValueChange={(trendFilter) => onChange({ trendFilter: trendFilter as TrendFilter })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="uptrend">Uptrend</SelectItem>
                  <SelectItem value="downtrend">Downtrend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <LabelRow label="Vol regime" />
              <Select value={value.volFilter} onValueChange={(volFilter) => onChange({ volFilter: volFilter as VolFilter })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="mid">Mid</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <LabelRow label="Volume shock" />
              <Select
                value={value.volumeShockFilter}
                onValueChange={(volumeShockFilter) =>
                  onChange({ volumeShockFilter: volumeShockFilter as VolumeShockFilter })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="shock">Shock (z &gt; 2)</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-border/70 pt-3">
          <LabelRow label="Ranking Screener" />
          <Select
            value={value.screenerRankBy}
            onValueChange={(screenerRankBy) =>
              onChange({ screenerRankBy: screenerRankBy as DashboardInputs["screenerRankBy"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ev3d">EV 3D</SelectItem>
              <SelectItem value="pUp1d">P(Up 1D)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
