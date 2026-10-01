'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet, Search, Plus, Minus, X, Scissors, ShoppingBag, Package, BadgeCheck, Gift, PenLine, User, UserPlus, UserX,
  Banknote, Smartphone, CreditCard, Landmark, Award, CalendarCheck, Camera, FileText, Paperclip, ChevronLeft, ChevronRight,
  Lock, LockOpen, ArrowDownLeft, ArrowUpRight, Receipt, Clock, TriangleAlert, Ban, Percent, History, Loader2, Ticket as TicketIcon,
  Coins, Check, SplitSquareHorizontal, Printer, MessageCircle, CalendarDays, WifiOff, CloudUpload,
} from 'lucide-react';
import { useAdmin, soles } from './api';
import { PageHead, Btn, Field, inputCls, Empty, Skeleton } from './ui';
import { Sheet } from '@/components/Sheet';
import { StatTile, staffColor } from '@/components/charts';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { uploadImage } from '@/lib/upload';
import { API_BASE_CLIENT } from '@/lib/config';
import { enqueueSale, flushOutbox, isNetworkError, newRef, readOutbox, dropSale, OUTBOX_EVENT, type OutboxSale } from '@/lib/outbox';
import { useSede, SedeGate } from './sede';

/* ------------------------------ Tipos ------------------------------ */

interface Svc { id: string; name: string; price_cents: number; duration_min: number; is_addon: boolean }
interface Prod { id: string; name: string; price_cents: number; stock: number; min_stock: number; category: string | null; photo_url: string | null }
interface Pkg { id: string; name: string; price_cents: number; uses: number; service_ids: string[]; valid_days: number }
interface Plan { id: string; name: string; price_cents: number; period: 'month' | 'year' }
interface Reward { id: string; name: string; points_cost: number; kind: 'free_service' | 'discount_fixed' | 'discount_percent' | 'product'; value: number; ref_id: string | null }
interface StaffM { id: string; name: string; photo_url: string | null; commission_percent: number }
interface PendingAppt {
  id: string; starts_at: string; staff_id: string | null; staff_name: string | null; client_id: string | null; client_name: string | null;
  services: { service_id: string; name: string; price_cents: number }[]; deposit_cents: number; status?: string; discount_cents?: number;
}
interface QTicket { id: string; number: number; name: string; status?: string; served_by: string | null; served_by_name?: string | null; service_id: string | null; service_name: string | null; price_cents: number | null; client_id: string | null; finished_at?: string | null }
interface Catalog { services: Svc[]; products: Prod[]; packages: Pkg[]; plans: Plan[]; rewards: Reward[]; staff: StaffM[]; pendingAppointments: PendingAppt[]; tickets: QTicket[] }

interface CashInfo { opening: number; cash_sales: number; ins: number; outs: number; expenses: number; expected: number }
interface Session { id: string; opened_at: string; opening_cents: number; opened_by_name: string | null; cash: CashInfo }
interface Summary {
  totals: { ventas: number; total_cents: number; tips_cents: number; discount_cents: number; ticket_promedio_cents: number; con_recibo: number };
  byMethod: { method: string; cents: number; ventas: number }[];
  byStaff: { staff_id: string; name: string; servicios_cents: number; productos_cents: number; comision_cents: number; tips_cents: number }[];
  byKind: { kind: string; cents: number }[];
}
interface PosConfig { tipPresets: number[]; methods: string[]; requireSession: boolean; askReceipt: boolean }
interface PosState { session: Session | null; config: PosConfig; features: Record<string, boolean>; today: Summary }

interface Sale {
  id: string; number: number; created_at: string; status: 'paid' | 'void'; subtotal_cents: number; discount_cents: number; tip_cents: number; total_cents: number;
  receipt_url: string | null; receipt_number: string | null; note: string | null; void_reason: string | null; appointment_id: string | null; ticket_id: string | null;
  client_name: string | null; client_phone: string | null; staff_name: string | null; created_by_name: string | null;
  items: { kind: string; name: string; qty: number; total_cents: number; staff_id: string | null }[] | null;
  payments: { method: string; amount_cents: number; reference: string | null }[] | null;
}
interface CashSession {
  id: string; status: 'open' | 'closed'; opened_at: string; closed_at: string | null; opening_cents: number; expected_cents: number | null; counted_cents: number | null;
  difference_cents: number | null; notes: string | null; opened_by_name: string | null; closed_by_name: string | null; total_cents: number; ventas: number;
}
interface WalletData {
  points: number;
  packages: { id: string; name: string; uses_total: number; uses_left: number; expires_at: string | null; service_ids: string[] }[];
  memberships: { id: string; name: string; ends_at: string; discount_percent: number | null; included_uses: number | null }[];
  rewards: (Reward & { available: boolean })[];
}
interface Me { id: string; name: string; role: 'owner' | 'manager' | 'cashier' | 'staff'; staffId: string | null }

type LineKind = 'service' | 'product' | 'package' | 'gift_card' | 'membership' | 'other';
interface Line { key: number; kind: LineKind; refId?: string; name: string; unit: number; qty: number; staffId?: string | null; max?: number }
interface ClientSel { id?: string; name: string; phone?: string; points?: number }
interface Origin { type: 'cita' | 'turno'; id: string; label: string; deposit: number }
interface PayRow { id: number; method: string; amount: string }
interface ReceiptFile { url: string; pdf: boolean }
interface CheckoutResult { saleId: string; number: number; total: number; pointsAwarded: number; lowStock: { id: string; name: string; stock: number; min_stock: number }[] }

/** Lo pendiente de un turno o una cita, armado por el servidor para el cobro express. */
interface ExpressInfo {
  appointmentId: string | null; ticketId: string | null; staffId: string | null; clientId: string | null; clientName: string | null;
  items: { serviceId: string; name: string; priceCents: number }[]; discountCents: number; totalCents: number; depositCents: number; dueCents: number; needsService?: boolean;
}
interface ExpressTarget { kind: 'ticket' | 'appointment'; id: string; method: string; name: string | null }

interface DayReport {
  date: string;
  totals: { ventas: number; total_cents: number; tips_cents: number; discount_cents: number; ticket_promedio_cents: number; servicios_cents: number; productos_cents: number };
  byMethod: { method: string; cents: number; ventas: number }[];
  byStaff: { staff_id: string; name: string; clientes: number; servicios_cents: number; productos_cents: number; comision_cents: number; tips_cents: number; a_entregar_cents: number }[];
  cash: { sessions: number; opening_cents: number; cash_sales_cents: number; ins_cents: number; outs_cents: number; expected_cents: number; counted_cents: number | null; difference_cents: number | null; open: boolean };
  appointments: { total: number; completed: number; no_show: number; cancelled: number; pending: number };
  queue: { atendidos: number; no_vinieron: number; espera_promedio_min: number; max_en_fila: number };
  expenses_cents: number;
  topServices: { name: string; n: number; cents: number }[];
  uncharged: { kind: 'ticket' | 'appointment'; id: string; name: string | null; staff: string | null; at: string }[];
}

/* ------------------------------ Utilidades ------------------------------ */

class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(code: string, status: number, data: Record<string, unknown>) {
    super(code);
    this.status = status;
    this.data = data;
  }
}

/**
 * Cliente de API de esta sección. Igual que useApi, pero un 403 (función desactivada o
 * permiso del rol) se muestra como aviso en lugar de cerrar la sesión.
 */
function usePanel() {
  const { tenant, token, logout, location = null } = useAdmin();
  return useMemo(() => {
    const auth: Record<string, string> = { 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}`, ...(location ? { 'X-Location-Id': location } : {}) };
    async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; location?: string | null } = {}): Promise<T> {
      const headers: Record<string, string> = { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...auth };
      // Una venta guardada sin conexión se sube con la sede en la que se hizo
      if (init.location !== undefined) {
        delete headers['X-Location-Id'];
        if (init.location) headers['X-Location-Id'] = init.location;
      }
      const res = await fetch(`${API_BASE_CLIENT}/api${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (res.status === 401) {
        logout();
        throw new ApiError('no_autenticado', 401, {});
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new ApiError(String(data.error ?? 'error'), res.status, data);
      return data as T;
    }
    return { api, uploadHeaders: { 'Content-Type': 'application/json', ...auth }, tenant, location };
  }, [tenant, token, logout, location]);
}

/** Soles escritos por la persona a céntimos ("32.5" o "32,50"). */
function toCents(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
const cleanAmount = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/^(\d*\.\d{0,2}).*$/, '$1');
const centsToInput = (c: number) => (c > 0 ? (c / 100).toFixed(2).replace(/\.00$/, '') : '');

const limaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
const dayShort = (iso: string) =>
  new Date(iso).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Lima' }).replace(/\./g, '');

const METHOD: Record<string, { label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }> = {
  cash: { label: 'Efectivo', icon: Banknote },
  yape: { label: 'Yape', icon: Smartphone },
  plin: { label: 'Plin', icon: Smartphone },
  card: { label: 'Tarjeta', icon: CreditCard },
  transfer: { label: 'Transferencia', icon: Landmark },
  gift_card: { label: 'Gift card', icon: Gift },
  package: { label: 'Paquete', icon: Package },
  points: { label: 'Puntos', icon: Award },
  deposit: { label: 'Adelanto', icon: CalendarCheck },
};
const methodLabel = (m: string) => METHOD[m]?.label ?? m;

/** Nombres de los medios en el cierre del día (en plural donde se suman varios). */
const REPORT_METHOD: Record<string, string> = {
  cash: 'Efectivo', yape: 'Yape', plin: 'Plin', card: 'Tarjeta', transfer: 'Transferencia',
  deposit: 'Adelantos en línea', gift_card: 'Gift cards', package: 'Paquetes', points: 'Puntos',
};
const reportMethod = (m: string) => REPORT_METHOD[m] ?? methodLabel(m);

/** Medios con los que se puede cobrar de un toque (el servidor cobra el resto con uno solo). */
const EXPRESS_METHODS = ['cash', 'yape', 'plin', 'card', 'transfer'];
function quickMethods(cfg: PosConfig): string[] {
  const list = cfg.methods.filter((m) => EXPRESS_METHODS.includes(m));
  return (list.length ? list : ['cash', 'yape', 'plin', 'card']).slice(0, 4);
}
const tipOf = (base: number, pct: number) => Math.round((base * pct) / 100 / 10) * 10;

/** "hace 12 min", "hace 1 h 5 min". */
function agoLabel(iso: string, now: number): string {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

/** Día "YYYY-MM-DD" de Lima desplazado n días. */
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d);
}
/** "miércoles 30 de setiembre" (en Perú se escribe setiembre). */
function longDay(day: string): string {
  const d = new Date(`${day}T12:00:00-05:00`);
  const wd = d.toLocaleDateString('es-PE', { weekday: 'long', timeZone: 'America/Lima' });
  const dm = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });
  return `${wd} ${dm}`.replace(/septiembre/i, 'setiembre');
}

const ERRORS: Record<string, string> = {
  pagos_no_cuadran: 'Los pagos no suman el total. Revisa los montos.',
  gift_card_sin_saldo: 'Esa gift card no existe o no tiene saldo suficiente.',
  paquete_sin_usos: 'El paquete ya no tiene usos disponibles o venció.',
  paquete_no_cubre_servicio: 'El paquete no cubre los servicios de esta venta.',
  paquete_requiere_cliente: 'Para vender o usar un paquete elige un cliente.',
  membresia_requiere_cliente: 'Para vender una membresía elige un cliente.',
  puntos_requieren_cliente: 'Para canjear puntos elige un cliente.',
  puntos_insuficientes: 'El cliente no tiene puntos suficientes para ese premio.',
  premio_no_encontrado: 'Ese premio ya no está disponible.',
  cita_ya_cobrada: 'Esta cita ya fue cobrada.',
  cita_no_encontrada: 'No encontramos esa cita.',
  funcion_desactivada: 'La caja está desactivada. Actívala en Funciones.',
  propinas_desactivadas: 'Las propinas están desactivadas en Funciones.',
  monto_minimo_gift_card: 'La gift card debe ser de al menos S/ 5.00.',
  producto_no_encontrado: 'Uno de los productos ya no está a la venta.',
  servicio_no_encontrado: 'Uno de los servicios ya no existe.',
  item_incompleto: 'Falta el nombre o el monto de un concepto.',
  caja_ya_abierta: 'La caja ya estaba abierta.',
  caja_cerrada: 'La caja está cerrada. Ábrela primero.',
  no_se_puede_anular: 'Esta venta ya estaba anulada.',
  sin_permiso: 'Tu cuenta no tiene permiso para esto.',
  nada_por_cobrar: 'Esto ya fue cobrado.',
  elige_el_servicio: 'Elige el servicio que se hizo.',
  falta_medio_de_pago: 'Elige cómo paga.',
  sin_stock: 'Uno de los productos ya no tiene stock.',
};
function errMsg(e: unknown, fallback = 'No se pudo completar. Intenta de nuevo.') {
  if (e instanceof ApiError) {
    if (e.message === 'pagos_no_cuadran' && typeof e.data.total === 'number') {
      return `Los pagos no suman el total de ${soles(e.data.total)} (suman ${soles(Number(e.data.paid ?? 0))}).`;
    }
    return ERRORS[e.message] ?? fallback;
  }
  return fallback;
}

const DENOMS: { cents: number; label: string; coin: boolean }[] = [
  { cents: 20000, label: 'S/ 200', coin: false },
  { cents: 10000, label: 'S/ 100', coin: false },
  { cents: 5000, label: 'S/ 50', coin: false },
  { cents: 2000, label: 'S/ 20', coin: false },
  { cents: 1000, label: 'S/ 10', coin: false },
  { cents: 500, label: 'S/ 5', coin: true },
  { cents: 200, label: 'S/ 2', coin: true },
  { cents: 100, label: 'S/ 1', coin: true },
  { cents: 50, label: 'S/ 0.50', coin: true },
  { cents: 20, label: 'S/ 0.20', coin: true },
  { cents: 10, label: 'S/ 0.10', coin: true },
];

const chipCls = (on: boolean) =>
  `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-medium transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`;
const iconBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line transition-colors hover:border-ink disabled:opacity-40';
const moneyInput = `tnum ${inputCls} text-[16px]`;

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; label: string }) {
  return (
    <div className="flex w-full max-w-md rounded-full border border-line p-1 sm:w-auto" role="tablist" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => { haptic.tap(); onChange(id); }}
          className={`min-h-10 flex-1 rounded-full px-4 text-[14px] font-medium transition-colors sm:flex-none ${value === id ? 'bg-ink text-white' : 'text-mute hover:text-ink'}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${strong ? 'text-[17px] font-semibold' : 'text-[15px]'} ${muted ? 'text-mute' : ''}`}>
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

/* ------------------------------ Sección ------------------------------ */

type View = 'cobrar' | 'hoy' | 'caja' | 'cierre';

/* Última caja y catálogo vistos, para seguir cobrando si se cae el internet */
const cacheKey = (tenant: string, loc: string | null, what: string) => `datepe_caja_${what}_${tenant}_${loc ?? 'todas'}`;
function saveCache(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ }
}
function loadCache<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null; } catch { return null; }
}

export function Caja() {
  const { api, tenant, uploadHeaders, location } = usePanel();
  const sede = useSede();
  const [offline, setOffline] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<PosState | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('cobrar');
  const [salesTick, setSalesTick] = useState(0);
  const [openSheet, setOpenSheet] = useState(false);
  const [moveSheet, setMoveSheet] = useState<'in' | 'out' | null>(null);
  const [closeSheet, setCloseSheet] = useState(false);

  const loadState = useCallback(
    () =>
      api<PosState>('/admin/pos/state')
        .then((d) => { setState(d); setOffline(false); saveCache(cacheKey(tenant, location, 'state'), d); })
        .catch((e) => {
          const cached = isNetworkError(e) ? loadCache<PosState>(cacheKey(tenant, location, 'state')) : null;
          if (cached) { setState(cached); setOffline(true); return; }
          if (!(e instanceof ApiError && e.status === 403)) setFailed(true);
        }),
    [api, tenant, location],
  );
  const loadCatalog = useCallback(
    () =>
      api<Catalog>('/admin/pos/catalog')
        .then((d) => { setCatalog(d); saveCache(cacheKey(tenant, location, 'catalog'), d); })
        .catch((e) => {
          const cached = isNetworkError(e) ? loadCache<Catalog>(cacheKey(tenant, location, 'catalog')) : null;
          if (cached) setCatalog(cached);
        }),
    [api, tenant, location],
  );

  useEffect(() => {
    api<{ me: Me }>('/admin/me')
      .then((d) => { setMe(d.me); saveCache(cacheKey(tenant, null, 'me'), d.me); })
      .catch(() => setMe(loadCache<Me>(cacheKey(tenant, null, 'me')) ?? { id: '', name: '', role: 'owner', staffId: null }));
    loadState();
    loadCatalog();
  }, [api, loadState, loadCatalog]);

  // Precios especiales por barbero: la caja cobra lo mismo que calcula el servidor
  useEffect(() => {
    if (!catalog || !me || (me.role !== 'owner' && me.role !== 'manager')) return;
    let alive = true;
    Promise.allSettled(
      catalog.services.map((s) => api<{ overrides: { staff_id: string; price_cents: number | null; custom: boolean }[] }>(`/admin/services/${s.id}/staff`).then((d) => [s.id, d.overrides] as const)),
    ).then((res) => {
      if (!alive) return;
      const map: Record<string, Record<string, number>> = {};
      for (const r of res) {
        if (r.status !== 'fulfilled') continue;
        const [sid, list] = r.value;
        for (const o of list) if (o.custom && o.price_cents != null) (map[sid] ??= {})[o.staff_id] = o.price_cents;
      }
      setOverrides(map);
    });
    return () => { alive = false; };
    // Solo cuando cambia la lista de servicios
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog?.services.map((s) => s.id).join(','), me?.role]);

  // Tiempo real: ventas, caja y fila desde cualquier dispositivo
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadState();
        loadCatalog();
        setSalesTick((t) => t + 1);
      }, 250);
    };
    const connect = () => {
      const proto = API_BASE_CLIENT.startsWith('https') ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${API_BASE_CLIENT.replace(/^https?:\/\//, '')}/api/ws?tenant=${tenant}`);
      ws.onmessage = (ev) => {
        try {
          const t = JSON.parse(ev.data).type;
          if (['sale_created', 'sale_voided', 'cash_changed', 'queue_changed', 'availability_changed', 'config_changed'].includes(t)) refresh();
        } catch { /* mensaje no válido */ }
      };
      ws.onclose = () => { if (!stopped) retry = setTimeout(connect, 4000); };
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [tenant, loadState, loadCatalog]);

  // Un enlace #caja?ticket= o #caja?cita= siempre abre la vista de cobro
  useEffect(() => {
    const onHash = () => {
      const q = readHash();
      if (q.ticket || q.cita) setView('cobrar');
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshAll = useCallback(() => {
    loadState();
    loadCatalog();
    setSalesTick((t) => t + 1);
  }, [loadState, loadCatalog]);

  const canCash = me?.role !== 'staff';
  const session = state?.session ?? null;

  if (sede.multi && !sede.location) return (<><PageHead title="Caja" /><SedeGate what="caja" /></>);
  if (failed) return (<><PageHead title="Caja" /><Empty icon={Wallet} title="No pudimos cargar la caja" body="Revisa tu conexión e intenta de nuevo." action={<Btn onClick={() => { setFailed(false); loadState(); loadCatalog(); }}>Reintentar</Btn>} /></>);
  if (!state || !me) return (<><PageHead title="Caja" /><Skeleton rows={5} /></>);
  if (!state.features.pos) {
    return (
      <>
        <PageHead title="Caja" />
        <Empty
          icon={Wallet}
          title="La caja está desactivada"
          body="Actívala para cobrar servicios y productos, llevar el efectivo del día y cerrar con cuadre."
          action={<a href="#funciones" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-white hover:bg-ink-2">Ir a Funciones <ChevronRight size={16} strokeWidth={1.75} /></a>}
        />
      </>
    );
  }

  const views = canCash
    ? ([['cobrar', 'Cobrar'], ['hoy', 'Hoy'], ['caja', 'Efectivo'], ['cierre', 'Cierre']] as const)
    : ([['cobrar', 'Cobrar'], ['hoy', 'Hoy']] as const);

  return (
    <>
      <PageHead
        title="Caja"
        sub={
          session
            ? `Abierta desde las ${hhmm(session.opened_at)}${session.opened_by_name ? ` por ${session.opened_by_name}` : ''}. En efectivo deberías tener ${soles(session.cash.expected)}.`
            : 'La caja está cerrada. Se abre sola con el primer cobro, o ábrela ahora con el sencillo del día.'
        }
        actions={
          canCash && (
            <>
              <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${session ? 'bg-ok-tint text-ok' : 'bg-field text-mute'}`}>
                {session ? <LockOpen size={14} strokeWidth={1.75} /> : <Lock size={14} strokeWidth={1.75} />}
                {session ? 'Caja abierta' : 'Caja cerrada'}
              </span>
              {session ? (
                <Btn variant="secondary" onClick={() => { haptic.tap(); setCloseSheet(true); }}><Lock size={16} strokeWidth={1.75} /> Cerrar caja</Btn>
              ) : (
                <Btn onClick={() => { haptic.tap(); setOpenSheet(true); }}><LockOpen size={16} strokeWidth={1.75} /> Abrir caja</Btn>
              )}
            </>
          )
        }
      />

      <OfflineBar api={api} tenant={tenant} offline={offline} onSynced={refreshAll} />

      <div className="mb-6">
        <Segmented value={view} onChange={setView} options={views} label="Vista de la caja" />
      </div>

      {view === 'cobrar' && (
        catalog ? (
          <Register api={api} uploadHeaders={uploadHeaders} me={me} state={state} catalog={catalog} overrides={overrides} onDone={refreshAll} />
        ) : (
          <Skeleton rows={5} />
        )
      )}
      {view === 'hoy' && <Today api={api} uploadHeaders={uploadHeaders} state={state} me={me} tick={salesTick} onChanged={refreshAll} />}
      {view === 'caja' && canCash && (
        <CashPanel api={api} session={session} tick={salesTick} onOpen={() => setOpenSheet(true)} onMove={(k) => setMoveSheet(k)} onClose={() => setCloseSheet(true)} />
      )}
      {view === 'cierre' && canCash && (
        <Cierre
          api={api}
          tenant={tenant}
          state={state}
          catalog={catalog}
          overrides={overrides}
          tick={salesTick}
          onChanged={refreshAll}
          onCloseCash={() => { setView('caja'); if (session) setCloseSheet(true); }}
        />
      )}

      <OpenCashSheet api={api} open={openSheet} onClose={() => setOpenSheet(false)} onDone={refreshAll} />
      <MovementSheet api={api} kind={moveSheet} onKind={setMoveSheet} onClose={() => setMoveSheet(null)} onDone={refreshAll} />
      <CloseCashSheet api={api} open={closeSheet} session={session} onClose={() => setCloseSheet(false)} onDone={refreshAll} />
    </>
  );
}

type Api = ReturnType<typeof usePanel>['api'];

const SALE_ERR: Record<string, string> = {
  cita_ya_cobrada: 'La cita ya se había cobrado en otro dispositivo.',
  pagos_no_cuadran: 'Los pagos no cuadran con el total.',
  sin_stock: 'No había stock del producto.',
  gift_card_sin_saldo: 'La gift card no tenía saldo.',
  paquete_sin_usos: 'El paquete ya no tenía usos.',
  puntos_insuficientes: 'Al cliente no le alcanzaban los puntos.',
};

/**
 * Aviso de conexión y ventas por subir. Sube lo pendiente al volver el internet,
 * cada 20 segundos y al entrar a la caja.
 */
function OfflineBar({ api, tenant, offline, onSynced }: { api: Api; tenant: string; offline: boolean; onSynced: () => void }) {
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<OutboxSale[]>([]);
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async (manual = false) => {
    if (!readOutbox(tenant).some((s) => !s.error)) return;
    setSyncing(true);
    const r = await flushOutbox(tenant, (body, location) => api('/admin/pos/checkout', { method: 'POST', body, location }));
    setSyncing(false);
    if (r.sent) {
      toast.success(r.sent === 1 ? 'Se subió 1 venta hecha sin conexión.' : `Se subieron ${r.sent} ventas hechas sin conexión.`);
      onSynced();
    }
    if (r.failed) toast.error('Una venta sin conexión no se pudo registrar. Revísala en la caja.');
    if (manual && !r.sent && !r.failed) toast.info('Todavía no hay conexión.');
  }, [api, tenant, onSynced]);

  useEffect(() => {
    const read = () => setItems(readOutbox(tenant));
    // Al volver la red, la primera conexión a veces aún falla: se intenta al segundo y a los 5
    const on = () => { setOnline(true); setTimeout(() => void sync(), 1200); setTimeout(() => void sync(), 5000); };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    read();
    void sync();
    window.addEventListener(OUTBOX_EVENT, read);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => void sync(), 20000);
    return () => {
      window.removeEventListener(OUTBOX_EVENT, read);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(t);
    };
  }, [tenant, sync]);

  const pending = items.filter((s) => !s.error);
  const failed = items.filter((s) => s.error);
  if (online && !offline && !items.length) return null;

  return (
    <div className="mb-5 space-y-2" role="status">
      {(!online || offline) && (
        <div className="flex items-start gap-3 rounded-xl bg-[#fff4e0] px-4 py-3 text-[#8a5300]">
          <WifiOff size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <p className="text-[14px]"><span className="font-medium">Sin conexión.</span> Puedes seguir cobrando: las ventas se guardan en este dispositivo y se suben solas.</p>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
          <CloudUpload size={18} strokeWidth={1.75} className="shrink-0 text-mute" />
          <p className="min-w-0 flex-1 text-[14px]">
            {pending.length === 1 ? '1 venta por subir' : `${pending.length} ventas por subir`}
            <span className="block truncate text-mute">{pending.map((s) => s.label).join(', ')}</span>
          </p>
          <Btn variant="secondary" onClick={() => void sync(true)} disabled={syncing}>{syncing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} strokeWidth={1.75} />} Subir ahora</Btn>
        </div>
      )}
      {failed.map((s) => (
        <div key={s.ref} className="flex flex-wrap items-center gap-3 rounded-xl bg-red-tint px-4 py-3 text-red-deep">
          <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0" />
          <p className="min-w-0 flex-1 text-[14px]">
            <span className="font-medium">No se registró: {s.label}</span>
            <span className="block">{SALE_ERR[s.error ?? ''] ?? 'El servidor la rechazó.'} Cóbrala de nuevo si corresponde.</span>
          </p>
          <Btn variant="secondary" onClick={() => dropSale(tenant, s.ref)}>Descartar</Btn>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Cobrar ------------------------------ */

type CatTab = 'servicios' | 'productos' | 'paquetes' | 'membresias' | 'gift' | 'otro';
type Step = 'cart' | 'pay' | 'receipt' | 'done';

function readHash(): { ticket?: string; cita?: string } {
  if (typeof window === 'undefined') return {};
  const h = window.location.hash;
  const i = h.indexOf('?');
  if (i < 0) return {};
  const p = new URLSearchParams(h.slice(i + 1));
  return { ticket: p.get('ticket') ?? undefined, cita: p.get('cita') ?? undefined };
}

function Register({
  api, uploadHeaders, me, state, catalog, overrides, onDone,
}: {
  api: Api; uploadHeaders: Record<string, string>; me: Me; state: PosState; catalog: Catalog; overrides: Record<string, Record<string, number>>; onDone: () => void;
}) {
  const f = state.features;
  const cfg = state.config;
  const keyRef = useRef(1);
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState<ClientSel | null>(null);
  const [mainStaff, setMainStaff] = useState<string | null>(me.role === 'staff' ? me.staffId : null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [discount, setDiscount] = useState('');
  const [discountPct, setDiscountPct] = useState(false);
  const [tipPreset, setTipPreset] = useState<number | null>(0);
  const [tipCustom, setTipCustom] = useState('');
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [usePkg, setUsePkg] = useState<string | null>(null);
  const [useReward, setUseReward] = useState<string | null>(null);
  const [gift, setGift] = useState<{ code: string; amount: string } | null>(null);
  const [rows, setRows] = useState<PayRow[]>([{ id: 1, method: cfg.methods[0] ?? 'cash', amount: '' }]);
  const [received, setReceived] = useState('');
  const [receipt, setReceipt] = useState<ReceiptFile | null>(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<Step>('cart');
  const [sheet, setSheet] = useState(false);
  const [clientSheet, setClientSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(CheckoutResult & { change: number; giftCode: string | null; hadReceipt: boolean; offline?: boolean }) | null>(null);
  const { tenant, location = null } = useAdmin();

  const staffName = (id: string | null | undefined) => catalog.staff.find((s) => s.id === id)?.name ?? null;
  const lineStaff = (l: Line) => (l.kind === 'gift_card' ? null : l.staffId === undefined ? mainStaff : l.staffId);
  const unitOf = useCallback(
    (l: Line) => {
      if (l.kind !== 'service' || !l.refId) return l.unit;
      const st = l.staffId === undefined ? mainStaff : l.staffId;
      return (st ? overrides[l.refId]?.[st] : undefined) ?? l.unit;
    },
    [overrides, mainStaff],
  );

  /* ---------- Totales ---------- */
  const subtotal = lines.reduce((s, l) => s + unitOf(l) * l.qty, 0);
  const discountCents = Math.min(subtotal, discountPct ? Math.round((subtotal * Math.min(100, Number(discount) || 0)) / 100) : toCents(discount));
  const tipCents = !f.tips ? 0 : tipPreset !== null ? Math.round((subtotal * tipPreset) / 100 / 10) * 10 : toCents(tipCustom);
  const total = Math.max(0, subtotal - discountCents) + tipCents;
  const deposit = origin ? Math.min(origin.deposit, total) : 0;

  // Beneficios del cliente: valen lo que cubren en esta venta
  const serviceLines = lines.filter((l) => l.kind === 'service' && l.refId);
  const pkgInfo = wallet?.packages.find((p) => p.id === usePkg) ?? null;
  const pkgLine = pkgInfo ? serviceLines.find((l) => !pkgInfo.service_ids.length || pkgInfo.service_ids.includes(l.refId!)) : undefined;
  const rewardInfo = wallet?.rewards.find((r) => r.id === useReward) ?? null;
  const rewardValue = (r: Reward): number => {
    if (r.kind === 'discount_fixed') return r.value;
    if (r.kind === 'discount_percent') return Math.round((subtotal * r.value) / 100);
    const l = lines.find((x) => x.refId === r.ref_id && (r.kind === 'free_service' ? x.kind === 'service' : x.kind === 'product'));
    return l ? unitOf(l) : 0;
  };
  let left = total - deposit;
  const pkgAmount = pkgLine ? Math.min(unitOf(pkgLine), Math.max(0, left)) : 0;
  left -= pkgAmount;
  const rewardAmount = rewardInfo ? Math.min(rewardValue(rewardInfo), Math.max(0, left)) : 0;
  left -= rewardAmount;
  const giftAmount = gift ? Math.min(toCents(gift.amount), Math.max(0, left)) : 0;
  left -= giftAmount;
  const due = Math.max(0, left);
  const manualSum = rows.slice(1).reduce((s, r) => s + toCents(r.amount), 0);
  const autoAmount = Math.max(0, due - manualSum);
  const over = manualSum - due;
  const cashAmount = (rows[0]?.method === 'cash' ? autoAmount : 0) + rows.slice(1).reduce((s, r) => s + (r.method === 'cash' ? toCents(r.amount) : 0), 0);
  const change = toCents(received) - cashAmount;

  const needsClient = lines.some((l) => l.kind === 'package' || l.kind === 'membership');
  const blocker = !lines.length
    ? 'Agrega al menos un servicio o producto.'
    : needsClient && !client
      ? 'Elige un cliente para vender paquetes o membresías.'
      : over > 0
        ? `Los pagos superan lo que falta por ${soles(over)}.`
        : usePkg && !pkgLine
          ? 'El paquete elegido no cubre ningún servicio del carrito.'
          : rewardInfo && rewardValue(rewardInfo) === 0
            ? 'Agrega al carrito lo que cubre el premio.'
            : gift && (!gift.code.trim() || giftAmount === 0)
              ? 'Escribe el código y el monto de la gift card.'
              : null;

  /* ---------- Cliente y monedero ---------- */
  useEffect(() => {
    setWallet(null);
    setUsePkg(null);
    setUseReward(null);
    if (!client?.id || me.role === 'staff') return;
    let alive = true;
    api<WalletData>(`/admin/clients/${client.id}/wallet`).then((w) => { if (alive) setWallet(w); }).catch(() => {});
    return () => { alive = false; };
  }, [client?.id, api, me.role]);

  /* ---------- Carrito ---------- */
  function add(l: Omit<Line, 'key' | 'qty'> & { qty?: number }) {
    haptic.tap();
    setLines((prev) => {
      const same = l.refId && (l.kind === 'service' || l.kind === 'product') ? prev.find((x) => x.kind === l.kind && x.refId === l.refId) : undefined;
      if (same) {
        if (same.max !== undefined && same.qty >= same.max) {
          toast.info(same.max === 0 ? 'Sin stock' : `Solo quedan ${same.max} en stock`);
          return prev;
        }
        return prev.map((x) => (x === same ? { ...x, qty: x.qty + 1 } : x));
      }
      if ((l.kind === 'package' || l.kind === 'membership') && prev.some((x) => x.kind === l.kind && x.refId === l.refId)) return prev;
      return [...prev, { ...l, qty: l.qty ?? 1, key: keyRef.current++ }];
    });
  }
  function setQty(key: number, qty: number) {
    setLines((prev) =>
      prev.flatMap((x) => {
        if (x.key !== key) return [x];
        if (qty <= 0) return [];
        if (x.max !== undefined && qty > x.max) {
          toast.info(`Solo quedan ${x.max} en stock`);
          return [{ ...x, qty: x.max }];
        }
        return [{ ...x, qty }];
      }),
    );
  }

  function reset() {
    setLines([]);
    setClient(null);
    setOrigin(null);
    setMainStaff(me.role === 'staff' ? me.staffId : null);
    setDiscount('');
    setDiscountPct(false);
    setTipPreset(0);
    setTipCustom('');
    setGift(null);
    setRows([{ id: 1, method: cfg.methods[0] ?? 'cash', amount: '' }]);
    setReceived('');
    setReceipt(null);
    setReceiptNumber('');
    setNote('');
    setStep('cart');
    setResult(null);
  }

  /* ---------- Por cobrar: citas y turnos ---------- */
  const loadAppt = useCallback(
    (a: PendingAppt) => {
      setLines(
        a.services.map((s) => {
          const svc = catalog.services.find((x) => x.id === s.service_id);
          return { key: keyRef.current++, kind: 'service' as const, refId: s.service_id, name: s.name, unit: svc?.price_cents ?? s.price_cents, qty: 1 };
        }),
      );
      setMainStaff(a.staff_id);
      setClient(a.client_id ? { id: a.client_id, name: a.client_name ?? 'Cliente' } : null);
      setOrigin({ type: 'cita', id: a.id, label: `Cita de las ${hhmm(a.starts_at)}${a.client_name ? `, ${a.client_name}` : ''}`, deposit: Number(a.deposit_cents) || 0 });
    },
    [catalog.services],
  );
  const loadTicket = useCallback(
    (t: QTicket) => {
      const svc = catalog.services.find((x) => x.id === t.service_id);
      setLines(t.service_id ? [{ key: keyRef.current++, kind: 'service', refId: t.service_id, name: svc?.name ?? t.service_name ?? 'Servicio', unit: svc?.price_cents ?? t.price_cents ?? 0, qty: 1 }] : []);
      setMainStaff(t.served_by);
      setClient(t.client_id ? { id: t.client_id, name: t.name } : null);
      setOrigin({ type: 'turno', id: t.id, label: `Turno ${t.number}, ${t.name}`, deposit: 0 });
    },
    [catalog.services],
  );
  function pick(kind: 'cita' | 'turno', id: string) {
    if (lines.length && origin?.id !== id && !confirm('¿Reemplazar la venta en curso?')) return;
    haptic.select();
    setStep('cart');
    setResult(null);
    setDiscount('');
    setGift(null);
    setReceipt(null);
    setReceiptNumber('');
    setRows([{ id: 1, method: cfg.methods[0] ?? 'cash', amount: '' }]);
    setReceived('');
    if (kind === 'cita') {
      const a = catalog.pendingAppointments.find((x) => x.id === id);
      if (a) loadAppt(a);
    } else {
      const t = catalog.tickets.find((x) => x.id === id);
      if (t) loadTicket(t);
    }
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) setSheet(true);
    else {
      // En escritorio la venta se arma en el panel de la derecha: lo llevamos a la vista y lo resaltamos
      requestAnimationFrame(() => {
        const el = document.getElementById('caja-venta');
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.animate([{ boxShadow: '0 0 0 0 rgba(10,10,10,0)' }, { boxShadow: '0 0 0 4px rgba(10,10,10,0.18)' }, { boxShadow: '0 0 0 0 rgba(10,10,10,0)' }], { duration: 1200, easing: 'ease-out' });
      });
    }
  }

  // Enlace directo desde la Fila (#caja?ticket=) o la Agenda (#caja?cita=)
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const apply = () => {
      const q = readHash();
      const id = q.ticket ?? q.cita;
      if (!id || consumed.current === id) return;
      consumed.current = id;
      const found = q.ticket ? catalog.tickets.find((t) => t.id === id) : catalog.pendingAppointments.find((a) => a.id === id);
      if (found) {
        if (q.ticket) loadTicket(found as QTicket);
        else loadAppt(found as PendingAppt);
        setStep('cart');
        if (window.matchMedia('(max-width: 1023px)').matches) setSheet(true);
        toast.info(q.ticket ? 'Turno listo para cobrar' : 'Cita lista para cobrar');
      } else {
        toast.error(q.ticket ? 'Ese turno ya fue cobrado o no está en atención.' : 'Esa cita ya fue cobrada o no es de hoy.');
      }
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#caja`);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [catalog, loadAppt, loadTicket]);

  /* ---------- Comprobante ---------- */
  const [uploading, setUploading] = useState(false);
  async function onReceiptFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file, 'receipts', uploadHeaders);
      setReceipt({ url, pdf: file.type === 'application/pdf' });
      haptic.success();
    } catch {
      toast.error('No se pudo subir el comprobante. Usa una foto o un PDF.');
    } finally {
      setUploading(false);
    }
  }

  /* ---------- Cobro ---------- */
  async function checkout() {
    if (blocker) {
      toast.error(blocker);
      return;
    }
    setBusy(true);
    const payments: { method: string; amountCents: number; reference?: string }[] = [];
    if (pkgAmount > 0 && usePkg) payments.push({ method: 'package', amountCents: pkgAmount, reference: usePkg });
    if (rewardAmount > 0 && useReward) payments.push({ method: 'points', amountCents: rewardAmount, reference: useReward });
    if (giftAmount > 0 && gift) payments.push({ method: 'gift_card', amountCents: giftAmount, reference: gift.code.trim().toUpperCase() });
    if (autoAmount > 0) payments.push({ method: rows[0]?.method ?? 'cash', amountCents: autoAmount });
    for (const r of rows.slice(1)) if (toCents(r.amount) > 0) payments.push({ method: r.method, amountCents: toCents(r.amount) });
    if (!payments.length) payments.push({ method: rows[0]?.method ?? 'cash', amountCents: 0 });

    const ref = newRef();
    const body = {
      clientRef: ref,
      appointmentId: origin?.type === 'cita' ? origin.id : undefined,
      ticketId: origin?.type === 'turno' ? origin.id : undefined,
      clientId: client?.id,
      client: !client?.id && client?.phone ? { name: client.name, phone: client.phone } : undefined,
      staffId: mainStaff,
      items: lines.map((l) => ({
        kind: l.kind,
        refId: l.refId,
        name: l.kind === 'other' || l.kind === 'gift_card' ? l.name : undefined,
        qty: l.qty,
        unitCents: l.kind === 'other' || l.kind === 'gift_card' ? l.unit : undefined,
        staffId: lineStaff(l),
      })),
      discountCents: discountCents || undefined,
      tipCents: tipCents || undefined,
      payments,
      receiptUrl: receipt?.url,
      receiptNumber: receiptNumber.trim() || undefined,
      note: note.trim() || undefined,
    };
    try {
      const r = await api<CheckoutResult>('/admin/pos/checkout', { method: 'POST', body });
      let giftCode: string | null = null;
      if (lines.some((l) => l.kind === 'gift_card') && me.role !== 'staff') {
        // El código lo genera el servidor; lo leemos del detalle de la venta
        try {
          const d = await api<{ sales: Sale[] }>(`/admin/sales?from=${encodeURIComponent(`${limaToday()}T00:00:00-05:00`)}&limit=20`);
          const s = d.sales.find((x) => x.id === r.saleId);
          giftCode = s?.items?.map((i) => /GIFT-[A-F0-9]+/.exec(i.name)?.[0]).find(Boolean) ?? null;
        } catch { /* sin detalle */ }
      }
      setResult({ ...r, change: Math.max(0, change), giftCode, hadReceipt: !!receipt || !!receiptNumber.trim() });
      setStep('done');
      setSheet(true);
      toast.success(`Venta ${r.number} cobrada`);
      onDone();
    } catch (e) {
      if (isNetworkError(e)) {
        // Sin internet: la venta queda guardada en este dispositivo y se sube sola
        const total = lines.reduce((s2, l) => s2 + l.unit * l.qty, 0) - (discountCents || 0) + (tipCents || 0);
        enqueueSale(tenant, { ref, body: body as Record<string, unknown>, at: new Date().toISOString(), label: `${lines.map((l) => l.name).slice(0, 2).join(', ')}, ${soles(total)}`, location });
        haptic.success();
        setResult({ saleId: '', number: 0, total, pointsAwarded: 0, lowStock: [], change: Math.max(0, change), giftCode: null, hadReceipt: true, offline: true });
        setStep('done');
        setSheet(true);
        toast.info('Sin internet. La venta quedó guardada y se sube sola cuando vuelva la conexión.');
        onDone();
      } else {
        toast.error(errMsg(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function goPay() {
    if (!lines.length) return;
    haptic.tap();
    setStep('pay');
    setSheet(true);
  }

  /* ---------- Cobro de un toque ---------- */
  const [express, setExpress] = useState<ExpressTarget | null>(null);
  const [charged, setCharged] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [finishedAt, setFinishedAt] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const methods = quickMethods(cfg);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Hora en que terminó cada turno sin cobrar (el cierre del día la trae)
  const doneKey = catalog.tickets.filter((t) => t.status === 'done' && !t.finished_at).map((t) => t.id).join(',');
  useEffect(() => {
    if (!doneKey || me.role === 'staff') return;
    let alive = true;
    api<DayReport>('/admin/day/report')
      .then((r) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const u of r.uncharged) if (u.kind === 'ticket') map[u.id] = u.at;
        setFinishedAt(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [doneKey, api, me.role]);

  // Lo que ya se cobró sale de la lista al instante; al recargar el catálogo ya no viene
  useEffect(() => {
    setCharged((prev) => {
      if (!prev.size) return prev;
      const ids = new Set([...catalog.tickets.map((t) => t.id), ...catalog.pendingAppointments.map((a) => a.id)]);
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [catalog]);

  type PendingCard =
    | { kind: 'ticket'; id: string; finished: boolean; t: QTicket }
    | { kind: 'appointment'; id: string; finished: boolean; a: PendingAppt };
  const cards: PendingCard[] = [
    ...catalog.tickets.map((t) => ({ kind: 'ticket' as const, id: t.id, finished: t.status === 'done', t })),
    ...catalog.pendingAppointments.map((a) => ({ kind: 'appointment' as const, id: a.id, finished: a.status === 'completed', a })),
  ]
    .filter((c) => !charged.has(c.id))
    // Primero lo ya atendido y sin cobrar, luego lo que está en atención, luego las citas por venir
    .sort((x, y) => Number(y.finished) - Number(x.finished) || Number(y.kind === 'ticket') - Number(x.kind === 'ticket'));
  const finishedCount = cards.filter((c) => c.finished).length;
  const visible = showAll ? cards : cards.slice(0, Math.max(4, finishedCount));

  function onExpressDone(id: string) {
    setCharged((prev) => new Set(prev).add(id));
    if (origin?.id === id) reset();
    onDone();
  }

  /* ---------- Render ---------- */
  const pending = cards.length;
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const pendingCard = (c: PendingCard) => {
    const on = origin?.id === c.id;
    const isT = c.kind === 'ticket';
    const t = isT ? c.t : null;
    const a = !isT ? c.a : null;
    const name = t ? t.name : a!.client_name ?? 'Cliente';
    const staff = t ? t.served_by_name ?? staffName(t.served_by) : a!.staff_name;
    const detail = t ? [t.service_name, staff].filter(Boolean).join(', ') || 'Sin servicio' : [a!.services.map((s) => s.name).join(', '), staff].filter(Boolean).join(', ');
    const amount = t ? t.price_cents : Math.max(0, a!.services.reduce((s, x) => s + x.price_cents, 0) - Number(a!.discount_cents ?? 0));
    const deposit = a ? Number(a.deposit_cents) || 0 : 0;
    const fin = t ? t.finished_at ?? finishedAt[t.id] : null;
    const head = c.finished
      ? isT
        ? fin ? `Terminado ${agoLabel(fin, now)}` : 'Terminado, falta cobrar'
        : `Atendido, cita de las ${hhmm(a!.starts_at)}`
      : isT
        ? `Turno ${t!.number}, en atención`
        : `Cita ${hhmm(a!.starts_at)}`;
    const HeadIcon = c.finished ? Check : isT ? TicketIcon : Clock;
    return (
      <li key={c.id} className={`flex flex-col rounded-xl border p-4 transition-colors ${on ? 'border-ink shadow-lift' : c.finished ? 'border-ink' : 'border-line'}`}>
        <div className="flex items-start justify-between gap-3">
          <span className={`tnum inline-flex min-h-7 items-center gap-1.5 rounded-full text-[13px] font-medium ${c.finished ? 'bg-ok-tint px-2.5 text-ok' : 'text-mute'}`}>
            <HeadIcon size={14} strokeWidth={1.75} /> {head}
          </span>
          <button
            type="button"
            onClick={() => pick(isT ? 'turno' : 'cita', c.id)}
            className="-mr-2 -mt-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full px-3 text-[13px] font-medium text-mute hover:bg-field hover:text-ink"
          >
            Más opciones <ChevronRight size={15} strokeWidth={1.75} />
          </button>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[17px] font-semibold tracking-[-0.02em]">{name}</span>
          {amount ? <span className="tnum shrink-0 text-[17px] font-semibold">{soles(Math.max(0, amount - deposit))}</span> : null}
        </div>
        <span className="mt-0.5 flex items-baseline justify-between gap-3 text-[14px] text-mute">
          <span className="min-w-0 truncate">{detail}</span>
          {deposit > 0 && <span className="tnum shrink-0 text-[13px] text-ok">adelanto {soles(deposit)}</span>}
        </span>
        <MethodButtons methods={methods} onPick={(m) => setExpress({ kind: c.kind, id: c.id, method: m, name })} className="mt-3" />
      </li>
    );
  };

  const cart = (
    <CartPanel
      lines={lines} catalog={catalog} unitOf={unitOf} lineStaff={lineStaff} staffName={staffName} mainStaff={mainStaff} setMainStaff={setMainStaff}
      client={client} origin={origin} onClient={() => setClientSheet(true)} onClearOrigin={() => setOrigin(null)}
      setQty={setQty} setLineStaff={(key, st) => setLines((p) => p.map((x) => (x.key === key ? { ...x, staffId: st } : x)))}
      discount={discount} setDiscount={setDiscount} discountPct={discountPct} setDiscountPct={setDiscountPct} discountCents={discountCents}
      subtotal={subtotal} deposit={deposit} total={total} tipCents={tipCents} wallet={wallet}
    />
  );

  const sheetTitle = step === 'cart' ? 'Venta' : step === 'pay' ? 'Cobrar' : step === 'receipt' ? 'Comprobante' : 'Listo';

  return (
    <>
      {pending > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Por cobrar</h2>
            <span className="text-[13px] text-soft">
              {finishedCount > 0 ? `${finishedCount} ${finishedCount === 1 ? 'terminado' : 'terminados'} sin cobrar, ` : ''}{pending} {pending === 1 ? 'pendiente' : 'pendientes'} hoy
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(pendingCard)}</ul>
          {cards.length > visible.length && (
            <button type="button" onClick={() => { haptic.tap(); setShowAll(true); }} className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[14px] font-medium text-mute hover:bg-field hover:text-ink">
              Ver todos ({cards.length}) <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          )}
          {showAll && cards.length > 4 && (
            <button type="button" onClick={() => setShowAll(false)} className="mt-3 inline-flex min-h-11 items-center rounded-full px-3 text-[14px] font-medium text-mute hover:bg-field hover:text-ink">Ver menos</button>
          )}
        </section>
      )}

      <ExpressSheet api={api} state={state} services={catalog.services} overrides={overrides} target={express} onClose={() => setExpress(null)} onDone={onExpressDone} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <CatalogPanel catalog={catalog} features={f} lines={lines} onAdd={add} mainStaff={mainStaff} overrides={overrides} />

        <aside id="caja-venta" className="hidden scroll-mt-6 lg:block">
          <div className="sticky top-6 rounded-xl border border-line">
            <div className="max-h-[calc(100dvh-180px)] overflow-y-auto p-5">{cart}</div>
            <div className="border-t border-line p-4">
              <button
                type="button"
                disabled={!lines.length}
                onClick={goPay}
                className="flex min-h-12 w-full items-center justify-between rounded-full bg-red px-5 text-[15px] font-semibold text-white transition-colors hover:bg-red-deep disabled:bg-line-2 disabled:text-white"
              >
                <span>Cobrar</span>
                <span className="tnum">{soles(Math.max(0, total - deposit))}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Barra fija en teléfono y tableta: sobre la barra de pestañas del panel */}
      {lines.length > 0 && !sheet && (
        <>
          <div className="h-20 lg:hidden" aria-hidden />
          <div className="fixed inset-x-0 z-30 px-4 lg:hidden" style={{ bottom: 'calc(64px + max(12px, env(safe-area-inset-bottom)))' }}>
            <button
              type="button"
              onClick={() => { haptic.tap(); setStep('cart'); setSheet(true); }}
              className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-between gap-3 rounded-full bg-ink px-5 text-white shadow-pop active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 text-[15px] font-medium">
                <span className="tnum flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-[13px] font-semibold text-ink">{count}</span>
                Ver venta
              </span>
              <span className="tnum text-[17px] font-semibold">{soles(Math.max(0, total - deposit))}</span>
            </button>
          </div>
        </>
      )}

      <Sheet
        open={sheet}
        onClose={() => { setSheet(false); if (step === 'done') reset(); else if (step !== 'cart') setStep('cart'); }}
        title={sheetTitle}
        full
        footer={
          step === 'cart' ? (
            <button type="button" disabled={!lines.length} onClick={goPay} className="flex min-h-12 w-full items-center justify-between rounded-full bg-red px-5 text-[15px] font-semibold text-white hover:bg-red-deep disabled:bg-line-2">
              <span>Cobrar</span><span className="tnum">{soles(Math.max(0, total - deposit))}</span>
            </button>
          ) : step === 'pay' ? (
            <div className="flex w-full items-center gap-2">
              <button type="button" onClick={() => setStep('cart')} className={`${iconBtn} lg:hidden`} aria-label="Volver a la venta"><ChevronLeft size={18} strokeWidth={1.75} /></button>
              {cfg.askReceipt ? (
                <button type="button" disabled={!!blocker} onClick={() => { haptic.tap(); setStep('receipt'); }} className="flex min-h-12 flex-1 items-center justify-between rounded-full bg-ink px-5 text-[15px] font-semibold text-white hover:bg-ink-2 disabled:opacity-40">
                  <span>Continuar</span><span className="tnum">{soles(total)}</span>
                </button>
              ) : (
                <button type="button" disabled={!!blocker || busy} onClick={checkout} className="flex min-h-12 flex-1 items-center justify-between rounded-full bg-red px-5 text-[15px] font-semibold text-white hover:bg-red-deep disabled:opacity-40">
                  <span className="flex items-center gap-2">{busy && <Loader2 size={16} className="animate-spin" />} Confirmar cobro</span><span className="tnum">{soles(total)}</span>
                </button>
              )}
            </div>
          ) : step === 'receipt' ? (
            <div className="flex w-full items-center gap-2">
              <button type="button" onClick={() => setStep('pay')} className={iconBtn} aria-label="Volver al pago"><ChevronLeft size={18} strokeWidth={1.75} /></button>
              <button type="button" disabled={busy || uploading} onClick={checkout} className="flex min-h-12 flex-1 items-center justify-between rounded-full bg-red px-5 text-[15px] font-semibold text-white hover:bg-red-deep disabled:opacity-40">
                <span className="flex items-center gap-2">{busy && <Loader2 size={16} className="animate-spin" />} {receipt || receiptNumber.trim() ? 'Confirmar cobro' : 'Cobrar sin comprobante'}</span>
                <span className="tnum">{soles(total)}</span>
              </button>
            </div>
          ) : (
            <Btn className="min-h-12 w-full text-[15px]" onClick={() => { setSheet(false); reset(); }}><Plus size={16} strokeWidth={2} /> Nueva venta</Btn>
          )
        }
      >
        {step === 'cart' && cart}
        {step === 'pay' && (
          <div className="space-y-7">
            <div className="rounded-xl bg-field p-4">
              <Row label="Subtotal" value={soles(subtotal)} muted />
              {discountCents > 0 && <Row label="Descuento" value={`- ${soles(discountCents)}`} muted />}
              {tipCents > 0 && <Row label={`Propina${staffName(mainStaff) ? ` para ${staffName(mainStaff)}` : ''}`} value={soles(tipCents)} muted />}
              <Row label="Total" value={soles(total)} strong />
              {deposit > 0 && <Row label={<span className="flex items-center gap-1.5 text-ok"><CalendarCheck size={15} strokeWidth={1.75} /> Adelanto ya pagado</span>} value={<span className="text-ok">- {soles(deposit)}</span>} />}
            </div>

            {f.tips && (
              <section>
                <h3 className="mb-2 text-[15px] font-medium">Propina{staffName(mainStaff) ? ` para ${staffName(mainStaff)}` : ''}</h3>
                {!mainStaff && <p className="mb-2 text-[13px] text-soft">Elige quién atendió en la venta para que la propina quede a su nombre.</p>}
                <div className="flex flex-wrap gap-2">
                  {cfg.tipPresets.map((p) => (
                    <button key={p} type="button" onClick={() => { haptic.select(); setTipPreset(p); setTipCustom(''); }} className={chipCls(tipPreset === p)}>
                      {p === 0 ? 'Sin propina' : <>{p}% <span className="tnum opacity-70">{soles(Math.round((subtotal * p) / 100 / 10) * 10)}</span></>}
                    </button>
                  ))}
                  <label className={`${chipCls(tipPreset === null)} gap-1 pr-2`}>
                    <span>Otro S/</span>
                    <input
                      inputMode="decimal"
                      value={tipCustom}
                      onFocus={() => setTipPreset(null)}
                      onChange={(e) => { setTipPreset(null); setTipCustom(cleanAmount(e.target.value)); }}
                      placeholder="0"
                      className="tnum w-16 bg-transparent text-[16px] outline-none placeholder:text-current placeholder:opacity-50"
                      aria-label="Propina personalizada en soles"
                    />
                  </label>
                </div>
              </section>
            )}

            {client?.id && wallet && ((f.packages && wallet.packages.length > 0) || (f.rewards && wallet.rewards.length > 0)) && (
              <section>
                <h3 className="mb-1 text-[15px] font-medium">Beneficios de {client.name}</h3>
                <p className="mb-3 text-[13px] text-soft">{wallet.points} puntos{wallet.memberships.length ? `, membresía ${wallet.memberships[0]!.name}` : ''}</p>
                <div className="space-y-2">
                  {f.packages && wallet.packages.map((p) => {
                    const covers = serviceLines.some((l) => !p.service_ids.length || p.service_ids.includes(l.refId!));
                    const on = usePkg === p.id;
                    return (
                      <button key={p.id} type="button" disabled={!covers} onClick={() => { haptic.select(); setUsePkg(on ? null : p.id); }} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${on ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>
                        <Package size={18} strokeWidth={1.75} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">Usar {p.name}</span>
                          <span className={`block text-[13px] ${on ? 'text-white/70' : 'text-mute'}`}>{p.uses_left} de {p.uses_total} usos{covers ? '' : ', no cubre lo del carrito'}</span>
                        </span>
                        {on && <span className="tnum font-semibold">- {soles(pkgAmount)}</span>}
                      </button>
                    );
                  })}
                  {f.rewards && wallet.rewards.map((r) => {
                    const on = useReward === r.id;
                    const val = rewardValue(r);
                    return (
                      <button key={r.id} type="button" disabled={!r.available || (!on && val === 0)} onClick={() => { haptic.select(); setUseReward(on ? null : r.id); }} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${on ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>
                        <Award size={18} strokeWidth={1.75} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">Canjear {r.name}</span>
                          <span className={`block text-[13px] ${on ? 'text-white/70' : 'text-mute'}`}>
                            {r.points_cost} puntos{!r.available ? `, le faltan ${r.points_cost - wallet.points}` : val === 0 ? ', agrega lo que cubre' : ''}
                          </span>
                        </span>
                        {on && <span className="tnum font-semibold">- {soles(rewardAmount)}</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-medium">Gift card</h3>
                {!gift && <button type="button" onClick={() => setGift({ code: '', amount: centsToInput(due) })} className="min-h-10 rounded-full px-3 text-[14px] font-medium text-mute hover:bg-field hover:text-ink">Pagar con gift card</button>}
              </div>
              {gift && <GiftPay api={api} canLookup={me.role !== 'staff'} gift={gift} setGift={setGift} applied={giftAmount} />}
            </section>

            <section>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-medium">Cómo paga</h3>
                <span className="tnum text-[15px]">Por cobrar <strong className="font-semibold">{soles(due)}</strong></span>
              </div>
              <div className="space-y-4">
                {rows.map((r, i) => (
                  <div key={r.id} className={i > 0 ? 'rounded-xl border border-line p-3' : ''}>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {cfg.methods.map((m) => {
                        const Icon = METHOD[m]?.icon ?? Wallet;
                        return (
                          <button key={m} type="button" onClick={() => { haptic.select(); setRows((p) => p.map((x) => (x.id === r.id ? { ...x, method: m } : x))); }} className={`${chipCls(r.method === m)} shrink-0`}>
                            <Icon size={16} strokeWidth={1.75} /> {methodLabel(m)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {i === 0 ? (
                        <p className="tnum flex-1 text-[15px] text-mute">{rows.length > 1 ? 'El resto' : 'Monto'}: <strong className="font-semibold text-ink">{soles(autoAmount)}</strong></p>
                      ) : (
                        <>
                          <div className="relative flex-1">
                            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
                            <input inputMode="decimal" value={r.amount} onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, amount: cleanAmount(e.target.value) } : x)))} placeholder="0.00" className={`${moneyInput} pl-10`} aria-label={`Monto en ${methodLabel(r.method)}`} />
                          </div>
                          <button type="button" onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))} className={iconBtn} aria-label="Quitar este pago"><X size={17} strokeWidth={1.75} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {rows.length < 4 && due > 0 && (
                  <button type="button" onClick={() => { haptic.tap(); setRows((p) => [...p, { id: Date.now(), method: cfg.methods.find((m) => !p.some((x) => x.method === m)) ?? 'yape', amount: '' }]); }} className="flex min-h-11 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-mute hover:bg-field hover:text-ink">
                    <SplitSquareHorizontal size={16} strokeWidth={1.75} /> Dividir el pago
                  </button>
                )}
                {over > 0 && <p className="rounded-xl bg-red-tint px-4 py-3 text-[14px] text-red-deep">Los montos superan lo que falta por {soles(over)}.</p>}
              </div>
            </section>

            {cashAmount > 0 && (
              <section className="rounded-xl border border-line p-4">
                <h3 className="mb-3 flex items-center gap-2 text-[15px] font-medium"><Coins size={17} strokeWidth={1.75} /> Vuelto</h3>
                <div className="flex items-center gap-3">
                  <label className="flex-1">
                    <span className="mb-1 block text-[13px] text-mute">Recibí</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
                      <input inputMode="decimal" value={received} onChange={(e) => setReceived(cleanAmount(e.target.value))} placeholder={centsToInput(cashAmount)} className={`${moneyInput} pl-10`} />
                    </div>
                  </label>
                  <div className="flex-1 text-right">
                    <span className="mb-1 block text-[13px] text-mute">{change < 0 && toCents(received) > 0 ? 'Falta' : 'Vuelto'}</span>
                    <span className={`tnum block text-[26px] font-semibold leading-tight tracking-[-0.02em] ${change < 0 && toCents(received) > 0 ? 'text-red-deep' : ''}`}>
                      {toCents(received) > 0 ? soles(Math.abs(change)) : soles(0)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { haptic.select(); setReceived(centsToInput(cashAmount)); }} className={chipCls(toCents(received) === cashAmount)}>Exacto</button>
                  {[1000, 2000, 5000, 10000, 20000].filter((b) => b >= cashAmount || b * 2 > cashAmount).map((b) => (
                    <button key={b} type="button" onClick={() => { haptic.select(); setReceived(String(b / 100)); }} className={`${chipCls(toCents(received) === b)} tnum`}>S/ {b / 100}</button>
                  ))}
                </div>
              </section>
            )}

            <Field label="Nota (opcional)">
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. pagó la mitad su hermano" className={`${inputCls} text-[16px]`} />
            </Field>

            {blocker && lines.length > 0 && <p className="text-[14px] text-mute">{blocker}</p>}
          </div>
        )}

        {step === 'receipt' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[20px] font-semibold tracking-[-0.02em]">¿Adjuntar comprobante?</h3>
              <p className="mt-1 text-[15px] text-mute">Si emitiste una boleta o factura, toma una foto o elige el PDF. Es opcional y puedes adjuntarlo después desde Hoy.</p>
            </div>
            <ReceiptPicker receipt={receipt} uploading={uploading} onFile={onReceiptFile} onClear={() => setReceipt(null)} />
            <Field label="Número de comprobante (opcional)" hint="Por ejemplo B001-000123">
              <input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value.toUpperCase())} maxLength={40} className={`tnum ${inputCls} text-[16px] uppercase`} placeholder="B001-000123" />
            </Field>
          </div>
        )}

        {step === 'done' && result && (
          <DoneView result={result} api={api} uploadHeaders={uploadHeaders} />
        )}
      </Sheet>

      <ClientSheet api={api} open={clientSheet} onClose={() => setClientSheet(false)} current={client} onPick={(c) => { setClient(c); setClientSheet(false); }} />
    </>
  );
}

/* ---------- Cobro de un toque ---------- */

function MethodButtons({ methods, onPick, className = '' }: { methods: string[]; onPick: (m: string) => void; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className}`} style={{ gridTemplateColumns: `repeat(${methods.length}, minmax(0, 1fr))` }}>
      {methods.map((m) => {
        const Icon = METHOD[m]?.icon ?? Wallet;
        return (
          <button
            key={m}
            type="button"
            onClick={() => { haptic.tap(); onPick(m); }}
            className="flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-field px-1 text-[13px] font-medium transition-[background-color,transform] hover:bg-line active:scale-[0.97]"
            aria-label={`Cobrar con ${methodLabel(m)}`}
          >
            <Icon size={18} strokeWidth={1.75} />
            <span className="max-w-full truncate">{methodLabel(m)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hoja corta de confirmación: el servidor arma lo pendiente (servicios, descuento de la
 * reserva y adelanto) y cobra el resto con el medio elegido.
 */
function ExpressSheet({
  api, state, services, overrides, target, onClose, onDone,
}: {
  api: Api; state: PosState; services: Svc[]; overrides: Record<string, Record<string, number>>; target: ExpressTarget | null; onClose: () => void; onDone: (id: string) => void;
}) {
  const cfg = state.config;
  const tipsOn = !!state.features.tips;
  const { tenant, location = null } = useAdmin();
  const [info, setInfo] = useState<ExpressInfo | null>(null);
  const [method, setMethod] = useState('cash');
  const [svc, setSvc] = useState<string | null>(null);
  const [tipPct, setTipPct] = useState(0);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setInfo(null);
    setMethod(target.method);
    setSvc(null);
    setTipPct(0);
    setReceived('');
    let alive = true;
    const q = target.kind === 'ticket' ? `ticketId=${target.id}` : `appointmentId=${target.id}`;
    api<ExpressInfo>(`/admin/pos/express?${q}`)
      .then((d) => { if (alive) setInfo(d); })
      .catch((e) => {
        if (!alive) return;
        toast.error(errMsg(e, 'No pudimos traer lo pendiente. Intenta de nuevo.'));
        if (e instanceof ApiError && e.status === 404) onDone(target.id);
        onClose();
      });
    return () => { alive = false; };
    // Solo al abrir otro cobro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, target?.kind]);

  const picked = services.find((s) => s.id === svc) ?? null;
  const needsService = !!info?.needsService;
  const items = needsService
    ? picked ? [{ serviceId: picked.id, name: picked.name, priceCents: (info?.staffId ? overrides[picked.id]?.[info.staffId] : undefined) ?? picked.price_cents }] : []
    : info?.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.priceCents, 0);
  const discount = needsService ? 0 : info?.discountCents ?? 0;
  const total = needsService ? subtotal : info?.totalCents ?? 0;
  const deposit = needsService ? 0 : Math.min(info?.depositCents ?? 0, total);
  const tip = tipsOn ? tipOf(total, tipPct) : 0;
  const charge = Math.max(0, total - deposit) + tip;
  const change = method === 'cash' && toCents(received) > 0 ? toCents(received) - charge : 0;
  const ready = !!info && (!needsService || !!picked);
  const label = methodLabel(method);
  const methods = Array.from(new Set([...quickMethods(cfg), ...cfg.methods.filter((m) => EXPRESS_METHODS.includes(m))]));

  async function submit() {
    if (!target || !ready || busy) return;
    setBusy(true);
    let ref = '';
    let body: Record<string, unknown> = {};
    try {
      ref = newRef();
      body = {
        clientRef: ref,
        ticketId: target.kind === 'ticket' ? target.id : undefined,
        appointmentId: target.kind === 'appointment' ? target.id : undefined,
        payWith: method,
        tipCents: tip || undefined,
        items: needsService && picked ? [{ kind: 'service', refId: picked.id }] : undefined,
      };
      const r = await api<CheckoutResult>('/admin/pos/checkout', { method: 'POST', body });
      haptic.success();
      const who = info?.clientName ?? target.name;
      toast.success(`${who ? `${who}: ` : ''}${soles(charge)} con ${label}${change > 0 ? `. Vuelto ${soles(change)}` : ''}. Venta ${r.number}.`);
      if (r.lowStock?.length) toast.info(`Stock bajo: ${r.lowStock.map((p) => `${p.name} (${p.stock})`).join(', ')}`);
      onDone(target.id);
      onClose();
    } catch (e) {
      if (isNetworkError(e) && ref) {
        enqueueSale(tenant, { ref, body, at: new Date().toISOString(), label: `${info?.clientName ?? target.name ?? 'Cobro rápido'}, ${soles(charge)}`, location });
        haptic.success();
        toast.info(`Sin internet. ${soles(charge)} con ${label} quedó guardado y se sube solo.`);
        onDone(target.id);
        onClose();
        return;
      }
      haptic.error();
      toast.error(errMsg(e));
      if (e instanceof ApiError && (e.message === 'cita_ya_cobrada' || e.message === 'nada_por_cobrar')) { onDone(target.id); onClose(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title="Cobro rápido"
      footer={
        <button
          type="button"
          disabled={!ready || busy}
          onClick={submit}
          className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-full bg-red px-5 text-[16px] font-semibold text-white transition-colors hover:bg-red-deep active:scale-[0.98] disabled:opacity-40"
        >
          <span className="flex items-center gap-2">{busy && <Loader2 size={17} className="animate-spin" />} Cobrar</span>
          <span className="tnum">{ready ? soles(charge) : ''}</span>
        </button>
      }
    >
      {!info ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-8 w-3/4 animate-pulse rounded-lg bg-field" />
          <div className="h-5 w-1/2 animate-pulse rounded-lg bg-field" />
          <div className="h-24 animate-pulse rounded-xl bg-field" />
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-[24px] font-semibold leading-tight tracking-[-0.03em] [text-wrap:balance]">
              {ready ? <>Cobrar <span className="tnum">{soles(charge)}</span> con {label}</> : 'Elige el servicio que se hizo'}
            </p>
            <p className="mt-1 text-[15px] text-mute">{info.clientName ?? target?.name ?? 'Sin cliente'}</p>
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Medio de pago">
            {methods.map((m) => {
              const Icon = METHOD[m]?.icon ?? Wallet;
              return (
                <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => { haptic.select(); setMethod(m); }} className={`${chipCls(method === m)} shrink-0`}>
                  <Icon size={16} strokeWidth={1.75} /> {methodLabel(m)}
                </button>
              );
            })}
          </div>

          {needsService && (
            <section>
              <h3 className="mb-2 text-[15px] font-medium">¿Qué servicio se hizo?</h3>
              <div className="flex flex-wrap gap-2">
                {services.filter((s) => !s.is_addon).concat(services.filter((s) => s.is_addon)).map((s) => (
                  <button key={s.id} type="button" onClick={() => { haptic.select(); setSvc(s.id); }} className={chipCls(svc === s.id)}>
                    {s.name} <span className="tnum opacity-70">{soles((info.staffId ? overrides[s.id]?.[info.staffId] : undefined) ?? s.price_cents)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {items.length > 0 && (
            <div className="rounded-xl bg-field px-4 py-2">
              {items.map((i, idx) => <Row key={`${i.serviceId}-${idx}`} label={i.name} value={soles(i.priceCents)} />)}
              {discount > 0 && <Row label="Descuento de la reserva" value={`- ${soles(discount)}`} muted />}
              {deposit > 0 && <Row label={<span className="flex items-center gap-1.5 text-ok"><CalendarCheck size={15} strokeWidth={1.75} /> Adelanto pagado</span>} value={<span className="text-ok">- {soles(deposit)}</span>} />}
              {tip > 0 && <Row label="Propina" value={`+ ${soles(tip)}`} muted />}
            </div>
          )}

          {tipsOn && cfg.tipPresets.length > 0 && ready && (
            <section>
              <h3 className="mb-2 text-[15px] font-medium">Propina</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([0, ...cfg.tipPresets])).map((p) => (
                  <button key={p} type="button" onClick={() => { haptic.select(); setTipPct(p); }} className={chipCls(tipPct === p)}>
                    {p === 0 ? 'Sin propina' : <>{p}% <span className="tnum opacity-70">{soles(tipOf(total, p))}</span></>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {method === 'cash' && ready && charge > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-medium">¿Con cuánto paga?</h3>
                {change !== 0 && (
                  <span className={`tnum text-[17px] font-semibold ${change < 0 ? 'text-red-deep' : ''}`}>{change < 0 ? `Falta ${soles(-change)}` : `Vuelto ${soles(change)}`}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { haptic.select(); setReceived(''); }} className={chipCls(!received)}>Exacto</button>
                {[1000, 2000, 5000, 10000, 20000].filter((b) => b > charge && b < charge * 10).slice(0, 4).map((b) => (
                  <button key={b} type="button" onClick={() => { haptic.select(); setReceived(String(b / 100)); }} className={`${chipCls(toCents(received) === b)} tnum`}>S/ {b / 100}</button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Catálogo ---------- */

function CatalogPanel({
  catalog, features, lines, onAdd, mainStaff, overrides,
}: {
  catalog: Catalog; features: Record<string, boolean>; lines: Line[]; onAdd: (l: Omit<Line, 'key' | 'qty'> & { qty?: number }) => void; mainStaff: string | null; overrides: Record<string, Record<string, number>>;
}) {
  const [tab, setTab] = useState<CatTab>('servicios');
  const [q, setQ] = useState('');
  const [giftAmt, setGiftAmt] = useState('');
  const [other, setOther] = useState({ name: '', amount: '', qty: '1' });

  const tabs = ([
    ['servicios', 'Servicios', Scissors, true],
    ['productos', 'Productos', ShoppingBag, features.products !== false],
    ['paquetes', 'Paquetes', Package, !!features.packages && catalog.packages.length > 0],
    ['membresias', 'Membresías', BadgeCheck, !!features.memberships_sale && catalog.plans.length > 0],
    ['gift', 'Gift card', Gift, true],
    ['otro', 'Otro', PenLine, true],
  ] as const).filter((t) => t[3]);

  const inCart = (kind: LineKind, id: string) => lines.filter((l) => l.kind === kind && l.refId === id).reduce((s, l) => s + l.qty, 0);
  const match = (name: string) => !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());
  const svcPrice = (s: Svc) => (mainStaff ? overrides[s.id]?.[mainStaff] : undefined) ?? s.price_cents;

  const tile = (key: string, title: string, price: number, sub: React.ReactNode, onClick: () => void, qty: number, disabled = false, warn = false) => (
    <button
      key={key}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex min-h-[88px] flex-col justify-between rounded-xl border p-3.5 text-left transition-[border-color,transform] active:scale-[0.97] disabled:opacity-45 ${qty ? 'border-ink' : 'border-line hover:border-ink'}`}
    >
      {qty > 0 && <span className="tnum absolute right-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-semibold text-white">{qty}</span>}
      <span className="pr-7 text-[15px] font-medium leading-snug">{title}</span>
      <span className="mt-2 flex items-end justify-between gap-2">
        <span className={`text-[13px] ${warn ? 'text-red-deep' : 'text-soft'}`}>{sub}</span>
        <span className="tnum text-[15px] font-semibold">{soles(price)}</span>
      </span>
    </button>
  );

  return (
    <section className="min-w-0">
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="tablist" aria-label="Catálogo">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { haptic.tap(); setTab(id); setQ(''); }} className={`${chipCls(tab === id)} shrink-0`}>
            <Icon size={16} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </div>

      {['servicios', 'productos', 'paquetes', 'membresias'].includes(tab) && (
        <div className="mb-4 flex items-center gap-2 rounded-full border border-line-2 px-4 focus-within:border-ink">
          <Search size={17} strokeWidth={1.75} className="text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="min-h-11 w-full bg-transparent text-[16px] outline-none" aria-label="Buscar en el catálogo" />
          {q && <button type="button" onClick={() => setQ('')} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-field" aria-label="Borrar búsqueda"><X size={16} strokeWidth={1.75} /></button>}
        </div>
      )}

      {tab === 'servicios' && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {catalog.services.filter((s) => match(s.name)).map((s) =>
            tile(s.id, s.name, svcPrice(s), s.is_addon ? 'Adicional' : `${s.duration_min} min`, () => onAdd({ kind: 'service', refId: s.id, name: s.name, unit: s.price_cents }), inCart('service', s.id)),
          )}
        </div>
      )}

      {tab === 'productos' && (
        catalog.products.length === 0 ? (
          <Empty icon={ShoppingBag} title="Aún no tienes productos" body="Agrégalos en Productos para venderlos desde la caja y llevar su stock." action={<a href="#productos" className="text-[14px] font-medium underline">Ir a Productos</a>} />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {catalog.products.filter((p) => match(p.name) || match(p.category ?? '')).map((p) => {
              const qty = inCart('product', p.id);
              const left = p.stock - qty;
              const low = p.stock <= p.min_stock;
              return tile(
                p.id,
                p.name,
                p.price_cents,
                <span className="inline-flex items-center gap-1">{low && <TriangleAlert size={13} strokeWidth={1.75} />}{p.stock <= 0 ? 'Sin stock' : `${left} en stock`}</span>,
                () => (left <= 0 ? toast.info(p.stock <= 0 ? 'Sin stock' : `Solo quedan ${p.stock} en stock`) : onAdd({ kind: 'product', refId: p.id, name: p.name, unit: p.price_cents, max: p.stock })),
                qty,
                p.stock <= 0,
                low,
              );
            })}
          </div>
        )
      )}

      {tab === 'paquetes' && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {catalog.packages.filter((p) => match(p.name)).map((p) =>
            tile(p.id, p.name, p.price_cents, `${p.uses} usos, ${p.valid_days} días`, () => onAdd({ kind: 'package', refId: p.id, name: p.name, unit: p.price_cents }), inCart('package', p.id)),
          )}
        </div>
      )}

      {tab === 'membresias' && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {catalog.plans.filter((p) => match(p.name)).map((p) =>
            tile(p.id, p.name, p.price_cents, p.period === 'year' ? 'Anual' : 'Mensual', () => onAdd({ kind: 'membership', refId: p.id, name: p.name, unit: p.price_cents }), inCart('membership', p.id)),
          )}
        </div>
      )}

      {tab === 'gift' && (
        <div className="max-w-md space-y-4">
          <p className="text-[15px] text-mute">Vende una gift card por el monto que quieras. El código se genera al cobrar y lo verás en la pantalla final.</p>
          <div className="flex flex-wrap gap-2">
            {[3000, 5000, 8000, 10000, 15000].map((c) => (
              <button key={c} type="button" onClick={() => { haptic.select(); setGiftAmt(String(c / 100)); }} className={`${chipCls(toCents(giftAmt) === c)} tnum`}>S/ {c / 100}</button>
            ))}
          </div>
          <Field label="Monto" hint="Mínimo S/ 5.00">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
              <input inputMode="decimal" value={giftAmt} onChange={(e) => setGiftAmt(cleanAmount(e.target.value))} placeholder="50.00" className={`${moneyInput} pl-10`} />
            </div>
          </Field>
          <Btn
            disabled={toCents(giftAmt) < 500}
            onClick={() => { onAdd({ kind: 'gift_card', name: 'Gift card', unit: toCents(giftAmt), staffId: null }); setGiftAmt(''); }}
            className="min-h-11"
          >
            <Gift size={16} strokeWidth={1.75} /> Agregar gift card
          </Btn>
        </div>
      )}

      {tab === 'otro' && (
        <div className="max-w-md space-y-4">
          <p className="text-[15px] text-mute">Para cobrar algo que no está en tu catálogo: un recargo, una bebida, un servicio especial.</p>
          <Field label="Concepto">
            <input value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} maxLength={120} placeholder="Ej. Tinte de barba" className={`${inputCls} text-[16px]`} />
          </Field>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Precio">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
                <input inputMode="decimal" value={other.amount} onChange={(e) => setOther({ ...other, amount: cleanAmount(e.target.value) })} placeholder="0.00" className={`${moneyInput} pl-10`} />
              </div>
            </Field>
            <Field label="Cantidad">
              <input inputMode="numeric" value={other.qty} onChange={(e) => setOther({ ...other, qty: e.target.value.replace(/\D/g, '').slice(0, 2) })} className={moneyInput} />
            </Field>
          </div>
          <Btn
            disabled={!other.name.trim() || toCents(other.amount) <= 0}
            onClick={() => { onAdd({ kind: 'other', name: other.name.trim(), unit: toCents(other.amount), qty: Math.max(1, Number(other.qty) || 1) }); setOther({ name: '', amount: '', qty: '1' }); }}
            className="min-h-11"
          >
            <Plus size={16} strokeWidth={2} /> Agregar
          </Btn>
        </div>
      )}
    </section>
  );
}

/* ---------- Carrito ---------- */

function CartPanel(p: {
  lines: Line[]; catalog: Catalog; unitOf: (l: Line) => number; lineStaff: (l: Line) => string | null; staffName: (id: string | null | undefined) => string | null;
  mainStaff: string | null; setMainStaff: (v: string | null) => void; client: ClientSel | null; origin: Origin | null; onClient: () => void; onClearOrigin: () => void;
  setQty: (key: number, qty: number) => void; setLineStaff: (key: number, st: string | null | undefined) => void;
  discount: string; setDiscount: (v: string) => void; discountPct: boolean; setDiscountPct: (v: boolean) => void; discountCents: number;
  subtotal: number; deposit: number; total: number; tipCents: number; wallet: WalletData | null;
}) {
  const [showDiscount, setShowDiscount] = useState(false);
  const kindIcon: Record<LineKind, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
    service: Scissors, product: ShoppingBag, package: Package, membership: BadgeCheck, gift_card: Gift, other: PenLine,
  };
  return (
    <div className="space-y-5">
      {p.origin && (
        <div className="flex items-center gap-2 rounded-xl bg-field px-3.5 py-2.5 text-[14px]">
          {p.origin.type === 'cita' ? <CalendarCheck size={16} strokeWidth={1.75} /> : <TicketIcon size={16} strokeWidth={1.75} />}
          <span className="min-w-0 flex-1 truncate">{p.origin.label}</span>
          <button type="button" onClick={p.onClearOrigin} className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full hover:bg-line" aria-label="Desvincular"><X size={15} strokeWidth={1.75} /></button>
        </div>
      )}

      <button type="button" onClick={p.onClient} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left hover:border-ink">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field">
          {p.client ? <span className="text-[15px] font-semibold">{p.client.name.trim().charAt(0).toUpperCase()}</span> : <User size={18} strokeWidth={1.75} className="text-mute" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.client?.name ?? 'Sin cliente'}</span>
          <span className="block truncate text-[13px] text-mute">
            {p.client
              ? [p.client.phone, p.wallet ? `${p.wallet.points} puntos` : p.client.points !== undefined ? `${p.client.points} puntos` : null, p.wallet?.packages.length ? `${p.wallet.packages.length} paquete${p.wallet.packages.length > 1 ? 's' : ''}` : null].filter(Boolean).join(', ') || (p.client.id ? 'Cliente registrado' : 'Se registrará al cobrar')
              : 'Toca para buscar o agregar, suma puntos'}
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={1.75} className="text-soft" />
      </button>

      <div>
        <span className="mb-2 block text-[14px] font-medium">Atiende</span>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {p.catalog.staff.map((s) => (
            <button key={s.id} type="button" onClick={() => { haptic.select(); p.setMainStaff(p.mainStaff === s.id ? null : s.id); }} className={`${chipCls(p.mainStaff === s.id)} shrink-0 pl-1.5`}>
              {s.photo_url ? <img src={s.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[13px]">{s.name.charAt(0)}</span>}
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {p.lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-[15px] text-mute">Toca un servicio o producto para agregarlo.</div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {p.lines.map((l) => {
            const Icon = kindIcon[l.kind];
            const st = p.lineStaff(l);
            const qtyEditable = l.kind === 'service' || l.kind === 'product' || l.kind === 'other';
            return (
              <li key={l.key} className="py-3">
                <div className="flex items-start gap-3">
                  <Icon size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-soft" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{l.name}</span>
                      <span className="tnum shrink-0 font-medium">{soles(p.unitOf(l) * l.qty)}</span>
                    </div>
                    {l.qty > 1 && <span className="tnum block text-[13px] text-soft">{l.qty} x {soles(p.unitOf(l))}</span>}
                    <div className="mt-2 flex items-center gap-2">
                      {qtyEditable ? (
                        <div className="flex items-center rounded-full border border-line">
                          <button type="button" onClick={() => { haptic.tap(); p.setQty(l.key, l.qty - 1); }} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label={l.qty === 1 ? `Quitar ${l.name}` : 'Uno menos'}>
                            {l.qty === 1 ? <X size={15} strokeWidth={1.75} /> : <Minus size={15} strokeWidth={1.75} />}
                          </button>
                          <span className="tnum w-6 text-center text-[15px] font-medium">{l.qty}</span>
                          <button type="button" disabled={l.max !== undefined && l.qty >= l.max} onClick={() => { haptic.tap(); p.setQty(l.key, l.qty + 1); }} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field disabled:opacity-30" aria-label="Uno más">
                            <Plus size={15} strokeWidth={1.75} />
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => p.setQty(l.key, 0)} className="flex min-h-10 items-center gap-1 rounded-full border border-line px-3 text-[13px] text-mute hover:border-ink hover:text-ink"><X size={14} strokeWidth={1.75} /> Quitar</button>
                      )}
                      {l.kind !== 'gift_card' && p.catalog.staff.length > 0 && (
                        <select
                          value={l.staffId === undefined ? '__main' : l.staffId ?? ''}
                          onChange={(e) => p.setLineStaff(l.key, e.target.value === '__main' ? undefined : e.target.value || null)}
                          className="min-h-10 min-w-0 flex-1 truncate rounded-full border border-line bg-white px-3 text-[14px] outline-none focus:border-ink"
                          aria-label={`Barbero de ${l.name}`}
                        >
                          <option value="__main">{p.mainStaff ? `${p.staffName(p.mainStaff)} (quien atiende)` : 'Quien atiende'}</option>
                          {p.catalog.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          <option value="">Sin barbero</option>
                        </select>
                      )}
                    </div>
                    {l.kind === 'product' && l.max !== undefined && l.max - l.qty <= 2 && (
                      <span className="mt-1.5 flex items-center gap-1 text-[13px] text-red-deep"><TriangleAlert size={13} strokeWidth={1.75} /> {l.max - l.qty <= 0 ? 'Te llevas el último' : `Quedarán ${l.max - l.qty}`}</span>
                    )}
                    {st === null && l.kind !== 'gift_card' && l.staffId !== undefined && <span className="mt-1 block text-[12px] text-soft">No suma comisión</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        {!showDiscount && !p.discount ? (
          <button type="button" onClick={() => setShowDiscount(true)} className="flex min-h-10 items-center gap-2 rounded-full px-2 text-[14px] font-medium text-mute hover:text-ink"><Percent size={15} strokeWidth={1.75} /> Agregar descuento</button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 rounded-full border border-line p-0.5">
              <button type="button" onClick={() => p.setDiscountPct(false)} className={`h-10 rounded-full px-3 text-[14px] font-medium ${!p.discountPct ? 'bg-ink text-white' : 'text-mute'}`}>S/</button>
              <button type="button" onClick={() => p.setDiscountPct(true)} className={`h-10 rounded-full px-3 text-[14px] font-medium ${p.discountPct ? 'bg-ink text-white' : 'text-mute'}`}>%</button>
            </div>
            <input autoFocus inputMode="decimal" value={p.discount} onChange={(e) => p.setDiscount(cleanAmount(e.target.value))} placeholder={p.discountPct ? 'Porcentaje' : 'Monto'} className={moneyInput} aria-label="Descuento" />
            <button type="button" onClick={() => { p.setDiscount(''); setShowDiscount(false); }} className={iconBtn} aria-label="Quitar descuento"><X size={16} strokeWidth={1.75} /></button>
          </div>
        )}
      </div>

      <div className="border-t border-line pt-2">
        <Row label="Subtotal" value={soles(p.subtotal)} muted />
        {p.discountCents > 0 && <Row label="Descuento" value={`- ${soles(p.discountCents)}`} muted />}
        {p.tipCents > 0 && <Row label="Propina" value={soles(p.tipCents)} muted />}
        {p.deposit > 0 && <Row label={<span className="text-ok">Adelanto ya pagado</span>} value={<span className="text-ok">- {soles(p.deposit)}</span>} />}
        <Row label="Por cobrar" value={soles(Math.max(0, p.total - p.deposit))} strong />
      </div>
    </div>
  );
}

/* ---------- Gift card como pago ---------- */

function GiftPay({ api, canLookup, gift, setGift, applied }: { api: Api; canLookup: boolean; gift: { code: string; amount: string }; setGift: (g: { code: string; amount: string } | null) => void; applied: number }) {
  const [balance, setBalance] = useState<number | null | 'none'>(null);
  const cards = useRef<{ code: string; balance_cents: number; active: boolean }[] | null>(null);
  useEffect(() => {
    const code = gift.code.trim().toUpperCase();
    if (!canLookup || code.length < 6) { setBalance(null); return; }
    const t = setTimeout(async () => {
      try {
        cards.current ??= (await api<{ giftCards: { code: string; balance_cents: number; active: boolean }[] }>('/admin/gift-cards')).giftCards;
        const c = cards.current.find((x) => x.code.toUpperCase() === code && x.active);
        setBalance(c ? c.balance_cents : 'none');
      } catch { setBalance(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [gift.code, api, canLookup]);
  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <input value={gift.code} onChange={(e) => setGift({ ...gift, code: e.target.value.toUpperCase() })} placeholder="GIFT-XXXXXX" className={`${inputCls} font-mono text-[16px] uppercase tracking-[0.04em]`} aria-label="Código de la gift card" autoCapitalize="characters" />
        <button type="button" onClick={() => setGift(null)} className={iconBtn} aria-label="Quitar gift card"><X size={16} strokeWidth={1.75} /></button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
          <input inputMode="decimal" value={gift.amount} onChange={(e) => setGift({ ...gift, amount: cleanAmount(e.target.value) })} placeholder="0.00" className={`${moneyInput} pl-10`} aria-label="Monto a usar de la gift card" />
        </div>
        {typeof balance === 'number' && (
          <button type="button" onClick={() => setGift({ ...gift, amount: centsToInput(balance) })} className="min-h-11 shrink-0 rounded-full bg-field px-3 text-[14px] font-medium hover:bg-line">Usar saldo</button>
        )}
      </div>
      <p className={`text-[13px] ${balance === 'none' || (typeof balance === 'number' && toCents(gift.amount) > balance) ? 'text-red-deep' : 'text-soft'}`}>
        {balance === 'none' ? 'No encontramos una gift card activa con ese código.' : typeof balance === 'number' ? `Saldo disponible ${soles(balance)}${toCents(gift.amount) > balance ? ', el monto es mayor al saldo' : ''}.` : 'El saldo se valida al cobrar.'}
        {applied > 0 && applied < toCents(gift.amount) ? ` Se usarán ${soles(applied)}.` : ''}
      </p>
    </div>
  );
}

/* ---------- Comprobante ---------- */

function ReceiptPicker({ receipt, uploading, onFile, onClear }: { receipt: ReceiptFile | null; uploading: boolean; onFile: (f: File) => void; onClear: () => void }) {
  const cam = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };
  return (
    <div>
      <input ref={cam} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={onChange} />
      <input ref={file} type="file" accept="image/*,application/pdf" className="hidden" onChange={onChange} />
      {receipt ? (
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          {receipt.pdf ? (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-field"><FileText size={24} strokeWidth={1.5} /></span>
          ) : (
            <img src={receipt.url} alt="Comprobante" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-medium text-ok"><Check size={16} strokeWidth={2} /> Comprobante adjunto</span>
            <a href={receipt.url} target="_blank" rel="noopener noreferrer" className="text-[14px] text-mute underline">Ver archivo</a>
          </span>
          <button type="button" onClick={onClear} className={iconBtn} aria-label="Quitar comprobante"><X size={16} strokeWidth={1.75} /></button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" disabled={uploading} onClick={() => cam.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line text-[15px] font-medium hover:border-ink active:scale-[0.98] disabled:opacity-50">
            {uploading ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} strokeWidth={1.75} />} Tomar foto
          </button>
          <button type="button" disabled={uploading} onClick={() => file.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line text-[15px] font-medium hover:border-ink active:scale-[0.98] disabled:opacity-50">
            <Paperclip size={22} strokeWidth={1.75} /> Elegir archivo
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Pantalla final ---------- */

function DoneView({ result, api, uploadHeaders }: { result: CheckoutResult & { change: number; giftCode: string | null; hadReceipt: boolean; offline?: boolean }; api: Api; uploadHeaders: Record<string, string> }) {
  const [attach, setAttach] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptFile | null>(null);
  const [num, setNum] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(result.hadReceipt);
  async function onFile(file: File) {
    setUploading(true);
    try {
      setReceipt({ url: await uploadImage(file, 'receipts', uploadHeaders), pdf: file.type === 'application/pdf' });
    } catch {
      toast.error('No se pudo subir el comprobante.');
    } finally {
      setUploading(false);
    }
  }
  async function save() {
    try {
      await api(`/admin/sales/${result.saleId}`, { method: 'PATCH', body: { receiptUrl: receipt?.url, receiptNumber: num.trim() || undefined } });
      toast.success('Comprobante adjuntado');
      setSaved(true);
      setAttach(false);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar el comprobante.'));
    }
  }
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ok-tint text-ok">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="draw-check" aria-hidden><path d="M5 12.5l4.2 4.2L19 7" /></svg>
      </span>
      <p className="mt-4 text-[15px] text-mute">{result.offline ? 'Cobrada sin conexión. Se sube sola cuando vuelva el internet.' : `Venta ${result.number} cobrada`}</p>
      <p className="tnum mt-1 text-[40px] font-semibold leading-none tracking-[-0.035em]">{soles(result.total)}</p>
      {result.change > 0 && (
        <div className="mt-6 w-full rounded-xl bg-ink px-5 py-4 text-white">
          <span className="block text-[14px] text-white/70">Vuelto para el cliente</span>
          <span className="tnum block text-[32px] font-semibold tracking-[-0.03em]">{soles(result.change)}</span>
        </div>
      )}
      <div className="mt-6 w-full space-y-2 text-left">
        {result.pointsAwarded > 0 && (
          <p className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-[15px]"><Award size={18} strokeWidth={1.75} /> Sumó {result.pointsAwarded} puntos</p>
        )}
        {result.giftCode && (
          <div className="rounded-xl border border-line px-4 py-3">
            <span className="flex items-center gap-2 text-[14px] text-mute"><Gift size={16} strokeWidth={1.75} /> Código de la gift card</span>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-[20px] font-semibold tracking-[0.04em]">{result.giftCode}</span>
              <Btn variant="secondary" onClick={() => navigator.clipboard.writeText(result.giftCode ?? '').then(() => toast.success('Código copiado'), () => {})}>Copiar</Btn>
            </div>
          </div>
        )}
        {result.lowStock.length > 0 && (
          <div className="rounded-xl bg-red-tint px-4 py-3 text-[15px] text-red-deep">
            <span className="flex items-center gap-2 font-medium"><TriangleAlert size={17} strokeWidth={1.75} /> Stock bajo</span>
            <ul className="mt-1 space-y-0.5 text-[14px]">
              {result.lowStock.map((p) => <li key={p.id}>{p.name}: quedan {p.stock}</li>)}
            </ul>
          </div>
        )}
        {!saved && !attach && (
          <button type="button" onClick={() => setAttach(true)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line px-4 text-[15px] hover:border-ink"><Receipt size={18} strokeWidth={1.75} /> Adjuntar comprobante</button>
        )}
        {saved && <p className="flex items-center gap-2 px-1 text-[14px] text-ok"><Check size={16} strokeWidth={2} /> Comprobante guardado</p>}
        {attach && (
          <div className="space-y-3 rounded-xl border border-line p-3">
            <ReceiptPicker receipt={receipt} uploading={uploading} onFile={onFile} onClear={() => setReceipt(null)} />
            <input value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} maxLength={40} placeholder="Número, ej. B001-000123" className={`tnum ${inputCls} text-[16px]`} aria-label="Número de comprobante" />
            <Btn className="w-full" disabled={uploading || (!receipt && !num.trim())} onClick={save}>Guardar comprobante</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Cliente ---------- */

function ClientSheet({ api, open, onClose, current, onPick }: { api: Api; open: boolean; onClose: () => void; current: ClientSel | null; onPick: (c: ClientSel | null) => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<{ id: string; name: string | null; phone: string; loyalty_points: number }[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!open) { setQ(''); setList(null); setAdding(false); setName(''); setPhone(''); }
  }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setList(null); return; }
    const t = setTimeout(() => {
      api<{ clients: { id: string; name: string | null; phone: string; loyalty_points: number }[] }>(`/admin/clients/search?q=${encodeURIComponent(q.trim())}`).then((d) => setList(d.clients)).catch(() => setList([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q, api]);

  const phoneOk = phone.replace(/\D/g, '').length >= 9;
  return (
    <Sheet open={open} onClose={onClose} title="Cliente" full>
      {adding ? (
        <div className="space-y-4">
          <Field label="Nombre"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${inputCls} text-[16px]`} placeholder="Nombre y apellido" /></Field>
          <Field label="Celular" hint="Con el celular sumará puntos y lo encontrarás la próxima vez.">
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))} inputMode="tel" maxLength={20} className={`tnum ${inputCls} text-[16px]`} placeholder="987 654 321" />
          </Field>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => setAdding(false)}>Volver</Btn>
            <Btn disabled={!name.trim() || !phoneOk} onClick={() => { haptic.select(); onPick({ name: name.trim(), phone: phone.replace(/\s/g, '') }); }}>Usar este cliente</Btn>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-full border border-line-2 px-4 focus-within:border-ink">
            <Search size={17} strokeWidth={1.75} className="text-mute" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o celular" className="min-h-12 w-full bg-transparent text-[16px] outline-none" aria-label="Buscar cliente" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setAdding(true); if (/^\d/.test(q.trim())) setPhone(q.trim()); else setName(q.trim()); }} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line text-[15px] font-medium hover:border-ink"><UserPlus size={17} strokeWidth={1.75} /> Nuevo</button>
            <button type="button" onClick={() => { haptic.select(); onPick(null); }} className={`flex min-h-12 items-center justify-center gap-2 rounded-full border text-[15px] font-medium ${!current ? 'border-ink' : 'border-line hover:border-ink'}`}><UserX size={17} strokeWidth={1.75} /> Sin cliente</button>
          </div>
          {list === null ? (
            <p className="px-1 text-[14px] text-soft">Escribe al menos 2 letras o números.</p>
          ) : list.length === 0 ? (
            <p className="px-1 text-[15px] text-mute">Sin resultados. Agrégalo como nuevo.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {list.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { haptic.select(); onPick({ id: c.id, name: c.name ?? 'Sin nombre', phone: c.phone, points: c.loyalty_points }); }} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left active:bg-field">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field text-[15px] font-semibold">{(c.name ?? '?').charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name ?? 'Sin nombre'}</span>
                      <span className="tnum block text-[13px] text-mute">{c.phone}</span>
                    </span>
                    <span className="tnum text-[13px] font-medium">{c.loyalty_points} pts</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------ Hoy ------------------------------ */

function Today({ api, uploadHeaders, state, me, tick, onChanged }: { api: Api; uploadHeaders: Record<string, string>; state: PosState; me: Me; tick: number; onChanged: () => void }) {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [open, setOpen] = useState<Sale | null>(null);
  const canList = me.role !== 'staff';
  const t = state.today.totals;

  const load = useCallback(() => {
    if (!canList) return;
    const from = `${limaToday()}T00:00:00-05:00`;
    api<{ sales: Sale[] }>(`/admin/sales?from=${encodeURIComponent(from)}&limit=300`).then((d) => setSales(d.sales)).catch(() => setSales([]));
  }, [api, canList]);
  useEffect(() => { load(); }, [load, tick]);

  const staffRows = state.today.byStaff.filter((s) => s.servicios_cents || s.productos_cents || s.tips_cents);
  const maxMethod = Math.max(1, ...state.today.byMethod.map((m) => m.cents));

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendido hoy" value={soles(t.total_cents)} sub={t.discount_cents ? `${soles(t.discount_cents)} en descuentos` : undefined} />
        <StatTile label="Ventas" value={String(t.ventas)} sub={t.ventas ? `${t.con_recibo} con comprobante` : undefined} />
        <StatTile label="Ticket promedio" value={soles(t.ticket_promedio_cents)} sub="Sin propinas" />
        <StatTile label="Propinas" value={soles(t.tips_cents)} />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Por medio de pago</h2>
          {state.today.byMethod.length === 0 ? (
            <p className="mt-3 text-[15px] text-mute">Aún no hay cobros hoy.</p>
          ) : (
            <ul className="mt-4 space-y-3.5">
              {state.today.byMethod.map((m) => {
                const Icon = METHOD[m.method]?.icon ?? Wallet;
                return (
                  <li key={m.method}>
                    <div className="flex items-baseline justify-between gap-3 text-[15px]">
                      <span className="flex items-center gap-2"><Icon size={16} strokeWidth={1.75} className="text-mute" /> {methodLabel(m.method)} <span className="text-[13px] text-soft">{m.ventas} {m.ventas === 1 ? 'venta' : 'ventas'}</span></span>
                      <span className="tnum font-medium">{soles(m.cents)}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full"><div className="h-full rounded-r-[4px] bg-[#3f3f46]" style={{ width: `${Math.max(1.5, (m.cents / maxMethod) * 100)}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Por barbero</h2>
          {staffRows.length === 0 ? (
            <p className="mt-3 text-[15px] text-mute">Cuando cobres, verás aquí lo de cada uno.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[15px]">
                <thead>
                  <tr className="border-b border-ink text-[13px] text-mute">
                    <th className="py-2.5 pr-3 font-medium">Barbero</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Servicios</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Productos</th>
                    <th className="py-2.5 text-right font-medium">Propinas</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((s) => (
                    <tr key={s.staff_id} className="border-b border-line">
                      <td className="py-3 pr-3 font-medium">{s.name}<span className="tnum block text-[12px] font-normal text-soft">Comisión {soles(s.comision_cents)}</span></td>
                      <td className="tnum py-3 pr-3 text-right">{soles(s.servicios_cents)}</td>
                      <td className="tnum py-3 pr-3 text-right">{soles(s.productos_cents)}</td>
                      <td className="tnum py-3 text-right">{soles(s.tips_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {canList && (
        <section>
          <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">Ventas de hoy</h2>
          {!sales ? (
            <Skeleton rows={3} />
          ) : sales.length === 0 ? (
            <Empty icon={Receipt} title="Aún no hay ventas hoy" body="Cada cobro aparece aquí al instante, desde cualquier dispositivo." />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {sales.map((s) => {
                const voided = s.status === 'void';
                const methods = Array.from(new Set((s.payments ?? []).map((p) => p.method)));
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => setOpen(s)} className="flex min-h-16 w-full items-center gap-3 py-3 text-left active:bg-field md:hover:bg-field/60">
                      <span className="tnum w-12 shrink-0 text-[13px] text-mute">{hhmm(s.created_at)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate font-medium ${voided ? 'text-soft line-through' : ''}`}>{s.client_name ?? `Venta ${s.number}`}</span>
                          {voided && <span className="rounded-full bg-field px-2 py-0.5 text-[12px] font-medium text-mute">Anulada</span>}
                          {(s.receipt_url || s.receipt_number) && <Receipt size={14} strokeWidth={1.75} className="shrink-0 text-ok" aria-label="Con comprobante" />}
                        </span>
                        <span className="block truncate text-[13px] text-mute">{[(s.items ?? []).map((i) => (i.qty > 1 ? `${i.name} x${i.qty}` : i.name)).join(', '), s.staff_name].filter(Boolean).join(', ')}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`tnum block font-medium ${voided ? 'text-soft line-through' : ''}`}>{soles(s.total_cents)}</span>
                        <span className="block text-[12px] text-soft">{methods.map(methodLabel).join(', ')}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <SaleSheet api={api} uploadHeaders={uploadHeaders} sale={open} onClose={() => setOpen(null)} onChanged={() => { load(); onChanged(); }} />
    </div>
  );
}

function SaleSheet({ api, uploadHeaders, sale, onClose, onChanged }: { api: Api; uploadHeaders: Record<string, string>; sale: Sale | null; onClose: () => void; onChanged: () => void }) {
  const [receipt, setReceipt] = useState<ReceiptFile | null>(null);
  const [num, setNum] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReceipt(sale?.receipt_url ? { url: sale.receipt_url, pdf: /\.pdf(\?|$)/i.test(sale.receipt_url) } : null);
    setNum(sale?.receipt_number ?? '');
    setVoiding(false);
    setReason('');
  }, [sale]);

  if (!sale) return <Sheet open={false} onClose={onClose} title="Venta">{null}</Sheet>;
  const changedReceipt = (receipt?.url ?? null) !== sale.receipt_url || num.trim() !== (sale.receipt_number ?? '');

  async function onFile(file: File) {
    setUploading(true);
    try {
      setReceipt({ url: await uploadImage(file, 'receipts', uploadHeaders), pdf: file.type === 'application/pdf' });
    } catch {
      toast.error('No se pudo subir el comprobante.');
    } finally {
      setUploading(false);
    }
  }
  async function save() {
    setSaving(true);
    try {
      await api(`/admin/sales/${sale!.id}`, { method: 'PATCH', body: { receiptUrl: receipt?.url ?? null, receiptNumber: num.trim() || null } });
      toast.success('Comprobante guardado');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  }
  async function doVoid() {
    if (reason.trim().length < 2) return;
    setSaving(true);
    try {
      await api(`/admin/sales/${sale!.id}/void`, { method: 'POST', body: { reason: reason.trim() } });
      toast.success(`Venta ${sale!.number} anulada`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo anular.'));
    } finally {
      setSaving(false);
    }
  }

  const voided = sale.status === 'void';
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Venta ${sale.number}`}
      footer={
        voiding ? (
          <>
            <Btn variant="ghost" onClick={() => setVoiding(false)}>Cancelar</Btn>
            <Btn variant="danger" busy={saving} disabled={reason.trim().length < 2} onClick={doVoid}><Ban size={16} strokeWidth={1.75} /> Anular venta</Btn>
          </>
        ) : (
          <>
            {!voided && <Btn variant="danger" onClick={() => setVoiding(true)}>Anular</Btn>}
            <Btn busy={saving} disabled={!changedReceipt || uploading} onClick={save}>Guardar</Btn>
          </>
        )
      }
    >
      <div className="space-y-6">
        <div>
          <p className="text-[14px] text-mute">{dayShort(sale.created_at)}, {hhmm(sale.created_at)}{sale.created_by_name ? `, cobró ${sale.created_by_name}` : ''}</p>
          <p className={`tnum mt-1 text-[32px] font-semibold tracking-[-0.03em] ${voided ? 'text-soft line-through' : ''}`}>{soles(sale.total_cents)}</p>
          <p className="text-[15px]">{sale.client_name ?? 'Sin cliente'}{sale.client_phone ? <span className="tnum text-mute">, {sale.client_phone}</span> : null}</p>
          {voided && <p className="mt-3 rounded-xl bg-field px-4 py-3 text-[14px] text-mute">Anulada{sale.void_reason ? `: ${sale.void_reason}` : ''}. El stock y los saldos se devolvieron.</p>}
        </div>

        <div>
          <h3 className="mb-1 text-[14px] font-medium text-mute">Detalle</h3>
          <div className="divide-y divide-line border-y border-line">
            {(sale.items ?? []).map((i, idx) => <Row key={idx} label={i.qty > 1 ? `${i.name} x${i.qty}` : i.name} value={soles(i.total_cents)} />)}
          </div>
          {sale.discount_cents > 0 && <Row label="Descuento" value={`- ${soles(sale.discount_cents)}`} muted />}
          {sale.tip_cents > 0 && <Row label={`Propina${sale.staff_name ? ` para ${sale.staff_name}` : ''}`} value={soles(sale.tip_cents)} muted />}
        </div>

        <div>
          <h3 className="mb-1 text-[14px] font-medium text-mute">Pagos</h3>
          <div className="divide-y divide-line border-y border-line">
            {(sale.payments ?? []).map((p, idx) => {
              const Icon = METHOD[p.method]?.icon ?? Wallet;
              return <Row key={idx} label={<span className="flex items-center gap-2"><Icon size={16} strokeWidth={1.75} className="text-mute" /> {methodLabel(p.method)}{p.method === 'gift_card' && p.reference ? ` ${p.reference}` : ''}</span>} value={soles(p.amount_cents)} />;
            })}
          </div>
        </div>

        {sale.note && <p className="rounded-xl bg-field px-4 py-3 text-[14px]">{sale.note}</p>}

        {voiding ? (
          <Field label="Motivo de la anulación" hint="Queda registrado. Se devuelve el stock, el saldo de gift cards y los usos de paquetes.">
            <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={`resize-none ${inputCls} text-[16px]`} placeholder="Ej. se cobró dos veces" />
          </Field>
        ) : (
          <div>
            <h3 className="mb-2 text-[14px] font-medium text-mute">Comprobante</h3>
            <ReceiptPicker receipt={receipt} uploading={uploading} onFile={onFile} onClear={() => setReceipt(null)} />
            <input value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} maxLength={40} placeholder="Número, ej. B001-000123" className={`tnum mt-2.5 ${inputCls} text-[16px]`} aria-label="Número de comprobante" />
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------ Efectivo ------------------------------ */

function CashPanel({ api, session, tick, onOpen, onMove, onClose }: { api: Api; session: Session | null; tick: number; onOpen: () => void; onMove: (k: 'in' | 'out') => void; onClose: () => void }) {
  const [sessions, setSessions] = useState<CashSession[] | null>(null);
  useEffect(() => {
    api<{ sessions: CashSession[] }>('/admin/cash/sessions').then((d) => setSessions(d.sessions)).catch(() => setSessions([]));
  }, [api, tick]);
  const c = session?.cash;
  return (
    <div className="space-y-10">
      {session && c ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-line p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Efectivo en caja</h2>
              <span className="text-[13px] text-soft">Desde las {hhmm(session.opened_at)}</span>
            </div>
            <p className="tnum mt-3 text-[40px] font-semibold leading-none tracking-[-0.035em]">{soles(c.expected)}</p>
            <p className="mt-1 text-[14px] text-mute">Lo que debería haber en el cajón ahora.</p>
            <div className="mt-5 divide-y divide-line border-y border-line">
              <Row label="Apertura" value={soles(c.opening)} />
              <Row label="Cobros en efectivo" value={`+ ${soles(c.cash_sales)}`} />
              <Row label="Entradas" value={`+ ${soles(c.ins)}`} />
              <Row label="Salidas" value={`- ${soles(c.outs)}`} />
              <Row label="Gastos pagados de la caja" value={`- ${soles(c.expenses)}`} />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={() => { haptic.tap(); onMove('in'); }} className="flex min-h-16 items-center gap-3 rounded-xl border border-line px-4 text-left hover:border-ink active:scale-[0.98]">
              <ArrowDownLeft size={20} strokeWidth={1.75} /><span><span className="block font-medium">Entrada de efectivo</span><span className="block text-[13px] text-mute">Sencillo, aporte del dueño</span></span>
            </button>
            <button type="button" onClick={() => { haptic.tap(); onMove('out'); }} className="flex min-h-16 items-center gap-3 rounded-xl border border-line px-4 text-left hover:border-ink active:scale-[0.98]">
              <ArrowUpRight size={20} strokeWidth={1.75} /><span><span className="block font-medium">Salida de efectivo</span><span className="block text-[13px] text-mute">Retiro, compra rápida, pago</span></span>
            </button>
            <button type="button" onClick={() => { haptic.tap(); onClose(); }} className="flex min-h-16 items-center gap-3 rounded-xl bg-ink px-4 text-left text-white hover:bg-ink-2 active:scale-[0.98]">
              <Lock size={20} strokeWidth={1.75} /><span><span className="block font-medium">Cerrar caja</span><span className="block text-[13px] text-white/70">Cuenta billetes y monedas</span></span>
            </button>
          </div>
        </section>
      ) : (
        <Empty icon={Lock} title="La caja está cerrada" body="Ábrela con el sencillo con el que empiezas el día. Si cobras sin abrirla, se abre sola con S/ 0.00." action={<Btn onClick={onOpen}><LockOpen size={16} strokeWidth={1.75} /> Abrir caja</Btn>} />
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]"><History size={18} strokeWidth={1.75} /> Cierres anteriores</h2>
        {!sessions ? (
          <Skeleton rows={3} />
        ) : sessions.filter((s) => s.status === 'closed').length === 0 ? (
          <p className="text-[15px] text-mute">Aún no hay cierres.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {sessions.filter((s) => s.status === 'closed').map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium capitalize">{dayShort(s.opened_at)}</span>
                  <span className="tnum block text-[13px] text-mute">
                    {hhmm(s.opened_at)} a {s.closed_at ? hhmm(s.closed_at) : ''}, {s.ventas} {s.ventas === 1 ? 'venta' : 'ventas'}, {soles(s.total_cents)}{s.closed_by_name ? `, cerró ${s.closed_by_name}` : ''}
                  </span>
                  {s.notes && <span className="block truncate text-[13px] text-soft">{s.notes}</span>}
                </span>
                <span className="text-right">
                  <span className="tnum block text-[14px]">Contado {soles(s.counted_cents)}</span>
                  <DiffPill diff={Number(s.difference_cents ?? 0)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DiffPill({ diff, large }: { diff: number; large?: boolean }) {
  const [label, cls] = diff === 0 ? ['Cuadra exacto', 'bg-ok-tint text-ok'] : diff < 0 ? [`Falta ${soles(-diff)}`, 'bg-red-tint text-red-deep'] : [`Sobra ${soles(diff)}`, 'bg-[#fff4e0] text-[#8a5300]'];
  return <span className={`tnum inline-flex rounded-full font-medium ${large ? 'px-4 py-2 text-[16px]' : 'mt-1 px-2.5 py-1 text-[12px]'} ${cls}`}>{label}</span>;
}

function OpenCashSheet({ api, open, onClose, onDone }: { api: Api; open: boolean; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    setAmount('');
    api<{ sessions: CashSession[] }>('/admin/cash/sessions').then((d) => {
      const s = d.sessions.find((x) => x.status === 'closed');
      setLast(s?.counted_cents ?? null);
    }).catch(() => {});
  }, [open, api]);
  async function submit() {
    setBusy(true);
    try {
      await api('/admin/cash/open', { method: 'POST', body: { openingCents: toCents(amount) } });
      toast.success('Caja abierta');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo abrir la caja.'));
      if (e instanceof ApiError && e.message === 'caja_ya_abierta') { onDone(); onClose(); }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Abrir caja" footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn busy={busy} onClick={submit}><LockOpen size={16} strokeWidth={1.75} /> Abrir con {soles(toCents(amount))}</Btn></>}>
      <div className="space-y-5">
        <p className="text-[15px] text-mute">¿Con cuánto sencillo empiezas? Al cerrar compararemos lo que cuentes con lo que debería haber.</p>
        <Field label="Efectivo inicial">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
            <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} placeholder="0.00" className={`${moneyInput} pl-10 text-[20px]`} />
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          {[0, 5000, 10000, 20000].map((c) => (
            <button key={c} type="button" onClick={() => { haptic.select(); setAmount(c ? String(c / 100) : ''); }} className={`${chipCls(toCents(amount) === c)} tnum`}>{c ? `S/ ${c / 100}` : 'Sin sencillo'}</button>
          ))}
          {last !== null && last > 0 && ![0, 5000, 10000, 20000].includes(last) && (
            <button type="button" onClick={() => { haptic.select(); setAmount(centsToInput(last)); }} className={chipCls(toCents(amount) === last)}>Como el último cierre, <span className="tnum">{soles(last)}</span></button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function MovementSheet({ api, kind, onKind, onClose, onDone }: { api: Api; kind: 'in' | 'out' | null; onKind: (k: 'in' | 'out') => void; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (kind) { setAmount(''); setReason(''); } }, [kind === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggestions = kind === 'in' ? ['Sencillo', 'Aporte del dueño', 'Devolución'] : ['Retiro del dueño', 'Compra de insumos', 'Pago a proveedor', 'Movilidad'];
  async function submit() {
    if (!kind) return;
    setBusy(true);
    try {
      await api('/admin/cash/movement', { method: 'POST', body: { kind, amountCents: toCents(amount), reason: reason.trim() } });
      toast.success(kind === 'in' ? 'Entrada registrada' : 'Salida registrada');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo registrar.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={!!kind} onClose={onClose} title="Movimiento de efectivo" footer={<><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn busy={busy} disabled={toCents(amount) <= 0 || !reason.trim()} onClick={submit}>Registrar {soles(toCents(amount))}</Btn></>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onKind('in')} className={`${chipCls(kind === 'in')} min-h-12`}><ArrowDownLeft size={17} strokeWidth={1.75} /> Entrada</button>
          <button type="button" onClick={() => onKind('out')} className={`${chipCls(kind === 'out')} min-h-12`}><ArrowUpRight size={17} strokeWidth={1.75} /> Salida</button>
        </div>
        <Field label="Monto">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-mute">S/</span>
            <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} placeholder="0.00" className={`${moneyInput} pl-10 text-[20px]`} />
          </div>
        </Field>
        <Field label="Motivo">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} className={`${inputCls} text-[16px]`} placeholder="¿Para qué fue?" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => <button key={s} type="button" onClick={() => { haptic.select(); setReason(s); }} className={chipCls(reason === s)}>{s}</button>)}
        </div>
      </div>
    </Sheet>
  );
}

function CloseCashSheet({ api, open, session, onClose, onDone }: { api: Api; open: boolean; session: Session | null; onClose: () => void; onDone: () => void }) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ expected: number; counted: number; difference: number; summary: Summary } | null>(null);
  useEffect(() => { if (open) { setCounts({}); setNotes(''); setResult(null); } }, [open]);

  const counted = DENOMS.reduce((s, d) => s + d.cents * (counts[d.cents] ?? 0), 0);
  const expected = session?.cash.expected ?? 0;
  const diff = counted - expected;
  const bump = (cents: number, by: number) => { haptic.tap(); setCounts((c) => ({ ...c, [cents]: Math.max(0, (c[cents] ?? 0) + by) })); };

  async function submit() {
    if (diff !== 0 && !confirm(diff < 0 ? `Falta ${soles(-diff)}. ¿Cerrar de todas formas?` : `Sobra ${soles(diff)}. ¿Cerrar de todas formas?`)) return;
    setBusy(true);
    try {
      const r = await api<{ expected: number; counted: number; difference: number; summary: Summary }>('/admin/cash/close', { method: 'POST', body: { countedCents: counted, notes: notes.trim() || undefined } });
      setResult(r);
      toast.success('Caja cerrada');
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo cerrar la caja.'));
    } finally {
      setBusy(false);
    }
  }

  const denomRow = (d: (typeof DENOMS)[number]) => (
    <li key={d.cents} className="flex items-center gap-3 py-2">
      <span className="tnum w-16 shrink-0 text-[15px] font-medium">{d.label}</span>
      <div className="flex items-center rounded-full border border-line">
        <button type="button" onClick={() => bump(d.cents, -1)} disabled={!counts[d.cents]} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-field disabled:opacity-30" aria-label={`Uno menos de ${d.label}`}><Minus size={16} strokeWidth={1.75} /></button>
        <input
          inputMode="numeric"
          value={counts[d.cents] ? String(counts[d.cents]) : ''}
          onChange={(e) => setCounts((c) => ({ ...c, [d.cents]: Math.min(9999, Number(e.target.value.replace(/\D/g, '')) || 0) }))}
          placeholder="0"
          className="tnum h-11 w-12 bg-transparent text-center text-[16px] font-medium outline-none"
          aria-label={`Cantidad de ${d.coin ? 'monedas' : 'billetes'} de ${d.label}`}
        />
        <button type="button" onClick={() => bump(d.cents, 1)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-field" aria-label={`Uno más de ${d.label}`}><Plus size={16} strokeWidth={1.75} /></button>
      </div>
      <span className="tnum ml-auto text-[15px] text-mute">{counts[d.cents] ? soles(d.cents * counts[d.cents]!) : ''}</span>
    </li>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={result ? 'Caja cerrada' : 'Cerrar caja'}
      full
      footer={result ? <Btn className="min-h-12 w-full" onClick={onClose}>Listo</Btn> : (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between text-[15px]">
            <span className="text-mute">Contado</span>
            <span className="tnum text-[20px] font-semibold">{soles(counted)}</span>
          </div>
          <Btn busy={busy} disabled={!session} className="min-h-12 w-full" onClick={submit}><Lock size={16} strokeWidth={1.75} /> Cerrar caja</Btn>
        </div>
      )}
    >
      {result ? (
        <div className="space-y-6">
          <div className="text-center">
            <DiffPill diff={result.difference} large />
          </div>
          <div className="divide-y divide-line border-y border-line">
            <Row label="Debía haber" value={soles(result.expected)} />
            <Row label="Contaste" value={soles(result.counted)} />
            <Row label="Diferencia" value={<span className={result.difference < 0 ? 'text-red-deep' : result.difference > 0 ? 'text-[#8a5300]' : 'text-ok'}>{result.difference > 0 ? '+ ' : result.difference < 0 ? '- ' : ''}{soles(Math.abs(result.difference))}</span>} strong />
          </div>
          <div>
            <h3 className="mb-1 text-[15px] font-medium">Resumen del turno</h3>
            <div className="divide-y divide-line border-y border-line">
              <Row label="Ventas" value={result.summary.totals.ventas} />
              <Row label="Total vendido" value={soles(result.summary.totals.total_cents)} />
              <Row label="Propinas" value={soles(result.summary.totals.tips_cents)} />
              <Row label="Ticket promedio" value={soles(result.summary.totals.ticket_promedio_cents)} />
              {result.summary.byMethod.map((m) => <Row key={m.method} label={methodLabel(m.method)} value={soles(m.cents)} muted />)}
            </div>
          </div>
          {result.summary.byStaff.some((s) => s.servicios_cents || s.productos_cents) && (
            <div>
              <h3 className="mb-1 text-[15px] font-medium">Por barbero</h3>
              <div className="divide-y divide-line border-y border-line">
                {result.summary.byStaff.filter((s) => s.servicios_cents || s.productos_cents).map((s) => (
                  <Row key={s.staff_id} label={s.name} value={`${soles(s.servicios_cents + s.productos_cents)}${s.tips_cents ? `, propina ${soles(s.tips_cents)}` : ''}`} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-field px-2 py-3"><span className="block text-[13px] text-mute">Debía haber</span><span className="tnum block text-[17px] font-semibold">{soles(expected)}</span></div>
            <div className="rounded-xl bg-field px-2 py-3"><span className="block text-[13px] text-mute">Contado</span><span className="tnum block text-[17px] font-semibold">{soles(counted)}</span></div>
            <div className={`rounded-xl px-2 py-3 ${diff === 0 ? 'bg-ok-tint text-ok' : diff < 0 ? 'bg-red-tint text-red-deep' : 'bg-[#fff4e0] text-[#8a5300]'}`}>
              <span className="block text-[13px]">{diff === 0 ? 'Cuadra' : diff < 0 ? 'Falta' : 'Sobra'}</span>
              <span className="tnum block text-[17px] font-semibold">{soles(Math.abs(diff))}</span>
            </div>
          </div>
          <div>
            <h3 className="text-[15px] font-medium">Billetes</h3>
            <ul className="divide-y divide-line">{DENOMS.filter((d) => !d.coin).map(denomRow)}</ul>
          </div>
          <div>
            <h3 className="text-[15px] font-medium">Monedas</h3>
            <ul className="divide-y divide-line">{DENOMS.filter((d) => d.coin).map(denomRow)}</ul>
          </div>
          <Field label="Notas (opcional)">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className={`resize-none ${inputCls} text-[16px]`} placeholder="Ej. se pagó al proveedor de toallas" />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------ Cierre del día ------------------------------ */

const activeStaff = (r: DayReport) => r.byStaff.filter((s) => s.clientes || s.servicios_cents || s.productos_cents || s.tips_cents);

/** Resumen en texto plano para WhatsApp: corto, sin símbolos, fácil de leer en el teléfono. */
function closingText(r: DayReport, shop: string): string {
  const t = r.totals;
  const out: string[] = [];
  out.push(`Cierre de ${shop}, ${longDay(r.date)}`);
  out.push('');
  out.push(`Total ${soles(t.total_cents)} en ${t.ventas} ${t.ventas === 1 ? 'venta' : 'ventas'}. Ticket promedio ${soles(t.ticket_promedio_cents)}. Propinas ${soles(t.tips_cents)}.`);
  if (r.byMethod.length) out.push(`${r.byMethod.map((m) => `${reportMethod(m.method)} ${soles(m.cents)}`).join(', ')}.`);
  const staff = activeStaff(r);
  if (staff.length) {
    out.push('');
    out.push('Por barbero:');
    for (const s of staff) {
      out.push(`${s.name}: ${soles(s.servicios_cents + s.productos_cents)}, ${s.clientes} ${s.clientes === 1 ? 'cliente' : 'clientes'}, comisión ${soles(s.comision_cents)}, propinas ${soles(s.tips_cents)}, a entregar ${soles(s.a_entregar_cents)}.`);
    }
  }
  out.push('');
  const c = r.cash;
  if (!c.sessions) out.push('Efectivo: no se abrió la caja.');
  else if (c.open) out.push(`Efectivo: debería haber ${soles(c.expected_cents)}. La caja sigue abierta.`);
  else {
    const d = Number(c.difference_cents ?? 0);
    out.push(`Efectivo: debía haber ${soles(c.expected_cents)}, se contó ${soles(c.counted_cents)}, ${d === 0 ? 'cuadra exacto' : d < 0 ? `falta ${soles(-d)}` : `sobra ${soles(d)}`}.`);
  }
  if (r.appointments.total) out.push(`Citas: ${r.appointments.completed} completadas, ${r.appointments.no_show} no vinieron, ${r.appointments.cancelled} canceladas.`);
  if (r.queue.atendidos || r.queue.no_vinieron) out.push(`Fila: ${r.queue.atendidos} atendidos, ${r.queue.no_vinieron} no vinieron, espera promedio ${r.queue.espera_promedio_min} min.`);
  if (r.expenses_cents) out.push(`Gastos: ${soles(r.expenses_cents)}.`);
  if (r.topServices.length) out.push(`Más pedidos: ${r.topServices.map((s) => `${s.name} (${s.n})`).join(', ')}.`);
  if (r.uncharged.length) out.push(`Sin cobrar: ${r.uncharged.length} (${r.uncharged.map((u) => u.name ?? 'Cliente').join(', ')}).`);
  return out.join('\n');
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Hoja imprimible del cierre, para archivar en papel. */
function printClosing(r: DayReport, shop: string) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) {
    toast.error('Tu navegador bloqueó la ventana. Permite ventanas emergentes para imprimir.');
    return;
  }
  const t = r.totals;
  const c = r.cash;
  const row = (a: string, b: string, strong = false) => `<tr${strong ? ' class="strong"' : ''}><td>${esc(a)}</td><td class="n">${esc(b)}</td></tr>`;
  const staff = activeStaff(r);
  const d = Number(c.difference_cents ?? 0);
  const html = `<!doctype html><html lang="es-PE"><head><meta charset="utf-8"><title>Cierre ${esc(r.date)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Figtree,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#0a0a0a;margin:32px;font-size:13px;line-height:1.45}
  h1{font-size:22px;letter-spacing:-0.02em;margin:0} .sub{color:#5f5f66;margin:2px 0 20px}
  .total{font-size:34px;font-weight:600;letter-spacing:-0.03em;margin:0} h2{font-size:14px;margin:22px 0 6px;letter-spacing:-0.01em}
  table{width:100%;border-collapse:collapse} td,th{padding:5px 0;border-bottom:1px solid #e6e6e9;text-align:left;vertical-align:top} th{font-weight:500;color:#5f5f66;font-size:12px}
  .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:12px} .strong td{font-weight:600}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:0 28px} .foot{margin-top:28px;color:#71717a;font-size:11px}
  .sign{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:40px} .sign div{border-top:1px solid #0a0a0a;padding-top:4px;color:#5f5f66;font-size:11px}
  @media print{body{margin:14mm}}
</style></head><body>
<h1>Cierre de ${esc(shop)}</h1>
<p class="sub">${esc(longDay(r.date))}</p>
<p class="total">${esc(soles(t.total_cents))}</p>
<p class="sub">${t.ventas} ${t.ventas === 1 ? 'venta' : 'ventas'}, ticket promedio ${esc(soles(t.ticket_promedio_cents))}, propinas ${esc(soles(t.tips_cents))}. Servicios ${esc(soles(t.servicios_cents))}, productos ${esc(soles(t.productos_cents))}${t.discount_cents ? `, descuentos ${esc(soles(t.discount_cents))}` : ''}.</p>
<div class="cols">
  <div><h2>Por medio de pago</h2><table>${r.byMethod.length ? r.byMethod.map((m) => row(`${reportMethod(m.method)} (${m.ventas})`, soles(m.cents))).join('') : row('Sin cobros', soles(0))}</table></div>
  <div><h2>Efectivo</h2><table>${
    !c.sessions
      ? row('No se abrió la caja', '')
      : [row('Apertura', soles(c.opening_cents)), row('Cobros en efectivo', soles(c.cash_sales_cents)), row('Entradas', soles(c.ins_cents)), row('Salidas y gastos', soles(c.outs_cents)), row('Debía haber', soles(c.expected_cents), true),
        c.open ? row('Contado', 'Caja abierta') : row('Contado', soles(c.counted_cents)),
        c.open ? '' : row('Diferencia', d === 0 ? 'Cuadra exacto' : d < 0 ? `Falta ${soles(-d)}` : `Sobra ${soles(d)}`, true)].join('')
  }</table></div>
</div>
${staff.length ? `<h2>Por barbero</h2><table><tr><th>Barbero</th><th class="n">Clientes</th><th class="n">Servicios</th><th class="n">Productos</th><th class="n">Comisión</th><th class="n">Propinas</th><th class="n">A entregar</th></tr>${staff
    .map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${s.clientes}</td><td class="n">${esc(soles(s.servicios_cents))}</td><td class="n">${esc(soles(s.productos_cents))}</td><td class="n">${esc(soles(s.comision_cents))}</td><td class="n">${esc(soles(s.tips_cents))}</td><td class="n"><b>${esc(soles(s.a_entregar_cents))}</b></td></tr>`)
    .join('')}<tr class="strong"><td>Total</td><td class="n">${staff.reduce((a, s) => a + s.clientes, 0)}</td><td class="n">${esc(soles(staff.reduce((a, s) => a + s.servicios_cents, 0)))}</td><td class="n">${esc(soles(staff.reduce((a, s) => a + s.productos_cents, 0)))}</td><td class="n">${esc(soles(staff.reduce((a, s) => a + s.comision_cents, 0)))}</td><td class="n">${esc(soles(staff.reduce((a, s) => a + s.tips_cents, 0)))}</td><td class="n">${esc(soles(staff.reduce((a, s) => a + s.a_entregar_cents, 0)))}</td></tr></table>` : ''}
<div class="cols">
  <div><h2>Citas y fila</h2><table>${row('Citas completadas', String(r.appointments.completed))}${row('No vinieron a su cita', String(r.appointments.no_show))}${row('Citas canceladas', String(r.appointments.cancelled))}${row('Atendidos en la fila', String(r.queue.atendidos))}${row('No vinieron en la fila', String(r.queue.no_vinieron))}${row('Espera promedio', `${r.queue.espera_promedio_min} min`)}</table></div>
  <div><h2>Gastos y más pedidos</h2><table>${row('Gastos del día', soles(r.expenses_cents), true)}${r.topServices.map((s) => row(`${s.name} (${s.n})`, soles(s.cents))).join('')}</table></div>
</div>
${r.uncharged.length ? `<h2>Sin cobrar</h2><table>${r.uncharged.map((u) => row(`${u.name ?? 'Cliente'}${u.staff ? `, ${u.staff}` : ''}`, `${u.kind === 'ticket' ? 'Turno' : 'Cita'} ${hhmm(u.at)}`)).join('')}</table>` : ''}
<div class="sign"><div>Entregó</div><div>Recibió</div></div>
<p class="foot">Impreso el ${esc(new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' }).replace(/septiembre/i, 'setiembre'))} desde date.pe</p>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* el usuario puede imprimir a mano */ } }, 300);
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-field px-3 py-3">
      <span className="tnum block text-[20px] font-semibold leading-tight tracking-[-0.02em]">{value}</span>
      <span className="block truncate text-[13px] text-mute">{label}</span>
    </div>
  );
}

function Cierre({
  api, tenant, state, catalog, overrides, tick, onChanged, onCloseCash,
}: {
  api: Api; tenant: string; state: PosState; catalog: Catalog | null; overrides: Record<string, Record<string, number>>; tick: number; onChanged: () => void; onCloseCash: () => void;
}) {
  const today = limaToday();
  const yesterday = shiftDay(today, -1);
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<DayReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [shop, setShop] = useState(tenant);
  const [express, setExpress] = useState<ExpressTarget | null>(null);
  const [charged, setCharged] = useState<Set<string>>(() => new Set());
  const methods = quickMethods(state.config);

  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => r.json())
      .then((d) => d?.tenant?.name && setShop(d.tenant.name))
      .catch(() => {});
  }, [tenant]);

  const load = useCallback(() => {
    setFailed(false);
    api<DayReport>(`/admin/day/report?date=${date}`)
      .then((r) => { setReport(r); setCharged(new Set()); })
      .catch(() => setFailed(true));
  }, [api, date]);
  useEffect(() => { load(); }, [load, tick]);

  function pickDay(d: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) return;
    haptic.select();
    setDate(d);
  }

  const dayChips = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => pickDay(today)} className={chipCls(date === today)}>Hoy</button>
      <button type="button" onClick={() => pickDay(yesterday)} className={chipCls(date === yesterday)}>Ayer</button>
      <label className={`${chipCls(date !== today && date !== yesterday)} relative gap-2 pr-3`}>
        <CalendarDays size={16} strokeWidth={1.75} />
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => pickDay(e.target.value)}
          className="tnum w-[8.5rem] bg-transparent text-[16px] outline-none [color-scheme:light]"
          aria-label="Elegir otro día"
        />
      </label>
    </div>
  );

  if (failed) {
    return (
      <div className="space-y-6">
        {dayChips}
        <Empty icon={FileText} title="No pudimos cargar el cierre" body="Revisa tu conexión e intenta de nuevo." action={<Btn onClick={load}>Reintentar</Btn>} />
      </div>
    );
  }
  if (!report || report.date !== date) {
    return (
      <div className="space-y-6">
        {dayChips}
        <Skeleton rows={6} />
      </div>
    );
  }

  const r = report;
  const t = r.totals;
  const c = r.cash;
  const staff = activeStaff(r);
  const uncharged = r.uncharged.filter((u) => !charged.has(u.id));
  const isToday = r.date === today;
  const dayName = isToday ? 'hoy' : r.date === yesterday ? 'ayer' : longDay(r.date);
  const diff = Number(c.difference_cents ?? 0);
  const staffIdx = (id: string) => {
    const i = catalog?.staff.findIndex((s) => s.id === id) ?? -1;
    return i < 0 ? 99 : i;
  };
  const sum = (k: 'clientes' | 'servicios_cents' | 'productos_cents' | 'comision_cents' | 'tips_cents' | 'a_entregar_cents') => staff.reduce((a, s) => a + s[k], 0);

  function share() {
    haptic.tap();
    window.open(`https://wa.me/?text=${encodeURIComponent(closingText(r, shop))}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {dayChips}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Btn variant="secondary" className="min-h-11" onClick={share}><MessageCircle size={16} strokeWidth={1.75} /> <span className="sm:hidden">WhatsApp</span><span className="hidden sm:inline">Compartir por WhatsApp</span></Btn>
          <Btn variant="secondary" className="min-h-11" onClick={() => { haptic.tap(); printClosing(r, shop); }}><Printer size={16} strokeWidth={1.75} /> Imprimir</Btn>
        </div>
      </div>

      {/* Total del día */}
      <section className="rounded-xl border border-line p-5 md:p-6">
        <p className="text-[15px] text-mute">Total {isToday || r.date === yesterday ? `de ${dayName}` : `del ${dayName}`}</p>
        <p className="tnum mt-1 text-[44px] font-semibold leading-none tracking-[-0.04em] md:text-[56px]">{soles(t.total_cents)}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <div className="min-w-0"><dt className="text-[13px] text-mute">Ventas</dt><dd className="tnum text-[18px] font-semibold md:text-[20px]">{t.ventas}</dd></div>
          <div className="min-w-0"><dt className="truncate text-[13px] text-mute">Ticket promedio</dt><dd className="tnum truncate text-[18px] font-semibold md:text-[20px]">{soles(t.ticket_promedio_cents)}</dd></div>
          <div className="min-w-0"><dt className="text-[13px] text-mute">Propinas</dt><dd className="tnum truncate text-[18px] font-semibold md:text-[20px]">{soles(t.tips_cents)}</dd></div>
        </dl>
        <p className="tnum mt-3 text-[13px] text-soft">
          Servicios {soles(t.servicios_cents)}, productos {soles(t.productos_cents)}{t.discount_cents ? `, descuentos ${soles(t.discount_cents)}` : ''}.
        </p>
      </section>

      {/* Lo que falta cobrar, con cobro de un toque */}
      {uncharged.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Sin cobrar</h2>
            <span className="text-[13px] text-soft">{uncharged.length} {uncharged.length === 1 ? 'atendido sin venta' : 'atendidos sin venta'}</span>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {uncharged.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 py-3.5 md:flex-row md:items-center">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.name ?? 'Cliente'}</span>
                  <span className="tnum block truncate text-[13px] text-mute">
                    {u.kind === 'ticket' ? `Turno terminado a las ${hhmm(u.at)}` : `Cita de las ${hhmm(u.at)}`}{u.staff ? `, ${u.staff}` : ''}
                  </span>
                </span>
                <MethodButtons methods={methods} onPick={(m) => setExpress({ kind: u.kind, id: u.id, method: m, name: u.name })} className="md:w-[340px]" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Por medio de pago</h2>
          {r.byMethod.length === 0 ? (
            <p className="mt-3 text-[15px] text-mute">No hubo cobros este día.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {r.byMethod.map((m) => {
                const Icon = METHOD[m.method]?.icon ?? Wallet;
                return (
                  <li key={m.method} className="flex min-h-12 items-center gap-3 py-2 text-[15px]">
                    <Icon size={17} strokeWidth={1.75} className="shrink-0 text-mute" />
                    <span className="min-w-0 flex-1 truncate">{reportMethod(m.method)} <span className="tnum text-[13px] text-soft">{m.ventas} {m.ventas === 1 ? 'venta' : 'ventas'}</span></span>
                    <span className="tnum shrink-0 font-semibold">{soles(m.cents)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Efectivo</h2>
            {c.sessions > 1 && <span className="text-[13px] text-soft">{c.sessions} turnos de caja</span>}
          </div>
          {!c.sessions ? (
            <p className="mt-3 text-[15px] text-mute">No se abrió la caja este día.</p>
          ) : (
            <>
              <div className="mt-2 divide-y divide-line border-y border-line">
                <Row label="Apertura" value={soles(c.opening_cents)} />
                <Row label="Cobros en efectivo" value={`+ ${soles(c.cash_sales_cents)}`} />
                {c.ins_cents > 0 && <Row label="Entradas" value={`+ ${soles(c.ins_cents)}`} />}
                {c.outs_cents > 0 && <Row label="Salidas y gastos" value={`- ${soles(c.outs_cents)}`} />}
                <Row label="Debía haber" value={soles(c.expected_cents)} strong />
                {!c.open && <Row label="Contado" value={soles(c.counted_cents)} strong />}
              </div>
              {c.open ? (
                <div className="mt-3 flex flex-col gap-3 rounded-xl bg-field p-4 sm:flex-row sm:items-center">
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px]"><LockOpen size={17} strokeWidth={1.75} className="shrink-0" /> La caja sigue abierta. Cuenta el efectivo para ver si cuadra.</span>
                  <Btn className="min-h-11 shrink-0" onClick={() => { haptic.tap(); onCloseCash(); }}><Lock size={16} strokeWidth={1.75} /> Cerrar caja</Btn>
                </div>
              ) : (
                <div className="mt-3"><DiffPill diff={diff} large /></div>
              )}
            </>
          )}
        </section>
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Por barbero</h2>
          {staff.length > 0 && <span className="text-[13px] text-soft">A entregar es comisión más propinas</span>}
        </div>
        {staff.length === 0 ? (
          <p className="mt-3 text-[15px] text-mute">Nadie cobró servicios este día.</p>
        ) : (
          <>
            {/* Teléfono: una fila por barbero */}
            <ul className="mt-2 divide-y divide-line border-y border-line md:hidden">
              {staff.map((s) => (
                <li key={s.staff_id} className="py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: staffColor(staffIdx(s.staff_id)) }} aria-hidden />
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="tnum shrink-0 text-[13px] text-soft">{s.clientes} {s.clientes === 1 ? 'cliente' : 'clientes'}</span>
                    </span>
                    <span className="shrink-0 rounded-lg bg-field px-3 py-1.5 text-right">
                      <span className="block text-[12px] text-mute">A entregar</span>
                      <span className="tnum block text-[17px] font-semibold leading-tight">{soles(s.a_entregar_cents)}</span>
                    </span>
                  </div>
                  <div className="tnum mt-2 grid grid-cols-3 gap-2 text-[13px]">
                    <span className="min-w-0"><span className="block text-soft">Servicios</span><span className="block truncate">{soles(s.servicios_cents + s.productos_cents)}</span></span>
                    <span className="min-w-0"><span className="block text-soft">Comisión</span><span className="block truncate">{soles(s.comision_cents)}</span></span>
                    <span className="min-w-0"><span className="block text-soft">Propinas</span><span className="block truncate">{soles(s.tips_cents)}</span></span>
                  </div>
                </li>
              ))}
              {staff.length > 1 && (
                <li className="flex items-baseline justify-between gap-3 py-3 font-semibold">
                  <span>Total a entregar</span>
                  <span className="tnum">{soles(sum('a_entregar_cents'))}</span>
                </li>
              )}
            </ul>

            {/* Tableta y escritorio: tabla */}
            <table className="mt-2 hidden w-full text-left text-[15px] md:table">
              <thead>
                <tr className="border-b border-ink text-[13px] text-mute">
                  <th className="py-2.5 pr-3 font-medium">Barbero</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Clientes</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Servicios</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Productos</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Comisión</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Propinas</th>
                  <th className="bg-field px-3 py-2.5 text-right font-medium text-ink">A entregar</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.staff_id} className="border-b border-line">
                    <td className="py-3 pr-3 font-medium">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: staffColor(staffIdx(s.staff_id)) }} aria-hidden />{s.name}</span>
                    </td>
                    <td className="tnum py-3 pr-3 text-right">{s.clientes}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(s.servicios_cents)}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(s.productos_cents)}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(s.comision_cents)}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(s.tips_cents)}</td>
                    <td className="tnum bg-field px-3 py-3 text-right text-[16px] font-semibold">{soles(s.a_entregar_cents)}</td>
                  </tr>
                ))}
              </tbody>
              {staff.length > 1 && (
                <tfoot>
                  <tr className="font-semibold">
                    <td className="py-3 pr-3">Total</td>
                    <td className="tnum py-3 pr-3 text-right">{sum('clientes')}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(sum('servicios_cents'))}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(sum('productos_cents'))}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(sum('comision_cents'))}</td>
                    <td className="tnum py-3 pr-3 text-right">{soles(sum('tips_cents'))}</td>
                    <td className="tnum bg-field px-3 py-3 text-right text-[16px]">{soles(sum('a_entregar_cents'))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Citas</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Completadas" value={r.appointments.completed} />
            <MiniStat label="No vino" value={r.appointments.no_show} />
            <MiniStat label="Canceladas" value={r.appointments.cancelled} />
          </div>
          {r.appointments.pending > 0 && (
            <p className="mt-2 text-[13px] text-soft">{r.appointments.pending} {r.appointments.pending === 1 ? 'cita sigue pendiente o sin marcar' : 'citas siguen pendientes o sin marcar'}.</p>
          )}
          <h2 className="mt-8 text-[17px] font-semibold tracking-[-0.02em]">Fila</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Atendidos" value={r.queue.atendidos} />
            <MiniStat label="No vinieron" value={r.queue.no_vinieron} />
            <MiniStat label="Espera promedio" value={`${r.queue.espera_promedio_min} min`} />
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Gastos del día</h2>
            <span className="tnum text-[17px] font-semibold">{soles(r.expenses_cents)}</span>
          </div>
          <a href="#finanzas" className="mt-1 inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-mute hover:text-ink">Ver gastos en Finanzas <ChevronRight size={15} strokeWidth={1.75} /></a>
          <h2 className="mt-6 text-[17px] font-semibold tracking-[-0.02em]">Más pedidos</h2>
          {r.topServices.length === 0 ? (
            <p className="mt-3 text-[15px] text-mute">Aún no hay servicios cobrados.</p>
          ) : (
            <ol className="mt-2 divide-y divide-line border-y border-line">
              {r.topServices.map((s, i) => (
                <li key={s.name} className="flex min-h-12 items-center gap-3 py-2 text-[15px]">
                  <span className="tnum w-5 shrink-0 text-[13px] text-soft">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{s.name} <span className="tnum text-[13px] text-soft">{s.n} {s.n === 1 ? 'vez' : 'veces'}</span></span>
                  <span className="tnum shrink-0 font-medium">{soles(s.cents)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ExpressSheet
        api={api}
        state={state}
        services={catalog?.services ?? []}
        overrides={overrides}
        target={express}
        onClose={() => setExpress(null)}
        onDone={(id) => { setCharged((p) => new Set(p).add(id)); onChanged(); }}
      />
    </div>
  );
}
