# Shock Lab

Dashboard cuantitativo para estudiar shocks de mercado: dada una serie de precios diarios, detecta eventos de caída/suba por umbral y mide las distribuciones de retorno posteriores a múltiples horizontes.

---

## El modelo matemático

### 1. Retorno diario

Para una serie de precios de cierre $c_0, c_1, \ldots, c_T$, el retorno close-to-close es:

$$r_t = \frac{c_t}{c_{t-1}} - 1$$

El modo alternativo *low-to-prev-close* usa $\text{low}_t$ en lugar de $c_t$ para capturar el peor punto intradía:

$$r_t^{\text{low}} = \frac{\text{low}_t}{c_{t-1}} - 1$$

### 2. Definición de shock

Un shock ocurre en el día $t$ si el retorno supera el umbral $\theta$ en la dirección elegida:

$$\text{evento}_t = \begin{cases} 1 & \text{si } r_t \leq -\theta \quad (\text{caída}) \\ 1 & \text{si } r_t \geq +\theta \quad (\text{suba}) \\ 0 & \text{si no} \end{cases}, \quad \theta = \frac{|\text{thresholdPct}|}{100}$$

Para evitar que eventos consecutivos (cluster) dominen la muestra, se aplica un **cooldown de $k$ días**: detectado un evento en $t_i$, el próximo evento posible es $t > t_i + k$.

### 3. Retornos forward

Para cada evento en $t_i$, el retorno a horizonte $h$ es:

$$R_{i,h} = \frac{c_{t_i + h}}{c_{t_i}} - 1$$

Estos son los datos centrales del estudio: la distribución empírica de $\{R_{i,h}\}_{i=1}^{n_h}$ para cada horizonte $h \in \{1, 2, 3, 5, 10\}$.

### 4. Tasa de acierto y su incertidumbre

La probabilidad empírica de subida a horizonte $h$ es:

$$\hat{p}_h = \frac{|\{i : R_{i,h} > 0\}|}{n_h}$$

En lugar del intervalo de Wald (que falla con muestras chicas), se usa el **intervalo de Wilson**. Dado $k$ éxitos en $n$ intentos y $z = 1.96$ (cuantil 97.5% de la normal estándar):

$$\tilde{p} = \frac{n\hat{p} + z^2/2}{n + z^2}, \qquad m = \frac{z}{n + z^2}\sqrt{n\,\hat{p}(1-\hat{p}) + \frac{z^2}{4}}$$

$$\text{IC}_{95} = \left[\max\!\left(0,\; \tilde{p} - m\right),\quad \min\!\left(1,\; \tilde{p} + m\right)\right]$$

El intervalo de Wilson es invariante a la transformación de éxito/fracaso y cubre la proporción real con probabilidad nominal incluso para $n < 30$.

### 5. CVaR (Expected Shortfall)

El **Valor en Riesgo Condicional** al nivel $\alpha$ mide la pérdida esperada en el peor $(1-\alpha)$ de los casos:

$$\text{CVaR}_\alpha = \mathbb{E}\left[R \mid R \leq \text{VaR}_{1-\alpha}\right]$$

donde $\text{VaR}_{1-\alpha} = P_{1-\alpha}$ es el percentil $(1-\alpha)$ de la distribución empírica. Con $\alpha = 0.95$:

$$\text{CVaR}_{0.95} = \frac{1}{|\mathcal{T}|} \sum_{i \in \mathcal{T}} R_{i,h}, \qquad \mathcal{T} = \{i : R_{i,h} \leq P_{0.05}\}$$

A diferencia del VaR (un cuantil), el CVaR es coherente: es convexo y monótono en el sentido de dominancia estocástica.

### 6. Estadísticas descriptivas

**Desvío estándar muestral** (corrección de Bessel para estimación insesgada de la varianza):

$$s = \sqrt{\frac{1}{n-1} \sum_{i=1}^{n} (R_i - \bar{R})^2}$$

**Percentil con interpolación lineal**: para el cuantil $q$ sobre $n$ observaciones ordenadas $x_{(1)} \leq \ldots \leq x_{(n)}$:

$$\text{pos} = (n-1) \cdot q, \qquad P_q = (1-w)\, x_{(\lfloor\text{pos}\rfloor + 1)} + w\, x_{(\lceil\text{pos}\rceil + 1)}, \quad w = \text{pos} - \lfloor\text{pos}\rfloor$$

---

## Clasificación de regímenes

Cada evento es etiquetado por las condiciones de mercado en el momento en que ocurre.

### Tendencia (MA slope)

$$\text{MA}_t^{(k)} = \frac{1}{k} \sum_{j=t-k+1}^{t} c_j, \qquad \text{slope}_t = \text{MA}_t^{(k)} - \text{MA}_{t-20}^{(k)}$$

- **Uptrend**: $\text{slope}_t > 0$
- **Downtrend**: $\text{slope}_t \leq 0$

### Volatilidad realizada (ventana móvil, anualizada)

$$\sigma_t^{\text{rv}} = \hat{s}(r_{t-w+1}, \ldots, r_t) \cdot \sqrt{252}$$

donde $\hat{s}$ es el desvío estándar muestral y $w$ es la ventana en días. Los percentiles $P_{20}$ y $P_{80}$ de $\sigma^{\text{rv}}$ sobre toda la muestra dividen el régimen en tres:

$$\text{vol regime}_t = \begin{cases} \text{high} & \text{si } \sigma_t^{\text{rv}} > P_{80} \\ \text{low} & \text{si } \sigma_t^{\text{rv}} < P_{20} \\ \text{mid} & \text{si no} \end{cases}$$

### Shock de volumen

$$z_t^V = \frac{V_t - \bar{V}_t}{\hat{s}_V(t)}, \quad \text{shock si } z_t^V > 2$$

donde $\bar{V}_t$ y $\hat{s}_V(t)$ son la media y el desvío de volumen en ventana móvil.

---

## Heatmap de sensibilidad

Para estudiar la robustez de los resultados ante cambios en el umbral, se evalúa la función $(\theta, h) \mapsto (\hat{p}_h, \mathbb{E}[R_{i,h}])$ en una grilla:

$$\theta \in \{0.5\bar{\theta},\; 0.75\bar{\theta},\; \bar{\theta},\; 1.25\bar{\theta},\; 1.5\bar{\theta}\}, \qquad h \in \{1, 2, 3, 5, 10\}$$

donde $\bar{\theta}$ es el umbral base. Si $\hat{p}_h$ es estable al variar $\theta$, el hallazgo es robusto; si colapsa, es artefacto del umbral elegido.

---

## Estructura del cálculo

```
serie OHLCV (Yahoo Finance)
        │
        ├─ computeCloseToCloseReturns()     r_t = c_t/c_{t-1} - 1
        ├─ buildRegimeFeatures()            MA, slope, σ^rv, z^V
        │
        ├─ selectEventIndices()             shocks + cooldown
        │
        ├─ buildForwardReturns()            R_{i,h} = c_{t+h}/c_t - 1
        │
        └─ summarizeHorizon()  por cada h:
              ├── pUp, wilsonInterval()     P(subida) + IC 95%
              ├── mean, median, p10, p90
              └── cvar(α=0.95)             E[R | R ≤ P_0.05]
```

---

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Recharts · TanStack Table · yahoo-finance2 · Zod

---

## Correr local

```bash
npm install
npm run dev    # http://localhost:3000
```

## Endpoints

| Endpoint | Parámetros principales |
|---|---|
| `GET /api/prices` | `ticker`, `range` (1y/2y/5y/10y/max) |
| `GET /api/screener` | `threshold`, `direction` (down/up), `cooldown`, `rankBy` |

---

> **Nota**: Yahoo Finance es una fuente no oficial. Los datos pueden tener retrasos, gaps o ajustes corporativos inconsistentes. No usar en producción crítica.
