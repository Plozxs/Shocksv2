# Shock Lab

Dashboard cuantitativo en **Next.js + TypeScript** para estudiar shocks de mercado (caídas/subas por umbral) y medir probabilidades/retornos posteriores por horizonte.

## Qué hace

- Descarga histórico **daily OHLCV** desde **Yahoo Finance**.
- Detecta eventos por umbral (ej. `-10%` o `+10%`) con **cooldown** para evitar clusters.
- Calcula métricas forward para `1D, 2D, 3D, 5D, 10D`:
  - `P(Up)` + `IC 95% (Wilson)`
  - `E[ret]`, mediana, `p10`, `p90`, worst-case
  - `CVaR 95%`
- Segmenta por regímenes:
  - Trend (`slope MA200 +/-`)
  - Vol regime (`RV20` percentiles)
  - Volume shock (`z-score`)
- Incluye **Today Screener** para watchlist fija (top 10) y detecta si el último día cumple evento.
- Exporta snapshot en **PNG (16:9)** para compartir.

## Stack

- Next.js (App Router), React, TypeScript
- TailwindCSS + shadcn/ui style components
- Recharts
- TanStack Table
- zod
- yahoo-finance2
- html-to-image

## Arquitectura

### Data Layer

- `app/api/prices/route.ts`
  - Valida input con zod.
  - Consulta Yahoo Finance (wrapper `lib/yahoo.ts`).
  - Retorna serie daily normalizada.
- `app/api/screener/route.ts`
  - Corre watchlist default.
  - Detecta evento en último día.
  - Rankea por `ev3d` o `pUp1d`.

### Event Engine

- `lib/eventEngine.ts`
  - Detección de eventos + cooldown.
  - Cálculo de retornos forward por horizonte.
  - KPI summary, tabla de horizontes, heatmap, breakdown por régimen.
  - Cache TTL in-memory para resultados computados.
- `lib/regimes.ts`
  - RV, MA slope, volume z-score y clasificación de regímenes.
- `lib/stats.ts`
  - Percentiles, Wilson CI, CVaR, media/mediana/std.

### UI Layer

- `app/page.tsx`
  - Layout 12 columnas (sidebar inputs + main analytics).
  - Estado sincronizado con query params para links compartibles.
  - Header sticky con timestamp actualizado.
- `components/*`
  - KPIs, panel de inputs, tabla de horizontes, charts, breakdown, skeletons, export snapshot.

## Estructura principal

```txt
app/
  page.tsx
  api/
    prices/route.ts
    screener/route.ts
lib/
  yahoo.ts
  eventEngine.ts
  stats.ts
  regimes.ts
  types.ts
components/
  KpiCard.tsx
  InputsPanel.tsx
  HorizonTable.tsx
  ReturnHistogram.tsx
  ForwardCurveChart.tsx
  RegimeTable.tsx
  SnapshotExport.tsx
  LoadingSkeletons.tsx
  ui/*
```

## Cómo correr local

1. Instalar dependencias:

```bash
npm install
```

2. Levantar desarrollo:

```bash
npm run dev
```

3. Abrir:

```txt
http://localhost:3000
```

## Endpoints

- `GET /api/prices?ticker=SPY&range=5y`
- `GET /api/screener?threshold=10&direction=down`

Parámetros relevantes:

- `ticker`: string (ej. `SPY`, `BTC-USD`)
- `range`: `1y | 2y | 5y | 10y | max`
- `threshold`: porcentaje absoluto del shock
- `direction`: `down | up`
- `cooldown`: días a ignorar tras evento
- `rankBy`: `ev3d | pUp1d`

## Limitaciones Yahoo Finance

- Fuente gratuita no oficial para producción crítica.
- Puede tener retrasos, gaps o ajustes corporativos inconsistentes según activo.
- Cobertura y calidad de volumen/adj close varía por ticker.
- En mercados cerrados (finde/feriados), “today event” se basa en el **último día disponible**.

## Roadmap

1. Bootstrap / block-bootstrap para intervalos en retornos esperados.
2. Regímenes adicionales (gap day, ATR shock, breadth proxy).
3. Persistencia de snapshots/estudios (DB + sharable IDs).
4. Backtest portfolio-level y señales combinadas multi-factor.
5. Modo multi-ticker batch en UI (comparativo lado a lado).
