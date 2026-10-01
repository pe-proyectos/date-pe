'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp, Receipt, Users, Download, Plus, Trash2, FileText, Camera, Paperclip, Loader2, X, Banknote, Smartphone, CreditCard, Landmark,
  Table2, BarChart3, FileSpreadsheet, HandCoins, History, TriangleAlert, Check, Wallet,
} from 'lucide-react';
import { useAdmin, soles, solesShort } from './api';
import { PageHead, Btn, Field, inputCls, Empty, Skeleton, Switch } from './ui';
import { Sheet } from '@/components/Sheet';
import { BarList, StatTile, CHART } from '@/components/charts';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { uploadImage } from '@/lib/upload';
import { API_BASE_CLIENT } from '@/lib/config';

/* ------------------------------ Tipos ------------------------------ */

interface Profit {
  ventasCents: number; propinasCents: number; comisionesCents: number; costoProductosCents: number; gastosCents: number; utilidadCents: number; margen: number;
  pagadoEquipoCents: number; gastosPorCategoria: { category: string; cents: number }[];
  mensual: { mes: string; ventas_cents: number; gastos_cents: number; comisiones_cents: number; utilidad_cents: number }[];
}
interface Expense { id: string; spent_on: string; category: string; amount_cents: number; method: string | null; note: string | null; receipt_url: string | null; created_by_name: string | null }
interface PayStaff {
  staff_id: string; name: string; photo_url: string | null; commission_percent: number; services_cents: number; commission_cents: number; product_commission_cents: number;
  tips_cents: number; advances_cents: number; total_cents: number; clientes: number; last_paid_until: string | null;
}
interface Payout { id: string; staff_id: string; name: string; period_start: string; period_end: string; total_cents: number; method: string; paid_at: string; note: string | null }
interface Advance { id: string; staff_id: string; name: string; amount_cents: number; note: string | null; given_on: string; payout_id: string | null }
interface ExpenseDraft { id?: string; category: string; amount: string; spentOn: string; method: string; fromCash: boolean; note: string; receiptUrl: string | null }

type Tab = 'ganancia' | 'gastos' | 'equipo' | 'exportar';
type PeriodKind = 'mes' | 'pasado' | 'custom';

/* ------------------------------ Utilidades ------------------------------ */

function usePanel() {
  const { tenant, token, logout } = useAdmin();
  return useMemo(() => {
    const auth = { 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` };
    async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
      const res = await fetch(`${API_BASE_CLIENT}/api${path}`, {
        method: init.method ?? 'GET',
        headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...auth },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (res.status === 401) {
        logout();
        throw new Error('no_autenticado');
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error ?? 'error'));
      return data as T;
    }
    /** Descarga un archivo del panel (lleva el token, por eso no sirve un enlace directo). */
    async function download(path: string, fallbackName: string) {
      const res = await fetch(`${API_BASE_CLIENT}/api${path}`, { headers: auth });
      if (res.status === 401) {
        logout();
        throw new Error('no_autenticado');
      }
      if (!res.ok) throw new Error('error');
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    return { api, download, uploadHeaders: { 'Content-Type': 'application/json', ...auth } };
  }, [tenant, token, logout]);
}
type Api = ReturnType<typeof usePanel>['api'];

function toCents(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
const cleanAmount = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/^(\d*\.\d{0,2}).*$/, '$1');
const centsToInput = (c: number) => (c > 0 ? (c / 100).toFixed(2).replace(/\.00$/, '') : '');
const limaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const pad = (n: number) => String(n).padStart(2, '0');
function monthRange(offset: number) {
  const [y, m] = limaToday().split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const ym = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  return { from: `${ym}-01`, to: offset === 0 ? limaToday() : `${ym}-${pad(last)}` };
}
const dateLabel = (iso: string, year = false) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace(/\./g, '');
const monthLabel = (ym: string, long = false) => {
  const t = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('es-PE', { month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace(/\./g, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const METHODS: Record<string, { label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }> = {
  cash: { label: 'Efectivo', icon: Banknote },
  yape: { label: 'Yape', icon: Smartphone },
  plin: { label: 'Plin', icon: Smartphone },
  card: { label: 'Tarjeta', icon: CreditCard },
  transfer: { label: 'Transferencia', icon: Landmark },
};
const methodLabel = (m: string | null) => (m ? METHODS[m]?.label ?? m : 'Sin medio');
const chipCls = (on: boolean) =>
  `inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-medium transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`;
const moneyInput = `tnum ${inputCls} text-[16px]`;
const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

function MoneyField({ label, value, onChange, hint, autoFocus }: { label: string; value: string; onChange: (v: string) => void; hint?: string; autoFocus?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
        <input autoFocus={autoFocus} inputMode="decimal" value={value} onChange={(e) => onChange(cleanAmount(e.target.value))} placeholder="0.00" className={`${moneyInput} pl-10 text-[20px]`} />
      </div>
    </Field>
  );
}

function MethodChips({ value, onChange, methods }: { value: string; onChange: (m: string) => void; methods: string[] }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {methods.map((m) => {
        const Icon = METHODS[m]?.icon ?? Wallet;
        return (
          <button key={m} type="button" onClick={() => { haptic.select(); onChange(m); }} className={chipCls(value === m)}>
            <Icon size={16} strokeWidth={1.75} /> {methodLabel(m)}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Sección ------------------------------ */

export function Finanzas() {
  const { api, download, uploadHeaders } = usePanel();
  const [tab, setTab] = useState<Tab>('ganancia');
  const [kind, setKind] = useState<PeriodKind>('mes');
  const [custom, setCustom] = useState(() => monthRange(0));
  const period = kind === 'mes' ? monthRange(0) : kind === 'pasado' ? monthRange(-1) : custom;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(period.from) && /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to;

  const tabs = [
    ['ganancia', 'Ganancia', TrendingUp],
    ['gastos', 'Gastos', Receipt],
    ['equipo', 'Equipo', Users],
    ['exportar', 'Exportar', Download],
  ] as const;

  return (
    <>
      <PageHead title="Finanzas" sub="Cuánto ganas de verdad: ventas menos comisiones, costo de productos y gastos." />

      <div className="mb-5 flex w-full max-w-xl rounded-full border border-line p-1 sm:w-auto" role="tablist" aria-label="Finanzas">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { haptic.tap(); setTab(id); }} className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition-colors sm:flex-none sm:px-4 ${tab === id ? 'bg-ink text-white' : 'text-mute hover:text-ink'}`}>
            <Icon size={15} strokeWidth={1.75} className="hidden sm:block" /> {label}
          </button>
        ))}
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-2">
        {([['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['custom', 'Otras fechas']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={kind === id} onClick={() => { haptic.select(); setKind(id); }} className={`${chipCls(kind === id)} min-h-11 text-[14px]`}>{label}</button>
        ))}
        {kind === 'custom' ? (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={`${inputCls} tnum min-h-11 text-[16px] sm:w-44`} aria-label="Desde" />
            <span className="text-mute">a</span>
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={`${inputCls} tnum min-h-11 text-[16px] sm:w-44`} aria-label="Hasta" />
          </div>
        ) : (
          <span className="tnum px-2 text-[14px] text-mute">{dateLabel(period.from)} al {dateLabel(period.to, true)}</span>
        )}
      </div>

      {!valid ? (
        <p className="text-[15px] text-mute">Elige un rango de fechas válido.</p>
      ) : tab === 'ganancia' ? (
        <Ganancia api={api} from={period.from} to={period.to} />
      ) : tab === 'gastos' ? (
        <Gastos api={api} uploadHeaders={uploadHeaders} from={period.from} to={period.to} />
      ) : tab === 'equipo' ? (
        <Equipo api={api} from={period.from} to={period.to} />
      ) : (
        <Exportar download={download} from={period.from} to={period.to} />
      )}
    </>
  );
}

/* ------------------------------ Ganancia ------------------------------ */

function Ganancia({ api, from, to }: { api: Api; from: string; to: string }) {
  const [data, setData] = useState<Profit | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null);
    setFailed(false);
    api<Profit>(`/admin/finance/profit?from=${from}&to=${to}`).then(setData).catch(() => setFailed(true));
  }, [api, from, to]);

  if (failed) return <Empty icon={TrendingUp} title="No pudimos calcular la ganancia" body="Revisa tu conexión e intenta de nuevo." />;
  if (!data) return <Skeleton rows={4} />;
  const loss = data.utilidadCents < 0;

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Ventas" value={soles(data.ventasCents)} sub={data.propinasCents ? `Sin contar ${soles(data.propinasCents)} de propinas` : 'Sin propinas'} />
        <StatTile label="Comisiones" value={soles(data.comisionesCents)} sub="De servicios y productos" />
        <StatTile label="Costo de productos" value={soles(data.costoProductosCents)} sub="Lo que te costó lo vendido" />
        <StatTile label="Gastos" value={soles(data.gastosCents)} sub={data.gastosPorCategoria[0] ? `El mayor: ${data.gastosPorCategoria[0].category}` : undefined} />
        <div className={`rounded-xl p-5 ${loss ? 'bg-red-tint' : 'bg-ink text-white'}`}>
          <div className={`text-[14px] ${loss ? 'text-red-deep' : 'text-white/70'}`}>{loss ? 'Pérdida' : 'Utilidad'}</div>
          <div className={`tnum mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em] ${loss ? 'text-red-deep' : ''}`}>{loss ? '- ' : ''}{soles(Math.abs(data.utilidadCents))}</div>
          <div className={`mt-2 text-[13px] ${loss ? 'text-red-deep' : 'text-white/70'}`}>Lo que queda para ti</div>
        </div>
        <StatTile label="Margen" value={`${data.margen}%`} sub={data.ventasCents ? `De cada S/ 100 vendidos te quedan S/ ${Math.max(0, data.margen)}` : 'Aún sin ventas'} />
      </div>

      <section className="max-w-xl">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Cómo se calcula</h2>
        <div className="mt-3 divide-y divide-line border-y border-line text-[15px]">
          <PlRow label="Ventas" value={data.ventasCents} />
          <PlRow label="Comisiones del equipo" value={-data.comisionesCents} />
          <PlRow label="Costo de productos vendidos" value={-data.costoProductosCents} />
          <PlRow label="Gastos" value={-data.gastosCents} />
          <PlRow label={loss ? 'Pérdida' : 'Utilidad'} value={data.utilidadCents} strong />
        </div>
        <p className="mt-3 text-[13px] text-soft">
          Las propinas no cuentan como venta: son del barbero. {data.pagadoEquipoCents ? `En este periodo pagaste ${soles(data.pagadoEquipoCents)} al equipo.` : ''}
        </p>
      </section>

      <div className="grid gap-12 border-t border-line pt-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ProfitChart data={data.mensual} />
        <BarList title="Gastos por categoría" data={data.gastosPorCategoria.map((g) => ({ label: g.category, value: g.cents }))} format={(v) => soles(v)} empty="Sin gastos en este periodo" />
      </div>
    </div>
  );
}

function PlRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2.5 ${strong ? 'text-[17px] font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-mute'}>{label}</span>
      <span className={`tnum ${strong && value < 0 ? 'text-red-deep' : ''}`}>{value < 0 ? '- ' : ''}{soles(Math.abs(value))}</span>
    </div>
  );
}

/** Columnas agrupadas por mes: ventas, gastos y utilidad sobre un solo eje (la utilidad puede ser negativa). */
const SERIES = [
  { key: 'ventas_cents', label: 'Ventas', color: '#27272a' },
  { key: 'gastos_cents', label: 'Gastos', color: '#8a8a93' },
  { key: 'utilidad_cents', label: 'Utilidad', color: '#d91023' },
] as const;

function niceStep(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function ProfitChart({ data }: { data: Profit['mensual'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const H = W < 480 ? 200 : 240;
  const padL = W < 480 ? 44 : 56;
  const padR = 8, padT = 12, padB = 28;
  const values = data.flatMap((d) => SERIES.map((s) => d[s.key]));
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const step = niceStep((hi - lo) / 3 || 1);
  const max = Math.max(step, Math.ceil(hi / step) * step);
  const min = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + 1; t += step) ticks.push(t);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / (max - min || 1));
  const band = (W - padL - padR) / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(18, (band - 16) / 3 - 2));
  const group = barW * 3 + 4;
  const hasData = values.some((v) => v !== 0);

  const bar = (x: number, v: number) => {
    const y0 = y(0);
    const y1 = y(v);
    const h = Math.abs(y0 - y1);
    if (h < 0.5) return '';
    const r = Math.min(4, h, barW / 2);
    // Esquinas redondeadas solo en el extremo del dato; la base queda recta sobre el cero
    return v >= 0
      ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z`
      : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 - r} V${y0} Z`;
  };

  return (
    <figure className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-[15px] font-medium">Últimos 6 meses</figcaption>
        <div className="flex items-center gap-3">
          <ul className="flex items-center gap-3 text-[13px] text-mute" aria-label="Leyenda">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />{s.label}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setTable(!table)} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-mute hover:bg-field hover:text-ink" aria-pressed={table}>
            {table ? <BarChart3 size={14} strokeWidth={1.75} /> : <Table2 size={14} strokeWidth={1.75} />}
            {table ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        </div>
      </div>

      {table ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[14px]">
            <thead>
              <tr className="border-b border-ink text-[13px] text-mute">
                <th className="py-2 text-left font-medium">Mes</th>
                {SERIES.map((s) => <th key={s.key} className="py-2 text-right font-medium">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.mes} className="border-b border-line">
                  <td className="py-2 text-mute">{monthLabel(d.mes, true)}</td>
                  {SERIES.map((s) => <td key={s.key} className={`tnum py-2 text-right ${d[s.key] < 0 ? 'text-red-deep' : ''}`}>{soles(d[s.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[12px] text-soft">La utilidad mensual resta comisiones y gastos. El costo de productos se descuenta en el resumen del periodo.</p>
        </div>
      ) : (
        <div ref={boxRef} className="relative mt-3" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Ventas, gastos y utilidad de los últimos 6 meses">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#d4d4d8' : CHART.grid} strokeWidth={1} />
                <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={CHART.axis} className="tnum">{solesShort(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const gx = padL + i * band + (band - group) / 2;
              return (
                <g key={d.mes} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: 'opacity 200ms' }}>
                  {SERIES.map((s, k) => {
                    const path = bar(gx + k * (barW + 2), d[s.key]);
                    return path ? <path key={s.key} d={path} fill={s.color} /> : null;
                  })}
                  <text x={padL + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={CHART.axis}>{monthLabel(d.mes)}</text>
                  <rect x={padL + i * band} y={padT} width={band} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {!hasData && <p className="absolute inset-0 flex items-center justify-center text-[14px] text-mute">Aún sin movimientos en estos meses</p>}
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-[13px] text-white shadow-pop"
              style={{ left: Math.min(W - 90, Math.max(90, padL + hover * band + band / 2)) }}
            >
              <div className="mb-1 text-white/70">{monthLabel(data[hover].mes, true)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] ring-1 ring-white/40" style={{ background: s.color }} aria-hidden />{s.label}</span>
                  <span className="tnum font-medium">{soles(data[hover]![s.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/* ------------------------------ Gastos ------------------------------ */

function Gastos({ api, uploadHeaders, from, to }: { api: Api; uploadHeaders: Record<string, string>; from: string; to: string }) {
  const [list, setList] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [cat, setCat] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ expenses: Expense[]; categories: string[] }>(`/admin/expenses?from=${from}&to=${to}`)
      .then((d) => { setList(d.expenses); setCategories(d.categories); })
      .catch(() => setList([]));
  }, [api, from, to]);
  useEffect(() => { setList(null); load(); }, [load]);

  const shown = (list ?? []).filter((e) => !cat || e.category === cat);
  const total = shown.reduce((s, e) => s + e.amount_cents, 0);
  const usedCats = Array.from(new Set((list ?? []).map((e) => e.category)));
  const newDraft = (): ExpenseDraft => ({ category: '', amount: '', spentOn: limaToday(), method: 'cash', fromCash: false, note: '', receiptUrl: null });

  async function remove(e: Expense) {
    if (!confirm(`¿Eliminar el gasto de ${soles(e.amount_cents)} en ${e.category}?`)) return;
    setList((p) => p?.filter((x) => x.id !== e.id) ?? null);
    try {
      await api(`/admin/expenses/${e.id}`, { method: 'DELETE' });
      toast.success('Gasto eliminado');
      setDraft(null);
    } catch {
      toast.error('No se pudo eliminar.');
      load();
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[14px] text-mute">{cat ? `Gastos en ${cat}` : 'Gastos del periodo'}</div>
          <div className="tnum mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em]">{soles(total)}</div>
        </div>
        <Btn onClick={() => { haptic.tap(); setDraft(newDraft()); }}><Plus size={16} strokeWidth={2} /> Agregar gasto</Btn>
      </div>

      {usedCats.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <button type="button" onClick={() => setCat(null)} className={`${chipCls(!cat)} min-h-10 text-[14px]`}>Todas</button>
          {usedCats.map((c) => <button key={c} type="button" onClick={() => { haptic.select(); setCat(c); }} className={`${chipCls(cat === c)} min-h-10 text-[14px]`}>{c}</button>)}
        </div>
      )}

      {!list ? (
        <Skeleton rows={4} />
      ) : list.length === 0 ? (
        <Empty
          icon={Receipt}
          title="Sin gastos en este periodo"
          body="Anota alquiler, insumos, luz o publicidad. Así ves tu ganancia real y tu contador recibe todo ordenado, con la foto del comprobante."
          action={<Btn onClick={() => setDraft(newDraft())}><Plus size={16} strokeWidth={2} /> Agregar gasto</Btn>}
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setDraft({ id: e.id, category: e.category, amount: centsToInput(e.amount_cents), spentOn: e.spent_on, method: e.method ?? 'cash', fromCash: false, note: e.note ?? '', receiptUrl: e.receipt_url })}
                className="flex min-h-16 w-full items-center gap-3 py-3 text-left active:bg-field md:hover:bg-field/60"
              >
                {e.receipt_url ? (
                  isPdf(e.receipt_url) ? (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-field"><FileText size={20} strokeWidth={1.5} /></span>
                  ) : (
                    <img src={e.receipt_url} alt="Comprobante" className="h-12 w-12 shrink-0 rounded-lg bg-field object-cover" />
                  )
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-2 text-soft"><Receipt size={18} strokeWidth={1.5} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.category}</span>
                  <span className="block truncate text-[13px] text-mute">{[dateLabel(e.spent_on), methodLabel(e.method), e.note].filter(Boolean).join(', ')}</span>
                </span>
                <span className="tnum shrink-0 font-medium">{soles(e.amount_cents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ExpenseSheet api={api} uploadHeaders={uploadHeaders} draft={draft} setDraft={setDraft} categories={categories} onSaved={load} onDelete={(id) => { const e = list?.find((x) => x.id === id); if (e) remove(e); }} />
    </div>
  );
}

function ExpenseSheet({
  api, uploadHeaders, draft, setDraft, categories, onSaved, onDelete,
}: {
  api: Api; uploadHeaders: Record<string, string>; draft: ExpenseDraft | null; setDraft: (d: ExpenseDraft | null) => void; categories: string[]; onSaved: () => void; onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const d = draft;
  const set = (p: Partial<ExpenseDraft>) => d && setDraft({ ...d, ...p });
  const amount = toCents(d?.amount ?? '');

  async function onFile(f: File) {
    setUploading(true);
    try {
      set({ receiptUrl: await uploadImage(f, 'expenses', uploadHeaders) });
    } catch {
      toast.error('No se pudo subir el comprobante. Usa una foto o un PDF.');
    } finally {
      setUploading(false);
    }
  }
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };

  async function save() {
    if (!d || !d.category.trim() || amount <= 0) return;
    setBusy(true);
    const body = {
      category: d.category.trim(),
      amountCents: amount,
      spentOn: d.spentOn || undefined,
      method: d.fromCash ? 'cash' : d.method,
      note: d.note.trim() || undefined,
      receiptUrl: d.receiptUrl ?? undefined,
    };
    try {
      if (d.id) await api(`/admin/expenses/${d.id}`, { method: 'PATCH', body });
      else await api('/admin/expenses', { method: 'POST', body: { ...body, fromCash: d.fromCash || undefined } });
      toast.success(d.id ? 'Gasto guardado' : 'Gasto agregado');
      onSaved();
      setDraft(null);
    } catch {
      toast.error('No se pudo guardar el gasto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!d}
      onClose={() => setDraft(null)}
      title={d?.id ? 'Editar gasto' : 'Nuevo gasto'}
      footer={
        <>
          {d?.id && <Btn variant="danger" className="mr-auto" onClick={() => onDelete(d.id!)}><Trash2 size={16} strokeWidth={1.75} /> Eliminar</Btn>}
          <Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn>
          <Btn busy={busy} disabled={!d?.category.trim() || amount <= 0 || uploading} onClick={save}>Guardar</Btn>
        </>
      }
    >
      {d && (
        <div className="space-y-5">
          <div>
            <span className="mb-2 block text-[14px] font-medium">Categoría</span>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => <button key={c} type="button" onClick={() => { haptic.select(); set({ category: c }); }} className={`${chipCls(d.category === c)} min-h-10 text-[14px]`}>{c}</button>)}
            </div>
            {!categories.includes(d.category) && d.category && <p className="mt-2 text-[13px] text-soft">Categoría propia: {d.category}</p>}
          </div>

          <MoneyField label="Monto" value={d.amount} onChange={(v) => set({ amount: v })} autoFocus={!d.id} />

          <Field label="Fecha">
            <input type="date" value={d.spentOn} max={limaToday()} onChange={(e) => set({ spentOn: e.target.value })} className={`tnum ${inputCls} min-h-11 text-[16px]`} />
          </Field>

          {!d.id && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <span>
                <span className="block text-[15px] font-medium">Pagado con efectivo de la caja</span>
                <span className="block text-[13px] text-mute">Se descuenta del efectivo esperado al cerrar</span>
              </span>
              <Switch checked={d.fromCash} onChange={(v) => set({ fromCash: v, method: v ? 'cash' : d.method })} label="Pagado con efectivo de la caja" states={['Sí', 'No']} />
            </div>
          )}

          {!d.fromCash && (
            <div>
              <span className="mb-2 block text-[14px] font-medium">Medio de pago</span>
              <MethodChips value={d.method} onChange={(m) => set({ method: m })} methods={['cash', 'yape', 'plin', 'card', 'transfer']} />
            </div>
          )}

          <Field label="Nota (opcional)">
            <input value={d.note} onChange={(e) => set({ note: e.target.value })} maxLength={200} placeholder="Ej. navajas y talco" className={`${inputCls} text-[16px]`} />
          </Field>

          <div>
            <span className="mb-2 block text-[14px] font-medium">Comprobante (opcional)</span>
            <input ref={cam} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onChange} />
            <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" onChange={onChange} />
            {d.receiptUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-line p-3">
                {isPdf(d.receiptUrl) ? (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-field"><FileText size={24} strokeWidth={1.5} /></span>
                ) : (
                  <img src={d.receiptUrl} alt="Comprobante" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium text-ok"><Check size={16} strokeWidth={2} /> Adjunto</span>
                  <a href={d.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-[14px] text-mute underline">Ver archivo</a>
                </span>
                <button type="button" onClick={() => file.current?.click()} className="min-h-10 rounded-full px-3 text-[14px] font-medium hover:bg-field">Cambiar</button>
                {!d.id && <button type="button" onClick={() => set({ receiptUrl: null })} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label="Quitar comprobante"><X size={16} strokeWidth={1.75} /></button>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" disabled={uploading} onClick={() => cam.current?.click()} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-line text-[15px] font-medium hover:border-ink disabled:opacity-50">
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} strokeWidth={1.75} />} Tomar foto
                </button>
                <button type="button" disabled={uploading} onClick={() => file.current?.click()} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-line text-[15px] font-medium hover:border-ink disabled:opacity-50">
                  <Paperclip size={20} strokeWidth={1.75} /> Elegir archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------ Equipo ------------------------------ */

function Equipo({ api, from, to }: { api: Api; from: string; to: string }) {
  const [staff, setStaff] = useState<PayStaff[] | null>(null);
  const [history, setHistory] = useState<Payout[]>([]);
  const [advances, setAdvances] = useState<Advance[] | null>(null);
  const [paying, setPaying] = useState<PayStaff | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const load = useCallback(() => {
    api<{ staff: PayStaff[]; history: Payout[] }>(`/admin/payroll?from=${from}&to=${to}`).then((d) => { setStaff(d.staff); setHistory(d.history); }).catch(() => setStaff([]));
    api<{ advances: Advance[] }>('/admin/payroll/advances').then((d) => setAdvances(d.advances)).catch(() => setAdvances([]));
  }, [api, from, to]);
  useEffect(() => { setStaff(null); load(); }, [load]);

  const totalToPay = (staff ?? []).reduce((s, x) => s + Math.max(0, x.total_cents), 0);

  async function removeAdvance(a: Advance) {
    if (!confirm(`¿Eliminar el adelanto de ${soles(a.amount_cents)} a ${a.name}?`)) return;
    try {
      await api(`/admin/payroll/advances/${a.id}`, { method: 'DELETE' });
      toast.success('Adelanto eliminado');
      load();
    } catch {
      toast.error('No se pudo eliminar.');
    }
  }

  if (!staff) return <Skeleton rows={4} />;
  if (staff.length === 0) return <Empty icon={Users} title="Aún no tienes barberos" body="Agrégalos en Equipo para calcular sus comisiones y pagos." />;

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[14px] text-mute">Total a pagar en el periodo</div>
          <div className="tnum mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em]">{soles(totalToPay)}</div>
          <p className="mt-2 max-w-lg text-[13px] text-soft">Comisiones de servicios y productos más propinas, menos adelantos pendientes. Se calcula con las ventas cobradas en la caja.</p>
        </div>
        <Btn variant="secondary" onClick={() => setAdvanceOpen(true)}><HandCoins size={16} strokeWidth={1.75} /> Dar adelanto</Btn>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {staff.map((s) => {
          const paidOverlap = s.last_paid_until && s.last_paid_until >= from;
          return (
            <article key={s.staff_id} className="flex flex-col rounded-xl border border-line p-5">
              <header className="flex items-center gap-3">
                {s.photo_url ? <img src={s.photo_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-field font-semibold">{s.name.charAt(0)}</span>}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[17px] font-semibold tracking-[-0.02em]">{s.name}</h3>
                  <p className="text-[13px] text-mute">{s.clientes} {s.clientes === 1 ? 'cliente' : 'clientes'}, comisión {s.commission_percent}%</p>
                </div>
              </header>
              <div className="mt-4 flex-1 divide-y divide-line border-y border-line text-[14px]">
                <MiniRow label="Servicios atendidos" value={soles(s.services_cents)} muted />
                <MiniRow label="Comisión de servicios" value={soles(s.commission_cents)} />
                <MiniRow label="Comisión de productos" value={soles(s.product_commission_cents)} />
                <MiniRow label="Propinas" value={soles(s.tips_cents)} />
                {s.advances_cents > 0 && <MiniRow label="Adelantos" value={`- ${soles(s.advances_cents)}`} />}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] text-mute">A pagar</div>
                  <div className={`tnum text-[22px] font-semibold tracking-[-0.02em] ${s.total_cents < 0 ? 'text-red-deep' : ''}`}>{s.total_cents < 0 ? '- ' : ''}{soles(Math.abs(s.total_cents))}</div>
                </div>
                <Btn disabled={s.total_cents <= 0 && s.advances_cents === 0} onClick={() => { haptic.tap(); setPaying(s); }} className="min-h-11">Pagar</Btn>
              </div>
              <p className={`mt-3 flex items-center gap-1.5 text-[13px] ${paidOverlap ? 'text-[#8a5300]' : 'text-soft'}`}>
                {paidOverlap && <TriangleAlert size={13} strokeWidth={1.75} />}
                {s.last_paid_until ? `Último pago hasta el ${dateLabel(s.last_paid_until, true)}` : 'Aún sin pagos registrados'}
              </p>
            </article>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]"><HandCoins size={18} strokeWidth={1.75} /> Adelantos</h2>
        {!advances ? (
          <Skeleton rows={2} />
        ) : advances.length === 0 ? (
          <p className="text-[15px] text-mute">Sin adelantos. Si le das plata a un barbero antes del pago, anótalo aquí y se descuenta solo.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {advances.map((a) => (
              <li key={a.id} className="flex min-h-14 items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block truncate text-[13px] text-mute">{[dateLabel(a.given_on), a.note].filter(Boolean).join(', ')}</span>
                </span>
                <span className="text-right">
                  <span className="tnum block font-medium">{soles(a.amount_cents)}</span>
                  <span className={`block text-[12px] ${a.payout_id ? 'text-soft' : 'text-[#8a5300]'}`}>{a.payout_id ? 'Descontado' : 'Pendiente'}</span>
                </span>
                {!a.payout_id ? (
                  <button type="button" onClick={() => removeAdvance(a)} className="flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-red-tint hover:text-red" aria-label={`Eliminar adelanto de ${a.name}`}><Trash2 size={16} strokeWidth={1.75} /></button>
                ) : <span className="w-11" aria-hidden />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]"><History size={18} strokeWidth={1.75} /> Pagos realizados</h2>
        {history.length === 0 ? (
          <p className="text-[15px] text-mute">Aún no registraste pagos al equipo.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {history.map((h) => (
              <li key={h.id} className="flex min-h-14 items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="block truncate text-[13px] text-mute">Del {dateLabel(h.period_start)} al {dateLabel(h.period_end, true)}, {methodLabel(h.method)}{h.note ? `, ${h.note}` : ''}</span>
                </span>
                <span className="text-right">
                  <span className="tnum block font-medium">{soles(h.total_cents)}</span>
                  <span className="block text-[12px] text-soft">Pagado {dateLabel(h.paid_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PaySheet api={api} target={paying} from={from} to={to} onClose={() => setPaying(null)} onDone={load} />
      <AdvanceSheet api={api} open={advanceOpen} staff={staff} onClose={() => setAdvanceOpen(false)} onDone={load} />
    </div>
  );
}

function MiniRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${muted ? 'text-mute' : ''}`}>
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

function PaySheet({ api, target, from, to, onClose, onDone }: { api: Api; target: PayStaff | null; from: string; to: string; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState('cash');
  const [fromCash, setFromCash] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (target) { setMethod('cash'); setFromCash(true); setNote(''); } }, [target]);

  async function pay() {
    if (!target) return;
    setBusy(true);
    try {
      const r = await api<{ total: number }>('/admin/payroll/pay', { method: 'POST', body: { staffId: target.staff_id, from, to, method, note: note.trim() || undefined, fromCash: method === 'cash' ? fromCash : undefined } });
      toast.success(`Pago de ${soles(r.total)} a ${target.name} registrado`);
      onDone();
      onClose();
    } catch {
      toast.error('No se pudo registrar el pago.');
    } finally {
      setBusy(false);
    }
  }

  const overlap = target?.last_paid_until && target.last_paid_until >= from;
  return (
    <Sheet open={!!target} onClose={onClose} title={target ? `Pagar a ${target.name}` : 'Pagar'} footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn busy={busy} onClick={pay}>Registrar pago de {soles(Math.max(0, target?.total_cents ?? 0))}</Btn></>}>
      {target && (
        <div className="space-y-5">
          <div className="rounded-xl bg-field p-4">
            <p className="text-[14px] text-mute">Del {dateLabel(from)} al {dateLabel(to, true)}</p>
            <p className="tnum mt-1 text-[32px] font-semibold tracking-[-0.03em]">{soles(Math.max(0, target.total_cents))}</p>
            <p className="tnum text-[13px] text-mute">
              {soles(target.commission_cents + target.product_commission_cents)} de comisiones, {soles(target.tips_cents)} de propinas{target.advances_cents ? `, menos ${soles(target.advances_cents)} de adelantos` : ''}
            </p>
          </div>
          {overlap && (
            <p className="flex gap-2 rounded-xl bg-[#fff4e0] px-4 py-3 text-[14px] text-[#8a5300]">
              <TriangleAlert size={17} strokeWidth={1.75} className="mt-0.5 shrink-0" /> Ya le pagaste hasta el {dateLabel(target.last_paid_until!, true)}. Revisa las fechas para no pagar dos veces lo mismo.
            </p>
          )}
          <div>
            <span className="mb-2 block text-[14px] font-medium">Cómo le pagas</span>
            <MethodChips value={method} onChange={setMethod} methods={['cash', 'yape', 'plin', 'transfer']} />
          </div>
          {method === 'cash' && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
              <span>
                <span className="block text-[15px] font-medium">Sale del efectivo de la caja</span>
                <span className="block text-[13px] text-mute">Queda como salida si la caja está abierta</span>
              </span>
              <Switch checked={fromCash} onChange={setFromCash} label="Sale del efectivo de la caja" states={['Sí', 'No']} />
            </div>
          )}
          <Field label="Nota (opcional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ej. semana 1 de octubre" className={`${inputCls} text-[16px]`} />
          </Field>
          <p className="text-[13px] text-soft">Al registrar el pago, los adelantos pendientes quedan descontados.</p>
        </div>
      )}
    </Sheet>
  );
}

function AdvanceSheet({ api, open, staff, onClose, onDone }: { api: Api; open: boolean; staff: PayStaff[]; onClose: () => void; onDone: () => void }) {
  const [staffId, setStaffId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fromCash, setFromCash] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setStaffId(staff.length === 1 ? staff[0]!.staff_id : null); setAmount(''); setNote(''); setFromCash(true); } }, [open, staff]);

  async function save() {
    if (!staffId || toCents(amount) <= 0) return;
    setBusy(true);
    try {
      await api('/admin/payroll/advances', { method: 'POST', body: { staffId, amountCents: toCents(amount), note: note.trim() || undefined, fromCash } });
      toast.success('Adelanto registrado');
      onDone();
      onClose();
    } catch {
      toast.error('No se pudo registrar el adelanto.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Dar adelanto" footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn busy={busy} disabled={!staffId || toCents(amount) <= 0} onClick={save}>Registrar {soles(toCents(amount))}</Btn></>}>
      <div className="space-y-5">
        <div>
          <span className="mb-2 block text-[14px] font-medium">Para</span>
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => <button key={s.staff_id} type="button" onClick={() => { haptic.select(); setStaffId(s.staff_id); }} className={chipCls(staffId === s.staff_id)}>{s.name}</button>)}
          </div>
        </div>
        <MoneyField label="Monto" value={amount} onChange={setAmount} />
        <Field label="Nota (opcional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ej. pasajes de la semana" className={`${inputCls} text-[16px]`} />
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
          <span>
            <span className="block text-[15px] font-medium">Sale del efectivo de la caja</span>
            <span className="block text-[13px] text-mute">Queda como salida si la caja está abierta</span>
          </span>
          <Switch checked={fromCash} onChange={setFromCash} label="Sale del efectivo de la caja" states={['Sí', 'No']} />
        </div>
        <p className="text-[13px] text-soft">Se descuenta solo en el próximo pago.</p>
      </div>
    </Sheet>
  );
}

/* ------------------------------ Exportar ------------------------------ */

function Exportar({ download, from, to }: { download: (path: string, name: string) => Promise<void>; from: string; to: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const files = [
    { kind: 'ventas', title: 'Ventas', body: 'Cada venta con fecha, cliente, barbero, detalle, descuentos, propinas, pagos y su comprobante.' },
    { kind: 'gastos', title: 'Gastos', body: 'Fecha, categoría, monto, medio de pago y el enlace al comprobante.' },
    { kind: 'equipo', title: 'Pagos al equipo', body: 'Lo pagado a cada barbero: comisiones, propinas, adelantos y fecha de pago.' },
  ];
  async function get(kind: string) {
    setBusy(kind);
    try {
      await download(`/admin/export/${kind}?from=${from}&to=${to}`, `${kind}-${from}-a-${to}.csv`);
      toast.success('Archivo descargado');
    } catch {
      toast.error('No se pudo descargar el archivo.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="max-w-2xl">
      <p className="text-[15px] text-mute">
        Descarga el periodo del {dateLabel(from)} al {dateLabel(to, true)}. Los archivos se abren directo en Excel o Google Sheets y puedes enviárselos a tu contador. Los comprobantes que adjuntaste aparecen como enlaces para abrir la foto o el PDF.
      </p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {files.map((f) => (
          <li key={f.kind} className="flex flex-wrap items-center gap-4 py-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-field"><FileSpreadsheet size={20} strokeWidth={1.75} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{f.title}</span>
              <span className="block text-[14px] text-mute">{f.body}</span>
            </span>
            <Btn variant="secondary" busy={busy === f.kind} onClick={() => get(f.kind)} className="min-h-11"><Download size={16} strokeWidth={1.75} /> Descargar CSV</Btn>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-soft">date.pe no emite boletas ni facturas. Adjunta en cada venta o gasto el comprobante que emitiste, así tu contador tiene todo en un solo lugar.</p>
    </div>
  );
}
