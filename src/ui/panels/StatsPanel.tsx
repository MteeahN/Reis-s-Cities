import { useMemo, useState, type PointerEvent } from 'react';
import type { StatsMetric, StatsSample } from '../../game/systems/StatsHistory';
import { useGameStore } from '../../store/gameStore';
import { formatGameDate, formatMoney, formatNumber } from '../../utils/format';
import { Icon } from '../components/Icon';

interface Series {
  key: StatsMetric;
  label: string;
  color: string;
}

interface MetricDef {
  id: string;
  label: string;
  series: Series[];
  format: (v: number) => string;
  /** Fixed y range (e.g. percentages); otherwise fitted to the data from 0. */
  domain?: [number, number];
}

// Colours validated for the dark panel surface (dataviz validator: lightness band, CVD, contrast).
const LINE = '#1fa67a';
const pct = (v: number) => `%${Math.round(v)}`;
const money = (v: number) => (v < 0 ? '−' : '') + formatMoney(Math.abs(v));

const METRICS: MetricDef[] = [
  { id: 'population', label: 'Nüfus', series: [{ key: 'population', label: 'Nüfus', color: LINE }], format: (v) => formatNumber(Math.round(v)) },
  { id: 'happiness', label: 'Mutluluk', series: [{ key: 'happiness', label: 'Mutluluk', color: LINE }], format: pct, domain: [0, 100] },
  { id: 'balance', label: 'Bütçe', series: [{ key: 'balance', label: 'Bütçe', color: LINE }], format: money },
  { id: 'income', label: 'Günlük gelir', series: [{ key: 'income', label: 'Gelir', color: LINE }], format: money },
  { id: 'expenses', label: 'Günlük gider', series: [{ key: 'expenses', label: 'Gider', color: LINE }], format: money },
  { id: 'unemployment', label: 'İşsizlik', series: [{ key: 'unemployment', label: 'İşsizlik', color: LINE }], format: (v) => `%${(v * 100).toFixed(1)}`, domain: [0, 1] },
  { id: 'jobs', label: 'İş yeri', series: [{ key: 'jobs', label: 'İş yeri', color: LINE }], format: (v) => formatNumber(Math.round(v)) },
  { id: 'congestion', label: 'Trafik yoğunluğu', series: [{ key: 'congestion', label: 'Yoğunluk', color: LINE }], format: (v) => `%${Math.round(v * 100)}` },
  { id: 'commute', label: 'İşe ulaşım', series: [{ key: 'commuteMinutes', label: 'Ortalama süre', color: LINE }], format: (v) => `${v.toFixed(1)} dk` },
  { id: 'health', label: 'Sağlık', series: [{ key: 'health', label: 'Sağlık', color: LINE }], format: pct, domain: [0, 100] },
  { id: 'crime', label: 'Suç', series: [{ key: 'crime', label: 'Suç', color: LINE }], format: pct, domain: [0, 100] },
  {
    id: 'buildings',
    label: 'Binalar',
    series: [
      { key: 'residential', label: 'Konut', color: '#22a855' },
      { key: 'commercial', label: 'Ticaret', color: '#3b82f6' },
      { key: 'industrial', label: 'Sanayi', color: '#b8860b' },
    ],
    format: (v) => formatNumber(Math.round(v)),
  },
];

const RANGES: { label: string; minutes: number | null }[] = [
  { label: '1 gün', minutes: 1440 },
  { label: '7 gün', minutes: 7 * 1440 },
  { label: '30 gün', minutes: 30 * 1440 },
  { label: 'Tümü', minutes: null },
];

const W = 560;
const H = 220;
const PAD = { l: 64, r: 64, t: 12, b: 26 };

/** Rounded tick step (1, 2, 2.5, 5 × 10^n) for about `n` intervals. */
function niceStep(span: number, n: number): number {
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

function Chart({ metric, samples }: { metric: MetricDef; samples: StatsSample[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const t0 = samples[0].t;
  const t1 = Math.max(samples[samples.length - 1].t, t0 + 60);
  const values = samples.flatMap((s) => metric.series.map((x) => s[x.key]));
  let lo = metric.domain?.[0] ?? Math.min(0, ...values);
  let hi = metric.domain?.[1] ?? Math.max(...values);
  if (!metric.domain) {
    if (hi <= lo) hi = lo + 1;
    const step = niceStep(hi - lo, 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
  }
  const step = niceStep(hi - lo, 4);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(v);
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const days = (t1 - t0) / 1440;
  const dayStep = days <= 1.5 ? 0.25 : niceStep(days, 5);
  const xTicks: number[] = [];
  for (let d = Math.ceil(t0 / 1440 / dayStep) * dayStep; d * 1440 <= t1; d += dayStep) xTicks.push(d * 1440);
  const dayOf = (t: number) => `${Math.floor(t / 1440) + 1}. gün`;
  const xLabel = (t: number) => (dayStep >= 1 ? dayOf(t) : days > 1 ? `${dayOf(t)} ${formatGameDate(t).time}` : formatGameDate(t).time);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < samples.length; i++) if (Math.abs(samples[i].t - t) < Math.abs(samples[best].t - t)) best = i;
    setHover(best);
  };
  const hs = hover !== null ? samples[hover] : null;
  const last = samples[samples.length - 1];
  const multi = metric.series.length > 1;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${metric.label} grafiği`} data-testid="stats-chart">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === lo ? 'chart-base' : 'chart-grid'} />
            <text x={PAD.l - 8} y={y(v) + 4} className="chart-tick" textAnchor="end">
              {metric.format(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} className="chart-tick" textAnchor="middle">
            {xLabel(t)}
          </text>
        ))}
        {metric.series.map((s) => (
          <polyline
            key={s.key}
            points={samples.map((p) => `${x(p.t).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* Direct label at the end of each line (identity is never colour alone). */}
        {metric.series.map((s) => (
          <g key={s.key}>
            <circle cx={x(last.t)} cy={y(last[s.key])} r={4} fill={s.color} className="chart-dot" />
            <text x={x(last.t) + 8} y={y(last[s.key]) + 4} className="chart-end-label">
              {multi ? s.label : metric.format(last[s.key])}
            </text>
          </g>
        ))}
        {hs && (
          <g>
            <line x1={x(hs.t)} x2={x(hs.t)} y1={PAD.t} y2={H - PAD.b} className="chart-cross" />
            {metric.series.map((s) => (
              <circle key={s.key} cx={x(hs.t)} cy={y(hs[s.key])} r={4} fill={s.color} className="chart-dot" />
            ))}
          </g>
        )}
      </svg>
      {hs && (
        <div className="chart-tip" style={{ left: `${(x(hs.t) / W) * 100}%` }} data-testid="chart-tip">
          <div className="chart-tip-date">
            {formatGameDate(hs.t).date} {formatGameDate(hs.t).time}
          </div>
          {metric.series.map((s) => (
            <div key={s.key} className="chart-tip-row">
              <span className="sw-line" style={{ background: s.color }} />
              <span>{s.label}</span>
              <strong>{metric.format(hs[s.key])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataTable({ metric, samples }: { metric: MetricDef; samples: StatsSample[] }) {
  // Newest first; at most 48 rows (thinned evenly for long ranges).
  const stride = Math.max(1, Math.ceil(samples.length / 48));
  const rows = samples.filter((_, i) => (samples.length - 1 - i) % stride === 0).reverse();
  return (
    <div className="chart-table-wrap">
      <table className="chart-table" data-testid="stats-table">
        <thead>
          <tr>
            <th>Zaman</th>
            {metric.series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t}>
              <td>
                {formatGameDate(r.t).date} {formatGameDate(r.t).time}
              </td>
              {metric.series.map((s) => (
                <td key={s.key}>{metric.format(r[s.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsPanel() {
  const open = useGameStore((s) => s.popup === 'stats');
  const history = useGameStore((s) => s.history);
  const set = useGameStore((s) => s.set);
  const [metricId, setMetricId] = useState('population');
  const [range, setRange] = useState<number | null>(7 * 1440);
  const [table, setTable] = useState(false);
  const samples = useMemo(() => {
    if (range === null || history.length === 0) return history;
    const end = history[history.length - 1].t;
    return history.filter((s) => s.t >= end - range);
  }, [history, range]);
  if (!open) return null;
  const metric = METRICS.find((m) => m.id === metricId)!;
  const last = samples[samples.length - 1];
  const first = samples[0];

  return (
    <div className="panel popover stats-panel" data-testid="stats-panel">
      <div className="panel-header">
        <h3>
          <Icon name="chart" size={16} /> İstatistikler
        </h3>
        <button className="icon-btn small" onClick={() => set({ popup: null })} title="Kapat">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="stats-layout">
        <div className="metric-list" role="tablist" aria-label="Gösterge">
          {METRICS.map((m) => (
            <button key={m.id} role="tab" aria-selected={m.id === metricId} className={m.id === metricId ? 'active' : ''} onClick={() => setMetricId(m.id)} data-testid={`metric-${m.id}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="stats-main">
          <div className="stats-toolbar">
            <div className="segmented">
              {RANGES.map((r) => (
                <button key={r.label} className={range === r.minutes ? 'active' : ''} onClick={() => setRange(r.minutes)} data-testid={`range-${r.minutes ?? 'all'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <label className="toggle compact">
              <input type="checkbox" checked={table} onChange={() => setTable(!table)} data-testid="stats-table-toggle" />
              <span>Tablo</span>
            </label>
          </div>
          {samples.length < 2 ? (
            <p className="hint" data-testid="stats-empty">
              Geçmiş her oyun saatinde bir kaydedilir. Grafik için en az iki kayıt gerekiyor — biraz bekleyin.
            </p>
          ) : (
            <>
              <div className="stats-headline">
                <span className="stats-title">{metric.label}</span>
                {!metric.series[1] && last && (
                  <>
                    <strong className="stats-hero">{metric.format(last[metric.series[0].key])}</strong>
                    <span className="muted small">
                      dönem başı {metric.format(first[metric.series[0].key])}
                    </span>
                  </>
                )}
              </div>
              {metric.series.length > 1 && (
                <div className="chart-legend">
                  {metric.series.map((s) => (
                    <span key={s.key}>
                      <span className="sw-line" style={{ background: s.color }} /> {s.label}
                    </span>
                  ))}
                </div>
              )}
              {table ? <DataTable metric={metric} samples={samples} /> : <Chart metric={metric} samples={samples} />}
              <p className="hint">{samples.length} kayıt · her oyun saatinde bir ölçülür; eski kayıtlar seyreltilerek saklanır.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
