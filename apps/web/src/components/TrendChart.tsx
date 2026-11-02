import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table2, LineChart as LineIcon } from 'lucide-react';
import { useFmt } from '../lib/prefs';
import { cx } from './ui';

export interface ChartSeries {
  key: string;
  label: string;
  /** Fixed categorical slot (1-4). Colour follows the entity, never its position. */
  slot: 1 | 2 | 3 | 4;
  /** One exact paisa value per bucket. */
  values: bigint[];
}
export interface ChartBucket {
  label: string; // x-axis label
  title: string; // tooltip heading
}

const H = 300;
const M = { top: 16, right: 120, bottom: 34, left: 72 };
const color = (slot: number) => `rgb(var(--series-${slot}))`;
const rupees = (p: bigint) => Number(p) / 100; // plotting coordinates only; every printed value uses exact paisa

/** "Nice" axis ticks (1, 2, 2.5, 5 × 10^n). */
function niceTicks(min: number, max: number, count = 4) {
  if (max <= min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Monotone cubic path (Fritsch–Carlson): smooth like a spline but never overshoots a data point,
 * so the curve can never show a rupee amount (or a negative) that did not happen.
 */
function monotonePath(pts: [number, number][]) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/** Line chart for money over time: series switches, crosshair tooltip, end labels, table view. */
export function TrendChart({ title, buckets, series, reference, controls, emptyText }: { title: ReactNode; buckets: ChartBucket[]; series: ChartSeries[]; reference?: { label: string; value: bigint } | null; controls?: ReactNode; emptyText?: string }) {
  const { t } = useTranslation();
  const { paisa, digits, lang } = useFmt();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]); // re-attach when returning from the table view

  const visible = series.filter((s) => !hidden.has(s.key));
  const narrow = width < 560;
  // Room for the direct end labels, sized to the longest visible label (≈7.5px per glyph at 12px).
  const right = narrow ? 16 : Math.min(240, Math.max(M.right, 30 + Math.max(0, ...visible.map((s) => s.label.length)) * 7.5));
  const pw = width - M.left - right;
  const ph = H - M.top - M.bottom;

  const { ticks, y } = useMemo(() => {
    const all = visible.flatMap((s) => s.values.map(rupees));
    if (reference) all.push(rupees(reference.value));
    const ticks = niceTicks(Math.min(0, ...all), Math.max(1, ...all));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    return { ticks, y: (v: number) => M.top + ph - ((v - lo) / (hi - lo)) * ph };
  }, [visible, reference, ph]);

  const x = (i: number) => M.left + (buckets.length <= 1 ? pw / 2 : (i / (buckets.length - 1)) * pw);
  const empty = series.every((s) => s.values.every((v) => v === 0n));

  /** Short axis numbers in the lakh/crore system. */
  const short = (r: number) => {
    const a = Math.abs(r);
    const [div, ne, en] = a >= 1e7 ? [1e7, 'करोड', 'Cr'] : a >= 1e5 ? [1e5, 'लाख', 'L'] : a >= 1e3 ? [1e3, 'हजार', 'K'] : [1, '', ''];
    const n = Math.round((r / div) * 100) / 100;
    return digits(`${n}${div === 1 ? '' : lang === 'ne' ? ` ${ne}` : en}`);
  };

  // Direct labels at the line ends, nudged apart so they never collide.
  const endLabels = useMemo(() => {
    if (narrow || !buckets.length) return [];
    const last = buckets.length - 1;
    const items = visible.map((s) => ({ s, y: y(rupees(s.values[last])) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 15) items[i].y = items[i - 1].y + 15;
    // Keep the stack inside the plot (lines ending at 0 would otherwise spill onto the x-axis labels).
    const bottom = M.top + ph - 6;
    const over = items.length ? items[items.length - 1].y - bottom : 0;
    if (over > 0) for (const it of items) it.y -= over;
    return items;
  }, [visible, buckets, y, narrow, ph]);

  const pick = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const px = clientX - rect.left - M.left;
    const i = buckets.length <= 1 ? 0 : Math.round((px / pw) * (buckets.length - 1));
    setHover(Math.max(0, Math.min(buckets.length - 1, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(buckets.length - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? buckets.length) - 1));
    else if (e.key === 'Escape') setHover(null);
  };
  const toggle = (k: string) => setHidden((h) => (h.has(k) ? (h.delete(k), new Set(h)) : new Set(h.add(k))));

  const tipLeft = hover !== null ? x(hover) : 0;
  const tipFlip = tipLeft > width - 240;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      {/* Header: title · series switches (the legend) · period control */}
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2" role="group" aria-label="series">
          {series.map((s) => {
            const on = !hidden.has(s.key);
            return (
              <button key={s.key} type="button" role="switch" aria-checked={on} onClick={() => toggle(s.key)} className="flex items-center gap-2 text-sm text-fg">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: color(s.slot) }} />
                <span className={cx(!on && 'text-subtle')}>{s.label}</span>
                <span className={cx('relative h-5 w-9 rounded-full transition', on ? 'bg-primary-soft' : 'bg-muted')}>
                  <span className={cx('absolute top-0.5 h-4 w-4 rounded-full transition-all', on ? 'left-[18px]' : 'left-0.5 bg-subtle')} style={on ? { background: color(s.slot) } : undefined} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {controls}
          <button type="button" onClick={() => setTable(!table)} title={table ? t('chart.chartView') : t('chart.tableView')} className="grid h-10 w-10 place-items-center rounded-md border border-border hover:bg-muted">
            {table ? <LineIcon className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-subtle">
              <tr>
                <th className="px-3 py-2" />
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5">{b.title}</td>
                  {series.map((s) => (
                    <td key={s.key} className="num px-3 py-1.5">
                      {paisa(s.values[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={box}
          className="relative select-none outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          tabIndex={0}
          aria-label={typeof title === 'string' ? title : undefined}
          onKeyDown={onKey}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
        >
          <svg width={width} height={H} role="img" className="block">
            {/* recessive grid + y axis in the lakh/crore system */}
            {ticks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + pw} y1={y(v)} y2={y(v)} stroke="rgb(var(--border))" strokeWidth={1} />
                <text x={M.left - 10} y={y(v)} dy="0.32em" textAnchor="end" className="fill-subtle text-[12px] tabular-nums">
                  {short(v)}
                </text>
              </g>
            ))}
            {buckets.map((b, i) => (
              <text key={i} x={x(i)} y={H - 10} textAnchor="middle" className={cx('fill-subtle text-[12px]', narrow && i % 2 === 1 && 'hidden')}>
                {b.label}
              </text>
            ))}
            {/* reference line, e.g. appropriation (विनियोजित) */}
            {reference && (
              <g>
                <line x1={M.left} x2={M.left + pw} y1={y(rupees(reference.value))} y2={y(rupees(reference.value))} stroke="rgb(var(--subtle))" strokeWidth={1.5} strokeDasharray="6 5" />
                <text x={M.left + 6} y={y(rupees(reference.value)) - 6} className="fill-subtle text-[12px]">
                  {reference.label}: {paisa(reference.value)}
                </text>
              </g>
            )}
            {/* series */}
            {visible.map((s) => (
              <path key={s.key} d={monotonePath(s.values.map((v, i) => [x(i), y(rupees(v))]))} fill="none" stroke={color(s.slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* direct end labels */}
            {endLabels.map(({ s, y: ly }) => (
              <text key={s.key} x={M.left + pw + 10} y={ly} dy="0.32em" className="fill-fg text-[12px] font-medium">
                <tspan fill={color(s.slot)}>● </tspan>
                {s.label}
              </text>
            ))}
            {/* crosshair + points */}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ph} stroke="rgb(var(--subtle))" strokeWidth={1} strokeDasharray="4 4" />
                {visible.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(rupees(s.values[hover]))} r={5} fill={color(s.slot)} stroke="rgb(var(--surface))" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
          {empty && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-subtle">{emptyText ?? t('common.noData')}</div>}
          {hover !== null && visible.length > 0 && (
            <div
              className="pointer-events-none absolute z-10 min-w-[200px] rounded-xl border border-border bg-surface px-4 py-3 shadow-lg"
              style={{ top: M.top, left: tipFlip ? undefined : tipLeft + 14, right: tipFlip ? width - tipLeft + 14 : undefined }}
            >
              <div className="mb-2 text-center text-sm font-semibold">{buckets[hover].title}</div>
              <div className="space-y-1.5">
                {visible.map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="inline-block h-1 w-4 shrink-0 rounded" style={{ background: color(s.slot) }} />
                    <span className="text-base font-semibold tabular-nums">{paisa(s.values[hover])}</span>
                    <span className="ml-auto pl-3 text-xs text-subtle">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
