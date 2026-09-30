'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';

export const CHART = { series: '#3f3f46', seriesDeep: '#0a0a0a', grid: '#e6e6e9', axis: '#71717a' };

/** Colores de identidad por barbero, en orden fijo (validado para daltonismo). */
export const STAFF_COLORS = ['#2f5bd3', '#d97706', '#0a9a8a', '#b83fc4', '#5f8f14', '#e0457b'];
export const staffColor = (index: number) => STAFF_COLORS[index] ?? '#8a8a93';

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export interface Point { label: string; value: number; detail?: string }

/** Columnas verticales para series de tiempo. Una sola serie: sin leyenda, el título la nombra. */
export function ColumnChart({
  data,
  format,
  height = 220,
  title,
  integer = false,
}: {
  data: Point[];
  format: (v: number) => string;
  height?: number;
  title: string;
  integer?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // El ancho del lienzo sigue al contenedor: el texto de los ejes queda en 11px reales en cualquier pantalla.
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);
  const H = W < 480 ? Math.round(height * 0.8) : height;
  const pad = { l: W < 480 ? 36 : 48, r: 8, t: 12, b: 28 };
  const max = useMemo(() => {
    const m = niceMax(Math.max(0, ...data.map((d) => d.value)));
    if (!integer) return m;
    const whole = Math.max(2, Math.ceil(m));
    return whole % 2 ? whole + 1 : whole;
  }, [data, integer]);
  const ticks = [0, max / 2, max];
  const band = (W - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(3, band - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor((W - pad.l) / 64)));

  return (
    <figure className="w-full">
      <div className="flex items-center justify-between gap-3">
        <figcaption className="text-[15px] font-medium">{title}</figcaption>
        <button
          type="button"
          onClick={() => setTable(!table)}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-mute hover:bg-field hover:text-ink"
          aria-pressed={table}
        >
          {table ? <BarChart3 size={14} strokeWidth={1.75} /> : <Table2 size={14} strokeWidth={1.75} />}
          {table ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>

      {table ? (
        <div className="mt-3 max-h-[260px] overflow-auto">
          <table className="w-full text-[14px]">
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-b border-line">
                  <td className="py-2 text-mute">{d.detail ?? d.label}</td>
                  <td className="tnum py-2 text-right">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={boxRef} className="relative mt-3" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
                <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={CHART.axis} className="tnum">
                  {format(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = pad.l + i * band + (band - barW) / 2;
              const top = y(d.value);
              const h = Math.max(0, H - pad.b - top);
              const r = Math.min(4, h, barW / 2);
              const path =
                h <= 0
                  ? ''
                  : `M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - pad.b} Z`;
              return (
                <g key={d.label}>
                  {path && <path d={path} fill={hover === i ? CHART.seriesDeep : CHART.series} opacity={hover === null || hover === i ? 1 : 0.55} style={{ transition: 'opacity 200ms, fill 200ms' }} />}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={CHART.axis}>
                      {d.label}
                    </text>
                  )}
                  {/* Zona de hover más grande que la barra */}
                  <rect x={pad.l + i * band} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-[13px] text-white shadow-pop"
              style={{
                left: Math.min(W - 64, Math.max(64, pad.l + hover * band + band / 2)),
                top: `${(y(data[hover].value) / H) * 100}%`,
                marginTop: -8,
              }}
            >
              <div className="text-white/70">{data[hover].detail ?? data[hover].label}</div>
              <div className="tnum font-medium">{format(data[hover].value)}</div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Barras horizontales para rankings (servicios, barberos). */
export function BarList({
  data,
  format,
  title,
  empty = 'Sin datos en este periodo',
}: {
  data: Point[];
  format: (v: number) => string;
  title: string;
  empty?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <figcaption className="text-[15px] font-medium">{title}</figcaption>
      {data.length === 0 && <p className="mt-4 text-[14px] text-mute">{empty}</p>}
      <ul className="mt-4 space-y-3.5">
        {data.map((d) => (
          <li key={d.label} className="group" title={d.detail}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="truncate">{d.label}</span>
              <span className="tnum shrink-0 text-mute">{format(d.value)}</span>
            </div>
            <div className="mt-1.5 h-2.5 w-full">
              <div
                className="h-full rounded-r-[4px] bg-[#3f3f46] transition-[width,background-color] duration-500 group-hover:bg-ink"
                style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line p-5">
      <div className="text-[14px] text-mute">{label}</div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em]">{value}</div>
      {sub && <div className="mt-2 text-[13px] text-soft">{sub}</div>}
    </div>
  );
}
