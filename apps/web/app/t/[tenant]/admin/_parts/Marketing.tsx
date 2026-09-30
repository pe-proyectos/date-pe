'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Megaphone, Users, UserRoundX, Sparkles, Scissors, UserRound, Tag, Crown, ArrowLeft, Send, Eye, Copy, CircleCheck, Cake, HeartHandshake, BadgePercent,
  CalendarClock, Settings2, Mail, Loader2, TicketPercent, Plus, Info,
} from 'lucide-react';
import { useApi, useAdmin } from './api';
import { PageHead, Btn, Switch, Field, inputCls, Empty, Skeleton } from './ui';
import { Sheet } from '@/components/Sheet';
import { API_BASE_CLIENT } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

type SegType = 'all' | 'inactive' | 'new' | 'service' | 'staff' | 'tag' | 'vip';
interface Segment { type: SegType; days?: number; serviceId?: string; staffId?: string; tag?: string }
interface Campaign { id: string; name: string; segment: Segment | string | null; subject: string; promo_code: string | null; status: string; sent_count: number | null; sent_at: string | null; created_at: string }
interface MarketingCfg { birthdayEnabled: boolean; birthdayDiscountPercent: number; winbackEnabled: boolean; winbackDays: number; winbackDiscountPercent: number; membershipRenewReminder: boolean }
interface Draft { name: string; segment: Segment; subject: string; body: string; discountOn: boolean; discount: string; validDays: string }

const SEGMENTS: Array<{ type: SegType; title: string; body: string; icon: typeof Users }> = [
  { type: 'all', title: 'Todos', body: 'Todos tus clientes con correo', icon: Users },
  { type: 'inactive', title: 'No vuelven', body: 'Hace más de N días sin venir', icon: UserRoundX },
  { type: 'new', title: 'Nuevos', body: 'Llegaron hace poco', icon: Sparkles },
  { type: 'service', title: 'Por servicio', body: 'Se hicieron un servicio', icon: Scissors },
  { type: 'staff', title: 'Por barbero', body: 'Los atendió un barbero', icon: UserRound },
  { type: 'tag', title: 'Etiqueta', body: 'Con una etiqueta de su ficha', icon: Tag },
  { type: 'vip', title: 'VIP', body: '5 visitas o más', icon: Crown },
];

const TEMPLATES: Array<{ id: string; title: string; hint: string; icon: typeof Users; draft: (shop: string) => Omit<Draft, 'segment'> & { segment: Segment } }> = [
  {
    id: 'extranamos',
    title: 'Te extrañamos',
    hint: 'Para quienes no vuelven hace 45 días',
    icon: HeartHandshake,
    draft: () => ({
      name: 'Te extrañamos',
      segment: { type: 'inactive', days: 45 },
      subject: '{nombre}, te extrañamos',
      body: 'Hola {nombre}, hace tiempo que no te vemos por aquí. Para tu próximo corte te dejamos un descuento especial. Reserva en un minuto y elige a tu barbero de siempre.',
      discountOn: true, discount: '15', validDays: '15',
    }),
  },
  {
    id: 'nuevo',
    title: 'Nuevo servicio',
    hint: 'Cuenta lo que estrenas',
    icon: Sparkles,
    draft: () => ({
      name: 'Nuevo servicio',
      segment: { type: 'all' },
      subject: 'Tenemos algo nuevo para ti, {nombre}',
      body: 'Hola {nombre}, estrenamos un servicio y queremos que seas de los primeros en probarlo. Cuéntales aquí de qué se trata y cuánto cuesta. Ya puedes reservarlo desde nuestra página.',
      discountOn: false, discount: '10', validDays: '15',
    }),
  },
  {
    id: 'promo',
    title: 'Promo del mes',
    hint: 'Un descuento para todos',
    icon: BadgePercent,
    draft: (shop) => ({
      name: 'Promo del mes',
      segment: { type: 'all' },
      subject: `Promo del mes en ${shop}`,
      body: 'Hola {nombre}, este mes tu corte tiene descuento. Usa el código al reservar y listo. Es por tiempo limitado, así que separa tu hora.',
      discountOn: true, discount: '20', validDays: '30',
    }),
  },
  {
    id: 'padre',
    title: 'Día del padre',
    hint: 'Tercer domingo de junio',
    icon: Cake,
    draft: () => ({
      name: 'Día del padre',
      segment: { type: 'all' },
      subject: 'Este Día del Padre, un corte para papá',
      body: 'Hola {nombre}, este Día del Padre regálale a papá un corte y una barba. Reserven juntos o regálale una gift card desde nuestra página. Tienen un descuento para los dos.',
      discountOn: true, discount: '10', validDays: '10',
    }),
  },
];

const segLabel = (s: Segment | string | null, names: { services: Map<string, string>; staff: Map<string, string> }) => {
  let seg: Segment | null = null;
  try { seg = typeof s === 'string' ? JSON.parse(s) : s; } catch { seg = null; }
  if (!seg) return 'Clientes';
  switch (seg.type) {
    case 'inactive': return `No vuelven hace ${seg.days ?? 45} días`;
    case 'new': return `Nuevos de ${seg.days ?? 30} días`;
    case 'service': return `Se hicieron ${names.services.get(seg.serviceId ?? '') ?? 'un servicio'}`;
    case 'staff': return `Atendidos por ${names.staff.get(seg.staffId ?? '') ?? 'un barbero'}`;
    case 'tag': return `Etiqueta ${seg.tag ?? ''}`;
    case 'vip': return 'VIP, 5 visitas o más';
    default: return 'Todos';
  }
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const codePrefix = (name: string) => name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) || 'PROMO';
const blankDraft = (): Draft => ({ name: '', segment: { type: 'all' }, subject: '', body: '', discountOn: false, discount: '15', validDays: '15' });

export function Marketing() {
  const api = useApi();
  const { tenant } = useAdmin();
  const [shop, setShop] = useState(tenant);
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [cfg, setCfg] = useState<{ marketing: MarketingCfg; on: boolean } | null>(null);
  const [history, setHistory] = useState<Campaign[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const loadHistory = useCallback(() => api<{ campaigns: Campaign[] }>('/admin/campaigns').then((d) => setHistory(d.campaigns)).catch(() => setHistory([])), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadHistory();
    api<{ services: Array<{ id: string; name: string; is_active: boolean; is_addon: boolean }> }>('/admin/services').then((d) => setServices(d.services.filter((s) => s.is_active && !s.is_addon))).catch(() => {});
    api<{ staff: Array<{ id: string; name: string }> }>('/admin/staff').then((d) => setStaff(d.staff)).catch(() => {});
    api<{ features: Record<string, boolean>; marketing: MarketingCfg }>('/admin/features').then((d) => setCfg({ marketing: d.marketing, on: d.features?.marketing !== false })).catch(() => {});
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.tenant?.name && setShop(d.tenant.name))
      .catch(() => {});
  }, [tenant, loadHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Campañas enviándose: refresca el conteo cada 15 segundos
  useEffect(() => {
    if (!history?.some((c) => c.status === 'sending')) return;
    const t = setInterval(loadHistory, 15_000);
    return () => clearInterval(t);
  }, [history, loadHistory]);

  const names = useMemo(() => ({ services: new Map(services.map((s) => [s.id, s.name])), staff: new Map(staff.map((s) => [s.id, s.name])) }), [services, staff]);

  if (draft) {
    return (
      <Builder
        initial={draft}
        shop={shop}
        services={services}
        staff={staff}
        segLabel={(s) => segLabel(s, names)}
        onClose={(sent) => { setDraft(null); window.scrollTo({ top: 0 }); if (sent) loadHistory(); }}
      />
    );
  }

  return (
    <>
      <PageHead
        title="Marketing"
        sub="Correos para que tus clientes vuelvan. Solo llegan a quienes dejaron su correo y aceptaron recibir novedades."
        actions={<Btn onClick={() => { haptic.tap(); setDraft(blankDraft()); }}><Plus size={16} strokeWidth={2} /> Nueva campaña</Btn>}
      />

      {cfg && !cfg.on && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-field p-4 text-[14px]">
          <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <p>Marketing está apagado en tus funciones. <a href="#funciones" className="font-medium underline">Actívalo en Funciones</a> para enviar campañas y avisos automáticos.</p>
        </div>
      )}

      {/* Plantillas */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Empieza con una plantilla</h2>
        <p className="mt-0.5 text-[14px] text-mute">Un toque y ya tienes el texto listo. Lo cambias como quieras antes de enviar.</p>
        <div className="no-scrollbar -mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { haptic.tap(); setDraft(t.draft(shop)); }}
              className="group flex w-[62%] shrink-0 flex-col items-start rounded-xl border border-line p-4 text-left transition-colors hover:border-ink sm:w-[40%] md:w-auto"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-field"><t.icon size={18} strokeWidth={1.75} /></span>
              <span className="mt-3 text-[15px] font-medium">{t.title}</span>
              <span className="text-[13px] text-mute">{t.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Automáticas */}
      <section className="mt-10 rounded-xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Automáticas</h2>
            <p className="text-[14px] text-mute">Salen solas, sin que hagas nada.</p>
          </div>
          <a href="#funciones" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink">
            <Settings2 size={16} strokeWidth={1.75} /> Cambiar
          </a>
        </div>
        {!cfg ? (
          <div className="p-5"><Skeleton rows={3} /></div>
        ) : (
          <ul className="divide-y divide-line">
            <AutoRow
              icon={Cake}
              title="Cumpleaños"
              on={cfg.marketing.birthdayEnabled}
              body={`El día de su cumpleaños le llega un saludo con ${cfg.marketing.birthdayDiscountPercent}% de descuento.`}
            />
            <AutoRow
              icon={HeartHandshake}
              title="Te extrañamos"
              on={cfg.marketing.winbackEnabled}
              body={`A los ${cfg.marketing.winbackDays} días sin venir le escribimos con ${cfg.marketing.winbackDiscountPercent}% de descuento.`}
            />
            <AutoRow
              icon={CalendarClock}
              title="Renovación de membresía"
              on={cfg.marketing.membershipRenewReminder}
              body="Le avisamos unos días antes de que venza su membresía."
            />
          </ul>
        )}
      </section>

      {/* Historial */}
      <section className="mt-10">
        <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">Campañas enviadas</h2>
        {!history ? <Skeleton rows={3} /> : history.length === 0 ? (
          <Empty icon={Megaphone} title="Todavía no envías campañas" body="Empieza con Te extrañamos: es la que más clientes trae de vuelta." action={<Btn onClick={() => setDraft(TEMPLATES[0].draft(shop))}>Usar Te extrañamos</Btn>} />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {history.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field"><Mail size={17} strokeWidth={1.75} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{c.name}</div>
                  <div className="truncate text-[13px] text-mute">{segLabel(c.segment, names)}, {fmtDate(c.sent_at ?? c.created_at)}</div>
                </div>
                {c.promo_code && (
                  <button type="button" onClick={() => { navigator.clipboard.writeText(c.promo_code as string); toast.success(`${c.promo_code} copiado`); }} className="flex items-center gap-1.5 rounded-lg bg-field px-2.5 py-1 font-mono text-[13px] font-medium hover:bg-line">
                    {c.promo_code} <Copy size={12} strokeWidth={1.75} className="text-mute" />
                  </button>
                )}
                {c.status === 'sending' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff4e0] px-2.5 py-1 text-[12px] font-medium text-[#8a5300]"><Loader2 size={12} className="animate-spin" /> Enviando</span>
                ) : (
                  <span className="tnum rounded-full bg-ok-tint px-2.5 py-1 text-[12px] font-medium text-ok">{c.sent_count ?? 0} {c.sent_count === 1 ? 'enviado' : 'enviados'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AutoRow({ icon: Icon, title, body, on }: { icon: typeof Users; title: string; body: string; on: boolean }) {
  return (
    <li className={`flex items-start gap-3 px-5 py-4 ${on ? '' : 'opacity-60'}`}>
      <Icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mute" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">{title}</div>
        <div className="text-[14px] text-mute">{body}</div>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${on ? 'bg-ok-tint text-ok' : 'bg-field text-mute'}`}>{on ? 'Activo' : 'Apagado'}</span>
    </li>
  );
}

// ------------------------------ Armado de campaña ------------------------------
function Builder({
  initial, shop, services, staff, segLabel, onClose,
}: {
  initial: Draft; shop: string; services: Array<{ id: string; name: string }>; staff: Array<{ id: string; name: string }>;
  segLabel: (s: Segment) => string; onClose: (sent: boolean) => void;
}) {
  const api = useApi();
  const [d, setD] = useState<Draft>(initial);
  const [count, setCount] = useState<{ n: number; sample: string[] } | null>(null);
  const [counting, setCounting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ recipients: number; code: string | null } | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);

  // El segmento necesita su dato (servicio, barbero, etiqueta) antes de contar
  const seg = d.segment;
  const segReady = (seg.type !== 'service' || !!seg.serviceId) && (seg.type !== 'staff' || !!seg.staffId) && (seg.type !== 'tag' || !!seg.tag?.trim());
  const segKey = JSON.stringify(seg);

  // Conteo en vivo de destinatarios (con espera para no pedir en cada tecla)
  useEffect(() => {
    if (!segReady) { setCount(null); return; }
    const my = ++seq.current;
    setCounting(true);
    const t = setTimeout(() => {
      const body: Segment = { type: seg.type, ...(seg.days ? { days: seg.days } : {}), ...(seg.serviceId ? { serviceId: seg.serviceId } : {}), ...(seg.staffId ? { staffId: seg.staffId } : {}), ...(seg.tag?.trim() ? { tag: seg.tag.trim() } : {}) };
      api<{ count: number; sample: Array<string | null> }>('/admin/campaigns/preview', { method: 'POST', body })
        .then((r) => { if (my === seq.current) setCount({ n: r.count, sample: r.sample.filter((x): x is string => !!x) }); })
        .catch(() => { if (my === seq.current) setCount(null); })
        .finally(() => { if (my === seq.current) setCounting(false); });
    }, 450);
    return () => clearTimeout(t);
  }, [segKey, segReady]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickSegment(type: SegType) {
    haptic.select();
    const next: Segment = { type };
    if (type === 'inactive') next.days = 45;
    if (type === 'new') next.days = 30;
    if (type === 'service') next.serviceId = services[0]?.id;
    if (type === 'staff') next.staffId = staff[0]?.id;
    if (type === 'tag') next.tag = '';
    setD({ ...d, segment: next });
  }

  function insertName(field: 'subject' | 'body') {
    haptic.tap();
    const el = field === 'subject' ? subjectRef.current : bodyRef.current;
    const value = d[field];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const token = '{nombre}';
    const next = value.slice(0, start) + token + value.slice(end);
    setD({ ...d, [field]: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const pct = Math.max(0, Math.min(100, Number(d.discount) || 0));
  const valid = Math.max(1, Math.min(90, Number(d.validDays) || 15));
  const discountOk = !d.discountOn || (pct >= 1 && pct <= 100);
  const ready = !!d.name.trim() && !!d.subject.trim() && !!d.body.trim() && segReady && discountOk && (count?.n ?? 0) > 0;
  const sampleName = (count?.sample[0] ?? '').split(' ')[0] || 'Carlos';

  async function send() {
    setBusy(true);
    try {
      const r = await api<{ recipients: number; promoCode: string | null }>('/admin/campaigns/send', {
        method: 'POST',
        body: {
          name: d.name.trim(),
          segment: { type: seg.type, ...(seg.days ? { days: seg.days } : {}), ...(seg.serviceId ? { serviceId: seg.serviceId } : {}), ...(seg.staffId ? { staffId: seg.staffId } : {}), ...(seg.tag?.trim() ? { tag: seg.tag.trim() } : {}) },
          subject: d.subject.trim(),
          body: d.body.trim(),
          ...(d.discountOn ? { discountPercent: pct, validDays: valid } : {}),
        },
      });
      setConfirmOpen(false);
      setSent({ recipients: r.recipients, code: r.promoCode });
      haptic.success();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error((e as Error).message === 'segmento_vacio' ? 'Nadie en ese grupo puede recibir correos.' : 'No pudimos enviar la campaña. Revisa los datos.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rise-in mx-auto max-w-lg py-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok-tint text-ok"><CircleCheck size={28} strokeWidth={1.75} /></span>
        <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.035em]">Tu campaña está saliendo</h1>
        <p className="mt-2 text-[15px] text-mute">
          Enviamos &quot;{d.name.trim()}&quot; a {sent.recipients} {sent.recipients === 1 ? 'cliente' : 'clientes'}. Los correos salen de a poco en los próximos minutos para que no lleguen a spam.
        </p>
        {sent.code && (
          <div className="mx-auto mt-6 max-w-xs rounded-xl border border-line p-4">
            <div className="text-[13px] text-mute">Código de la campaña, {pct}% por {valid} días</div>
            <button type="button" onClick={() => { navigator.clipboard.writeText(sent.code as string); toast.success(`${sent.code} copiado`); }} className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-field px-4 font-mono text-[18px] font-semibold hover:bg-line">
              {sent.code} <Copy size={15} strokeWidth={1.75} className="text-mute" />
            </button>
            <p className="mt-2 text-[13px] text-soft">Ya está en Promociones, Códigos. El botón del correo lo aplica solo al reservar.</p>
          </div>
        )}
        <Btn className="mt-8" onClick={() => onClose(true)}>Volver a Marketing</Btn>
      </div>
    );
  }

  const preview = <EmailPreview shop={shop} subject={d.subject} body={d.body} name={sampleName} code={d.discountOn ? `${codePrefix(d.name)}XX` : null} pct={pct} />;

  return (
    <>
      <button type="button" onClick={() => onClose(false)} className="-ml-2 mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 text-[15px] text-mute hover:text-ink">
        <ArrowLeft size={17} strokeWidth={1.75} /> Marketing
      </button>
      <PageHead title="Nueva campaña" sub="Arma el correo, mira cómo llega y envíalo." />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-10">
          <Field label="Nombre de la campaña" hint="Solo lo ves tú. También arma el código de descuento.">
            <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={inputCls} placeholder="Te extrañamos octubre" maxLength={80} />
          </Field>

          {/* Segmento */}
          <section>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">A quién</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {SEGMENTS.map((s) => {
                const on = seg.type === s.type;
                return (
                  <button
                    key={s.type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickSegment(s.type)}
                    className={`flex min-h-[92px] flex-col items-start rounded-xl border p-3.5 text-left transition-all ${on ? '-translate-y-0.5 border-ink bg-ink text-white shadow-lift' : 'border-line hover:border-ink'}`}
                  >
                    <s.icon size={18} strokeWidth={1.75} />
                    <span className="mt-2 text-[15px] font-medium">{s.title}</span>
                    <span className={`text-[12px] leading-snug ${on ? 'text-white/70' : 'text-mute'}`}>{s.body}</span>
                  </button>
                );
              })}
            </div>

            {(seg.type === 'inactive' || seg.type === 'new') && (
              <div className="rise-in mt-4">
                <span className="mb-1.5 block text-[14px] font-medium">{seg.type === 'inactive' ? 'Días sin venir' : 'Llegaron en los últimos'}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {(seg.type === 'inactive' ? [30, 45, 60, 90] : [7, 30, 90]).map((n) => (
                    <button key={n} type="button" aria-pressed={seg.days === n} onClick={() => { haptic.select(); setD({ ...d, segment: { ...seg, days: n } }); }} className={`tnum min-h-[44px] rounded-full px-4 text-[15px] ${seg.days === n ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>
                      {n} días
                    </button>
                  ))}
                  <input
                    inputMode="numeric"
                    aria-label="Otro número de días"
                    value={seg.days ?? ''}
                    onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '').slice(0, 3)); setD({ ...d, segment: { ...seg, days: n ? Math.min(730, n) : undefined } }); }}
                    className={`tnum w-24 ${inputCls}`}
                  />
                </div>
              </div>
            )}
            {seg.type === 'service' && (
              <div className="rise-in mt-4 max-w-sm">
                <Field label="Servicio">
                  <select value={seg.serviceId ?? ''} onChange={(e) => setD({ ...d, segment: { ...seg, serviceId: e.target.value } })} className={inputCls}>
                    {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {seg.type === 'staff' && (
              <div className="rise-in mt-4 max-w-sm">
                <Field label="Barbero">
                  <select value={seg.staffId ?? ''} onChange={(e) => setD({ ...d, segment: { ...seg, staffId: e.target.value } })} className={inputCls}>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {seg.type === 'tag' && (
              <div className="rise-in mt-4 max-w-sm">
                <Field label="Etiqueta" hint="Tal como la escribiste en la ficha del cliente.">
                  <input value={seg.tag ?? ''} onChange={(e) => setD({ ...d, segment: { ...seg, tag: e.target.value.slice(0, 30) } })} className={inputCls} placeholder="frecuente" />
                </Field>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3 rounded-xl bg-field p-4" aria-live="polite">
              <Users size={18} strokeWidth={1.75} className="shrink-0" />
              <div className="min-w-0 flex-1 text-[15px]">
                {!segReady ? (
                  <span className="text-mute">Completa el dato del grupo para ver cuántos son.</span>
                ) : counting && !count ? (
                  <span className="text-mute">Contando clientes...</span>
                ) : count ? (
                  <>
                    <span className="tnum font-semibold">{count.n} {count.n === 1 ? 'cliente' : 'clientes'}</span>
                    <span className="text-mute"> {count.n === 0 ? 'en este grupo pueden recibir correos.' : count.sample.length ? `, como ${count.sample.slice(0, 3).map((x) => x.split(' ')[0]).join(', ')}${count.n > 3 ? ' y más' : ''}.` : '.'}</span>
                  </>
                ) : (
                  <span className="text-mute">No pudimos contar. Intenta de nuevo.</span>
                )}
              </div>
              {counting && count && <Loader2 size={16} className="shrink-0 animate-spin text-mute" />}
            </div>
            <p className="mt-2 text-[13px] text-soft">Cuentan solo los clientes con correo que aceptaron recibir novedades y no están bloqueados.</p>
          </section>

          {/* Mensaje */}
          <section className="space-y-4">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Mensaje</h2>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="mk-subject" className="text-[14px] font-medium">Asunto</label>
                <button type="button" onClick={() => insertName('subject')} className="min-h-[36px] rounded-full bg-field px-3 text-[13px] font-medium hover:bg-line">Insertar {'{nombre}'}</button>
              </div>
              <input id="mk-subject" ref={subjectRef} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value.slice(0, 120) })} className={inputCls} placeholder="{nombre}, te extrañamos" />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="mk-body" className="text-[14px] font-medium">Texto</label>
                <button type="button" onClick={() => insertName('body')} className="min-h-[36px] rounded-full bg-field px-3 text-[13px] font-medium hover:bg-line">Insertar {'{nombre}'}</button>
              </div>
              <textarea id="mk-body" ref={bodyRef} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value.slice(0, 3000) })} rows={6} className={`resize-y ${inputCls}`} placeholder="Hola {nombre}, ..." />
              <span className="mt-1 flex justify-between gap-3 text-[13px] text-soft">
                <span>{'{nombre}'} se cambia por el primer nombre de cada cliente. El texto llega como un solo párrafo.</span>
                <span className="tnum shrink-0">{d.body.length}/3000</span>
              </span>
            </div>
          </section>

          {/* Descuento */}
          <section className="rounded-xl border border-line p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[15px] font-medium"><TicketPercent size={17} strokeWidth={1.75} /> Código de descuento automático</div>
                <p className="mt-0.5 text-[14px] text-mute">Creamos el código, lo ponemos en el correo y el botón de reservar ya lo trae aplicado.</p>
              </div>
              <Switch checked={d.discountOn} onChange={(v) => setD({ ...d, discountOn: v })} label="Código de descuento automático" />
            </div>
            {d.discountOn && (
              <div className="rise-in mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-[14px] font-medium">Descuento</span>
                  <div className="flex flex-wrap gap-2">
                    {['10', '15', '20', '25'].map((v) => (
                      <button key={v} type="button" aria-pressed={d.discount === v} onClick={() => { haptic.select(); setD({ ...d, discount: v }); }} className={`tnum min-h-[44px] rounded-full px-4 text-[15px] ${d.discount === v ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>{v}%</button>
                    ))}
                    <input inputMode="numeric" aria-label="Otro porcentaje" value={d.discount} onChange={(e) => setD({ ...d, discount: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={`tnum w-20 ${inputCls}`} />
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-[14px] font-medium">Vale por</span>
                  <div className="flex flex-wrap gap-2">
                    {['7', '15', '30'].map((v) => (
                      <button key={v} type="button" aria-pressed={d.validDays === v} onClick={() => { haptic.select(); setD({ ...d, validDays: v }); }} className={`tnum min-h-[44px] rounded-full px-4 text-[15px] ${d.validDays === v ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>{v} días</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-6">
            <Btn className="lg:hidden" variant="secondary" onClick={() => setPreviewOpen(true)}><Eye size={16} strokeWidth={1.75} /> Ver cómo llega</Btn>
            <Btn className="ml-auto" disabled={!ready} onClick={() => { haptic.tap(); setConfirmOpen(true); }}>
              <Send size={16} strokeWidth={1.75} /> Revisar y enviar
            </Btn>
          </div>
          {!ready && (
            <p className="-mt-6 text-right text-[13px] text-soft">
              {!d.name.trim() ? 'Ponle un nombre a la campaña.' : !d.subject.trim() ? 'Falta el asunto.' : !d.body.trim() ? 'Falta el texto.' : !discountOk ? 'Revisa el descuento.' : count && count.n === 0 ? 'Elige un grupo con clientes.' : ''}
            </p>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-mute"><Eye size={15} strokeWidth={1.75} /> Así lo ve {sampleName}</div>
            {preview}
          </div>
        </aside>
      </div>

      <Sheet open={previewOpen} onClose={() => setPreviewOpen(false)} title={`Así lo ve ${sampleName}`}>
        <div className="-mx-5 -my-5 md:-mx-6 md:-my-6">{preview}</div>
      </Sheet>

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Enviar campaña"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Btn>
            <Btn onClick={send} busy={busy}><Send size={16} strokeWidth={1.75} /> Enviar ahora</Btn>
          </>
        }
      >
        <p className="text-[21px] font-semibold leading-snug tracking-[-0.025em]">
          Se enviará a <span className="tnum">{count?.n ?? 0}</span> {count?.n === 1 ? 'cliente' : 'clientes'}.
        </p>
        <dl className="mt-5 divide-y divide-line border-y border-line text-[15px]">
          <div className="flex justify-between gap-4 py-3"><dt className="text-mute">Grupo</dt><dd className="text-right">{segLabel(seg)}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-mute">Asunto</dt><dd className="min-w-0 text-right">{d.subject.replace(/\{nombre\}/gi, sampleName)}</dd></div>
          {d.discountOn && <div className="flex justify-between gap-4 py-3"><dt className="text-mute">Descuento</dt><dd className="tnum text-right">{pct}% por {valid} días</dd></div>}
        </dl>
        <p className="mt-4 text-[14px] text-mute">Una vez enviada no se puede detener. Cada correo trae el enlace para darse de baja.</p>
      </Sheet>
    </>
  );
}

/** Réplica del correo que envía date.pe: tarjeta blanca sobre gris, botón negro y enlace de baja. */
function EmailPreview({ shop, subject, body, name, code, pct }: { shop: string; subject: string; body: string; name: string; code: string | null; pct: number }) {
  const fill = (t: string, fallback: string) => t.replace(/\{nombre\}/gi, name || fallback);
  const title = fill(subject, '') || 'Asunto del correo';
  const text = fill(body, 'hola') || 'Aquí va tu mensaje.';
  return (
    <div className="rounded-xl bg-[#f4f4f5] px-4 py-8" style={{ fontFamily: '-apple-system, Segoe UI, Helvetica, Arial, sans-serif' }}>
      <div className="mx-auto max-w-[480px] rounded-xl bg-white p-8">
        <p className="mb-1 text-[14px] text-[#5f5f66]">{shop}</p>
        <h1 className="mb-4 break-words text-[24px] font-bold leading-tight tracking-[-0.02em] text-[#0a0a0a]">{title}</h1>
        <p className="mb-5 break-words text-[15px] leading-[1.55] text-[#27272a]">{text}</p>
        {code && (
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border-b border-[#e6e6e9] py-2.5 text-[14px] text-[#5f5f66]">Tu código</td>
                <td className="border-b border-[#e6e6e9] py-2.5 text-right text-[14px] text-[#0a0a0a]">{code}</td>
              </tr>
              <tr>
                <td className="border-b border-[#e6e6e9] py-2.5 text-[14px] text-[#5f5f66]">Descuento</td>
                <td className="border-b border-[#e6e6e9] py-2.5 text-right text-[14px] text-[#0a0a0a]">{pct}%</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="mt-7">
          <span className="inline-block rounded-full bg-[#0a0a0a] px-[22px] py-[13px] text-[15px] font-semibold text-white">Reservar ahora</span>
        </p>
        <p className="mt-3.5 text-[14px]"><span className="text-[#0a0a0a] underline">No quiero recibir más correos</span></p>
        <p className="mt-7 text-[13px] text-[#71717a]">Recibes este correo porque eres cliente de {shop}.</p>
      </div>
      {code && <p className="mt-3 text-center text-[12px] text-[#71717a]">El código final se crea al enviar.</p>}
    </div>
  );
}
