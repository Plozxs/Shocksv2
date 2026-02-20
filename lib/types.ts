export type Direction = "down" | "up";
export type ReturnType = "closeToClose" | "lowToPrevClose";
export type RangeOption = "1y" | "2y" | "5y" | "10y" | "max";

export type TrendRegime = "uptrend" | "downtrend";
export type VolRegime = "low" | "mid" | "high";
export type VolumeShockRegime = "shock" | "normal";

export type TrendFilter = "all" | TrendRegime;
export type VolFilter = "all" | VolRegime;
export type VolumeShockFilter = "all" | VolumeShockRegime;

export interface RegimeFilters {
  trend?: TrendFilter;
  vol?: VolFilter;
  volumeShock?: VolumeShockFilter;
}

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export interface EventStudyInput {
  ticker?: string;
  direction: Direction;
  thresholdPct: number;
  horizons: number[];
  maxHorizon?: number;
  cooldownDays: number;
  returnType: ReturnType;
  windowVolDays: number;
  trendMA: number;
  volumeZWindow: number;
  regimeFilters?: RegimeFilters;
}

export interface HorizonMetrics {
  horizon: number;
  n: number;
  pUp: number | null;
  pUpCI: [number, number] | null;
  mean: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
  worst: number | null;
  cvar95: number | null;
}

export interface EventObservation {
  index: number;
  date: string;
  eventReturn: number;
  forwardReturns: Record<number, number | null>;
  trend: TrendRegime;
  volRegime: VolRegime;
  volumeShock: VolumeShockRegime;
}

export interface ProbabilityWithCI {
  p: number | null;
  ci95: [number, number] | null;
}

export interface KpiSummary {
  eventCount: number;
  annualFrequency: number;
  independentPct: number;
  pUp1d: ProbabilityWithCI;
  pUp3d: ProbabilityWithCI;
  pUp5d: ProbabilityWithCI;
  expected3d: number | null;
  worst5d: number | null;
  cvar95_5d: number | null;
}

export interface ForwardCurvePoint {
  horizon: number;
  mean: number | null;
  median: number | null;
}

export interface RegimeBreakdownRow {
  segment: string;
  n: number;
  pUp1d: number | null;
  ev3d: number | null;
  worst3d: number | null;
}

export interface HeatmapCell {
  threshold: number;
  horizon: number;
  n: number;
  pUp: number | null;
  ev: number | null;
}

export interface EventStudyResult {
  ticker: string;
  generatedAt: string;
  dateRange: {
    start: string;
    end: string;
  };
  barsCount: number;
  horizons: number[];
  rawCandidateCount: number;
  allEvents: EventObservation[];
  selectedEvents: EventObservation[];
  horizonMetrics: HorizonMetrics[];
  kpis: KpiSummary;
  forwardCurve: ForwardCurvePoint[];
  histogramByHorizon: Record<string, number[]>;
  regimeBreakdown: RegimeBreakdownRow[];
  heatmap: HeatmapCell[];
  warnings: string[];
  insufficientSample: boolean;
}

export interface ScreenerItem {
  ticker: string;
  date: string;
  eventReturn: number;
  ev3d: number | null;
  pUp1d: number | null;
  n: number;
}
