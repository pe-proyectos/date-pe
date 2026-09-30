'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, TicketPercent, Gift, Crown, Copy, Trash2, Package, Trophy, ExternalLink, Info, Clock, Send, CalendarClock, Globe, Store } from 'lucide-react';
import { useApi, useAdmin, soles } from './api';
import { PageHead, Btn, Switch, Drawer, Field, inputCls, Empty, Skeleton } from './ui';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { tenantUrl } from '@/lib/config';

type Tab = 'codigos' | 'gift' | 'membresias' | 'paquetes' | 'premios';

interface Promo { id: string; code: string; kind: 'percent' | 'fixed'; value: number; active: boolean; expires_at: string | null; max_uses: number | null; used_count: number }
interface GiftCard { id: string; code: string; initial_cents: number; balance_cents: number; active: boolean; created_at: string }
interface Plan { id: string; name: string; description: string | null; price_cents: number; period: 'month' | 'year'; perks: string | null; active: boolean }
interface OnlineGift { id: string; code: string; initial_cents: number; balance_cents: number; active: boolean; source: 'online' | 'pos'; buyer_name: string | null; recipient_name: string | null; recipient_email: string | null; paid: boolean; deliver_at: string | null; delivered_at: string | null; created_at: string }
interface SoldMembership { id: string; name: string; starts_at: string; ends_at: string; client_name: string | null; client_phone: string | null; client_id: string }
interface Pack { id: string; name: string; description: string | null; price_cents: number; uses: number; service_ids: string[] | null; valid_days: number | null; sell_online: boolean; active: boolean; vendidos: number }
interface SoldPack { id: string; name: string; uses_total: number; uses_left: number; expires_at: string | null; created_at: string; client_name: string | null; client_phone: string | null }
type RewardKind = 'free_service' | 'discount_fixed' | 'discount_percent' | 'product';
interface Reward { id: string; name: string; points_cost: number; kind: RewardKind; value: number; ref_id: string | null; active: boolean; canjes: number }
interface Redemption { name: string; points: number; created_at: string; client_name: string | null }
interface Svc { id: string; name: string; price_cents: number; is_active: boolean; is_addon: boolean }
interface Product { id: string; name: string; price_cents: number; is_active: boolean }

export function Promociones() {
  const [tab, setTab] = useState<Tab>('codigos');
  return (
    <>
      <PageHead title="Promociones" sub="Códigos, gift cards, membresías, paquetes y premios por puntos para que tus clientes vuelvan." />
      <div className="no-scrollbar -mx-4 mb-8 flex gap-1 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-line)] md:mx-0 md:px-0" role="tablist">
        {([['codigos', 'Códigos', TicketPercent], ['gift', 'Gift cards', Gift], ['membresias', 'Membresías', Crown], ['paquetes', 'Paquetes', Package], ['premios', 'Premios', Trophy]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => { haptic.select(); setTab(id); }}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[15px] md:px-4 font-medium transition-colors ${tab === id ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-ink'}`}
          >
            <Icon size={16} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </div>
      {tab === 'codigos' && <Codigos />}
      {tab === 'gift' && <GiftCards />}
      {tab === 'membresias' && <Membresias />}
      {tab === 'paquetes' && <Paquetes />}
      {tab === 'premios' && <Premios />}
    </>
  );
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${text} copiado`);
}

function Codigos() {
  const api = useApi();
  const [list, setList] = useState<Promo[] | null>(null);
  const [draft, setDraft] = useState<{ code: string; kind: 'percent' | 'fixed'; value: string; maxUses: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ promotions: Promo[] }>('/admin/promotions').then((d) => setList(d.promotions)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const value = draft.kind === 'percent' ? Number(draft.value) : Math.round(Number(draft.value) * 100);
      await api('/admin/promotions', {
        method: 'POST',
        body: { code: draft.code || undefined, kind: draft.kind, value, maxUses: draft.maxUses ? Number(draft.maxUses) : null, expiresAt: draft.expiresAt || null },
      });
      toast.success('Código creado');
      setDraft(null);
      load();
    } catch (e) {
      toast.error((e as Error).message === 'codigo_en_uso' ? 'Ese código ya existe.' : 'Revisa los datos del código.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end"><Btn onClick={() => setDraft({ code: '', kind: 'percent', value: '10', maxUses: '', expiresAt: '' })}><Plus size={16} strokeWidth={2} /> Nuevo código</Btn></div>
      {!list ? <Skeleton /> : list.length === 0 ? (
        <Empty icon={TicketPercent} title="Sin códigos todavía" body="Crea uno para tu próxima publicación en Instagram. Tus clientes lo escriben al reservar." />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((p) => (
            <li key={p.id} className="py-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => copy(p.code)} className="tnum flex items-center gap-2 rounded-lg bg-field px-3 py-1.5 font-mono text-[14px] font-medium hover:bg-line" title="Copiar">
                  {p.code} <Copy size={13} strokeWidth={1.75} className="text-mute" />
                </button>
                <span className="hidden text-[15px] font-medium md:inline">{p.kind === 'percent' ? `${p.value}% de descuento` : `${soles(p.value)} de descuento`}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Switch checked={p.active} onChange={async (v) => { await api(`/admin/promotions/${p.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Código ${p.code}`} states={['Activo', 'Pausado']} />
                  <button type="button" onClick={async () => { if (confirm(`¿Eliminar ${p.code}?`)) { await api(`/admin/promotions/${p.id}`, { method: 'DELETE' }); load(); } }} className="flex h-10 w-10 items-center justify-center rounded-full text-mute hover:bg-field hover:text-red" aria-label={`Eliminar ${p.code}`}>
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[14px] text-mute">
                <span className="font-medium text-ink md:hidden">{p.kind === 'percent' ? `${p.value}% de descuento` : `${soles(p.value)} de descuento`}, </span>
                {p.used_count} {p.used_count === 1 ? 'uso' : 'usos'}{p.max_uses ? ` de ${p.max_uses}` : ''}
                {p.expires_at ? `, vence el ${new Date(p.expires_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Drawer open={!!draft} onClose={() => setDraft(null)} title="Nuevo código" footer={<><Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn><Btn onClick={save} busy={busy} disabled={!draft?.value}>Crear código</Btn></>}>
        {draft && (
          <div className="space-y-4">
            <Field label="Código" hint="Déjalo vacío y lo generamos. Solo letras, números y guiones.">
              <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} className={`font-mono uppercase ${inputCls}`} placeholder="VERANO" />
            </Field>
            <Field label="Tipo">
              <div className="grid grid-cols-2 gap-2">
                {([['percent', 'Porcentaje'], ['fixed', 'Monto fijo']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setDraft({ ...draft, kind: k })} className={`rounded-xl border py-2.5 text-[15px] ${draft.kind === k ? 'border-ink bg-field font-medium' : 'border-line'}`}>{l}</button>
                ))}
              </div>
            </Field>
            <Field label={draft.kind === 'percent' ? 'Descuento (%)' : 'Descuento (S/)'}>
              <input inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className={`tnum ${inputCls}`} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Usos máximos"><input inputMode="numeric" value={draft.maxUses} onChange={(e) => setDraft({ ...draft, maxUses: e.target.value.replace(/\D/g, '') })} className={`tnum ${inputCls}`} placeholder="Sin límite" /></Field>
              <Field label="Vence"><input type="date" value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} className={inputCls} /></Field>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

function GiftCards() {
  const api = useApi();
  const { tenant } = useAdmin();
  const features = useFeatures();
  const [list, setList] = useState<GiftCard[] | null>(null);
  const [sold, setSold] = useState<OnlineGift[] | null>(null);
  const storeUrl = tenantUrl(tenant, '/regalos');
  useEffect(() => { api<{ giftCards: OnlineGift[] }>('/admin/gift-cards/online').then((d) => setSold(d.giftCards)).catch(() => setSold([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [amount, setAmount] = useState('50');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ giftCards: GiftCard[] }>('/admin/gift-cards').then((d) => setList(d.giftCards)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    try {
      const g = await api<{ code: string }>('/admin/gift-cards', { method: 'POST', body: { amountCents: Math.round(Number(amount) * 100) } });
      toast.success(`Gift card ${g.code} creada`);
      load();
    } catch {
      toast.error('Monto entre S/ 5 y S/ 5000.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl bg-field p-5">
        <Field label="Monto de la gift card (S/)">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`tnum w-40 ${inputCls}`} />
        </Field>
        <Btn onClick={create} busy={busy}><Gift size={16} strokeWidth={1.75} /> Crear gift card</Btn>
        <p className="w-full text-[13px] text-mute">Véndela en el local y entrega el código. El cliente lo escribe al reservar y se descuenta del saldo.</p>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-line p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field"><Globe size={18} strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium">Tu tienda de regalos en línea</div>
          <div className="truncate text-[14px] text-mute">{storeUrl.replace(/^https?:\/\//, '')}</div>
        </div>
        <div className="flex gap-1">
          <Btn variant="secondary" onClick={() => copy(storeUrl)}><Copy size={15} strokeWidth={1.75} /> Copiar</Btn>
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[14px] font-medium hover:bg-field">
            Abrir <ExternalLink size={15} strokeWidth={1.75} />
          </a>
        </div>
        {features && !features.giftcards_online && (
          <p className="flex w-full items-start gap-2 text-[13px] text-mute">
            <Info size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            La venta en línea de gift cards está apagada. <a href="#funciones" className="font-medium text-ink underline">Actívala en Funciones</a>.
          </p>
        )}
      </div>

      <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">Vendidas en línea y en caja</h2>
      {!sold ? <Skeleton rows={2} /> : sold.length === 0 ? (
        <p className="mb-10 rounded-xl bg-field p-4 text-[14px] text-mute">Aún no hay ventas. Comparte el enlace de tu tienda en Instagram o por WhatsApp antes de fechas especiales.</p>
      ) : (
        <ul className="mb-10 divide-y divide-line border-y border-line">
          {sold.map((g) => {
            const scheduled = !g.delivered_at && g.deliver_at && new Date(g.deliver_at).getTime() > Date.now();
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <button type="button" onClick={() => copy(g.code)} className="flex items-center gap-2 rounded-lg bg-field px-3 py-1.5 font-mono text-[14px] font-medium hover:bg-line">
                  {g.code} <Copy size={13} strokeWidth={1.75} className="text-mute" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">
                    {g.source === 'pos' ? <Store size={14} strokeWidth={1.75} className="mr-1.5 inline text-mute" aria-label="En caja" /> : <Globe size={14} strokeWidth={1.75} className="mr-1.5 inline text-mute" aria-label="En línea" />}
                    <span className="font-medium">{g.recipient_name ?? 'Sin nombre'}</span>
                    {g.buyer_name && g.buyer_name !== g.recipient_name && <span className="text-mute">, regalo de {g.buyer_name}</span>}
                  </div>
                  <div className="tnum text-[13px] text-mute">
                    {soles(g.balance_cents)} de {soles(g.initial_cents)}, {fmtShort(g.created_at)}
                  </div>
                </div>
                {!g.paid ? (
                  <span className="rounded-full bg-field px-2.5 py-1 text-[12px] font-medium text-mute">Pago pendiente</span>
                ) : scheduled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4e0] px-2.5 py-1 text-[12px] font-medium text-[#8a5300]"><CalendarClock size={12} strokeWidth={2} /> Se envía el {fmtShort(g.deliver_at as string)}</span>
                ) : g.delivered_at ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2.5 py-1 text-[12px] font-medium text-ok"><Send size={12} strokeWidth={2} /> Entregada</span>
                ) : (
                  <span className="rounded-full bg-ok-tint px-2.5 py-1 text-[12px] font-medium text-ok">Pagada</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">Todas las gift cards</h2>
      {!list ? <Skeleton /> : list.length === 0 ? (
        <Empty icon={Gift} title="Sin gift cards" body="Son un buen regalo para el día del padre o fin de año." />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-4 py-4">
              <button type="button" onClick={() => copy(g.code)} className="flex items-center gap-2 rounded-lg bg-field px-3 py-1.5 font-mono text-[14px] font-medium hover:bg-line">
                {g.code} <Copy size={13} strokeWidth={1.75} className="text-mute" />
              </button>
              <span className="tnum text-[15px]"><span className="font-medium">{soles(g.balance_cents)}</span> <span className="text-mute">de {soles(g.initial_cents)}</span></span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-field">
                <div className="h-full rounded-full bg-ink" style={{ width: `${(g.balance_cents / g.initial_cents) * 100}%` }} />
              </div>
              <div className="ml-auto"><Switch checked={g.active} onChange={async (v) => { await api(`/admin/gift-cards/${g.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Gift card ${g.code}`} states={['Activa', 'Pausada']} /></div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Membresias() {
  const api = useApi();
  const [list, setList] = useState<Plan[] | null>(null);
  const [sold, setSold] = useState<SoldMembership[] | null>(null);
  useEffect(() => { api<{ memberships: SoldMembership[] }>('/admin/memberships/sold').then((d) => setSold(d.memberships)).catch(() => setSold([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<{ id?: string; name: string; description: string; price: string; period: 'month' | 'year'; perks: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ plans: Plan[] }>('/admin/memberships').then((d) => setList(d.plans)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const body = { name: draft.name.trim(), description: draft.description.trim() || null, priceCents: Math.round(Number(draft.price) * 100), period: draft.period, perks: draft.perks.split('\n').map((x) => x.trim()).filter(Boolean).join('|') || null };
    try {
      if (draft.id) await api(`/admin/memberships/${draft.id}`, { method: 'PATCH', body });
      else await api('/admin/memberships', { method: 'POST', body });
      toast.success('Membresía guardada. Ya aparece en tu página.');
      setDraft(null);
      load();
    } catch {
      toast.error('Revisa nombre y precio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end"><Btn onClick={() => setDraft({ name: '', description: '', price: '', period: 'month', perks: '' })}><Plus size={16} strokeWidth={2} /> Nueva membresía</Btn></div>
      {!list ? <Skeleton /> : list.length === 0 ? (
        <Empty icon={Crown} title="Sin membresías" body="Un plan mensual asegura ingresos fijos y clientes que vuelven cada dos semanas." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((p) => (
            <div key={p.id} className="rounded-xl border border-line p-5">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setDraft({ id: p.id, name: p.name, description: p.description ?? '', price: (p.price_cents / 100).toFixed(2), period: p.period, perks: (p.perks ?? '').split('|').join('\n') })} className="text-left">
                  <div className="text-[17px] font-medium">{p.name}</div>
                  <div className="tnum mt-1 text-[22px] font-semibold tracking-[-0.03em]">{soles(p.price_cents)} <span className="text-[14px] font-normal text-mute">al {p.period === 'year' ? 'año' : 'mes'}</span></div>
                </button>
                <Switch checked={p.active} onChange={async (v) => { await api(`/admin/memberships/${p.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Membresía ${p.name}`} states={['Activa', 'Pausada']} />
              </div>
              {p.perks && <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-mute">{p.perks.split('|').map((x) => <li key={x}>{x}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-[17px] font-semibold tracking-[-0.02em]">Clientes con membresía</h2>
      {!sold ? <Skeleton rows={2} /> : sold.length === 0 ? (
        <p className="rounded-xl bg-field p-4 text-[14px] text-mute">Todavía no vendes membresías. Se venden desde Caja y aquí verás cuándo vence cada una.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {sold.map((m) => {
            const days = Math.ceil((new Date(m.ends_at).getTime() - Date.now()) / 864e5);
            const soon = days <= 7;
            const phone = (m.client_phone ?? '').replace(/\D/g, '');
            const first = (m.client_name ?? '').split(' ')[0];
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{m.client_name ?? 'Cliente'}</div>
                  <div className="text-[13px] text-mute">{m.name}, desde el {fmtShort(m.starts_at)}</div>
                </div>
                <span className={`tnum rounded-full px-2.5 py-1 text-[12px] font-medium ${days < 0 ? 'bg-red-tint text-red-deep' : soon ? 'bg-[#fff4e0] text-[#8a5300]' : 'bg-ok-tint text-ok'}`}>
                  {days < 0 ? `Venció hace ${-days} ${days === -1 ? 'día' : 'días'}` : days === 0 ? 'Vence hoy' : soon ? `Vence en ${days} ${days === 1 ? 'día' : 'días'}` : `Activa hasta el ${fmtShort(m.ends_at)}`}
                </span>
                {soon && phone.length >= 9 && (
                  <a
                    href={`https://wa.me/${phone.length === 9 ? `51${phone}` : phone}?text=${encodeURIComponent(`Hola${first ? ` ${first}` : ''}, tu ${m.name} ${days < 0 ? 'venció' : 'está por vencer'}. ¿Te la renovamos en tu próxima visita?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[40px] items-center rounded-full border border-line px-3.5 text-[13px] font-medium hover:border-ink"
                  >
                    Recordar por WhatsApp
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar membresía' : 'Nueva membresía'}
        footer={
          <>
            {draft?.id && <Btn variant="danger" className="mr-auto" onClick={async () => { if (confirm('¿Eliminar esta membresía?')) { await api(`/admin/memberships/${draft.id}`, { method: 'DELETE' }); setDraft(null); load(); } }}><Trash2 size={16} strokeWidth={1.75} /> Eliminar</Btn>}
            <Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn>
            <Btn onClick={save} busy={busy} disabled={!draft?.name || !draft?.price}>Guardar</Btn>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Nombre"><input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder="Club mensual" /></Field>
            <Field label="Descripción"><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio (S/)"><input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className={`tnum ${inputCls}`} /></Field>
              <Field label="Cobro">
                <select value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value as 'month' | 'year' })} className={inputCls}>
                  <option value="month">Mensual</option>
                  <option value="year">Anual</option>
                </select>
              </Field>
            </div>
            <Field label="Beneficios" hint="Uno por línea."><textarea rows={4} value={draft.perks} onChange={(e) => setDraft({ ...draft, perks: e.target.value })} className={`resize-none ${inputCls}`} placeholder={'2 cortes al mes\n10% en productos'} /></Field>
          </div>
        )}
      </Drawer>
    </>
  );
}

const fmtShort = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' });
const toCents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);

/** Funciones activas de la barbería (para avisar si algo está apagado). */
function useFeatures() {
  const api = useApi();
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  useEffect(() => { api<{ features: Record<string, boolean> }>('/admin/features').then((d) => setFeatures(d.features)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return features;
}

function FeatureOff({ what }: { what: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl bg-field p-4 text-[14px]">
      <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <p>{what} está apagado, así que tus clientes no lo ven. <a href="#funciones" className="font-medium underline">Actívalo en Funciones</a>.</p>
    </div>
  );
}

function useCatalog() {
  const api = useApi();
  const [services, setServices] = useState<Svc[]>([]);
  useEffect(() => { api<{ services: Svc[] }>('/admin/services').then((d) => setServices(d.services.filter((x) => x.is_active && !x.is_addon))).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return services;
}

// ------------------------------ Paquetes ------------------------------
interface PackDraft { id?: string; name: string; description: string; price: string; uses: string; serviceIds: string[]; validDays: string; sellOnline: boolean; active: boolean }

function Paquetes() {
  const api = useApi();
  const { tenant } = useAdmin();
  const features = useFeatures();
  const services = useCatalog();
  const [list, setList] = useState<Pack[] | null>(null);
  const [sold, setSold] = useState<SoldPack[]>([]);
  const [draft, setDraft] = useState<PackDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ packages: Pack[]; sold: SoldPack[] }>('/admin/packages').then((d) => { setList(d.packages); setSold(d.sold); }).catch(() => setList([])), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const svcName = (ids: string[] | null) => (ids ?? []).map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(', ');

  // Precio normal con el servicio más barato que cubre, para mostrar el ahorro real
  const regular = (d: PackDraft) => {
    const pool = services.filter((s) => d.serviceIds.includes(s.id));
    if (!pool.length || !Number(d.uses)) return 0;
    return Math.min(...pool.map((s) => s.price_cents)) * Number(d.uses);
  };

  async function save() {
    if (!draft) return;
    setBusy(true);
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      priceCents: toCents(draft.price),
      uses: Number(draft.uses),
      serviceIds: draft.serviceIds,
      validDays: draft.validDays ? Number(draft.validDays) : undefined,
      sellOnline: draft.sellOnline,
      active: draft.active,
    };
    try {
      if (draft.id) await api(`/admin/packages/${draft.id}`, { method: 'PATCH', body });
      else await api('/admin/packages', { method: 'POST', body });
      toast.success(draft.sellOnline && draft.active ? 'Paquete guardado. Ya está en tu tienda de regalos.' : 'Paquete guardado');
      setDraft(null);
      load();
    } catch {
      toast.error('Revisa nombre, precio y usos (de 1 a 100).');
    } finally {
      setBusy(false);
    }
  }

  const blank = (): PackDraft => ({ name: '', description: '', price: '', uses: '5', serviceIds: services[0] ? [services[0].id] : [], validDays: '180', sellOnline: true, active: true });
  const edit = (p: Pack): PackDraft => ({ id: p.id, name: p.name, description: p.description ?? '', price: (p.price_cents / 100).toFixed(2), uses: String(p.uses), serviceIds: p.service_ids ?? [], validDays: p.valid_days ? String(p.valid_days) : '', sellOnline: p.sell_online, active: p.active });

  const reg = draft ? regular(draft) : 0;
  const price = draft ? toCents(draft.price) : 0;

  return (
    <>
      {features && !features.packages && <FeatureOff what="La venta de paquetes" />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-lg text-[14px] text-mute">Vende varios cortes por adelantado con un precio mejor. Se cobran en Caja o en tu <a href={tenantUrl(tenant, '/regalos')} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">tienda en línea</a>, y cada visita descuenta un uso.</p>
        <Btn onClick={() => setDraft(blank())}><Plus size={16} strokeWidth={2} /> Nuevo paquete</Btn>
      </div>
      {!list ? <Skeleton /> : list.length === 0 ? (
        <Empty icon={Package} title="Sin paquetes todavía" body="Prueba con 5 cortes al precio de 4. Tus clientes fijos lo agradecen y tú cobras por adelantado." action={<Btn onClick={() => setDraft(blank())}><Plus size={16} strokeWidth={2} /> Crear paquete</Btn>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((p) => (
            <div key={p.id} className={`rounded-xl border border-line p-5 ${p.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setDraft(edit(p))} className="min-w-0 text-left">
                  <div className="text-[17px] font-medium">{p.name}</div>
                  <div className="tnum mt-1 text-[22px] font-semibold tracking-[-0.03em]">{soles(p.price_cents)} <span className="text-[14px] font-normal text-mute">por {p.uses} {p.uses === 1 ? 'uso' : 'usos'}</span></div>
                </button>
                <Switch checked={p.active} onChange={async (v) => { await api(`/admin/packages/${p.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Paquete ${p.name}`} states={['Activo', 'Pausado']} />
              </div>
              <p className="mt-2 text-[14px] text-mute">{svcName(p.service_ids) || 'Cualquier servicio'}{p.valid_days ? `, vale ${p.valid_days} días` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-medium">
                <span className="tnum rounded-full bg-field px-2.5 py-1">{p.vendidos} {p.vendidos === 1 ? 'vendido' : 'vendidos'}</span>
                {p.sell_online && <span className="inline-flex items-center gap-1 rounded-full bg-field px-2.5 py-1"><Globe size={12} strokeWidth={2} /> En línea</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-10 text-[17px] font-semibold tracking-[-0.02em]">Paquetes vendidos con usos</h2>
      {sold.length === 0 ? (
        <p className="rounded-xl bg-field p-4 text-[14px] text-mute">Aquí verás a quién le quedan usos y cuándo vencen.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {sold.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{x.client_name ?? 'Cliente'}</div>
                <div className="text-[13px] text-mute">{x.name}{x.expires_at ? `, vence el ${fmtShort(x.expires_at)}` : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex w-28 gap-0.5" aria-hidden>
                  {Array.from({ length: Math.min(x.uses_total, 20) }, (_, i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i < x.uses_left ? 'bg-ink' : 'bg-field'}`} />
                  ))}
                </div>
                <span className="tnum w-20 text-right text-[14px]"><span className="font-medium">{x.uses_left}</span> <span className="text-mute">de {x.uses_total}</span></span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar paquete' : 'Nuevo paquete'}
        footer={<><Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn><Btn onClick={save} busy={busy} disabled={!draft?.name.trim() || !draft?.price || !Number(draft?.uses)}>Guardar</Btn></>}
      >
        {draft && (
          <div className="space-y-5">
            <Field label="Nombre"><input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder="5 cortes" maxLength={80} /></Field>
            <Field label="Descripción" hint="Se muestra en tu tienda en línea."><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputCls} placeholder="Paga 4 y el quinto va por la casa" maxLength={300} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio (S/)"><input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className={`tnum ${inputCls}`} placeholder="100" /></Field>
              <Field label="Usos"><input inputMode="numeric" value={draft.uses} onChange={(e) => setDraft({ ...draft, uses: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={`tnum ${inputCls}`} /></Field>
            </div>
            {reg > 0 && price > 0 && (
              <p className={`-mt-2 text-[13px] ${reg > price ? 'text-ok' : 'text-mute'}`}>
                Precio normal {soles(reg)}. {reg > price ? `Tu cliente ahorra ${soles(reg - price)}.` : 'Con este precio no hay ahorro para el cliente.'}
              </p>
            )}
            <div>
              <span className="mb-1.5 block text-[14px] font-medium">Servicios que cubre</span>
              <div className="flex flex-wrap gap-2">
                {services.map((s) => {
                  const on = draft.serviceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => { haptic.select(); setDraft({ ...draft, serviceIds: on ? draft.serviceIds.filter((x) => x !== s.id) : [...draft.serviceIds, s.id] }); }}
                      className={`min-h-[40px] rounded-full px-4 text-[14px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
                    >
                      {s.name} <span className={on ? 'text-white/70' : 'text-mute'}>{soles(s.price_cents)}</span>
                    </button>
                  );
                })}
              </div>
              <span className="mt-1 block text-[13px] text-soft">{draft.serviceIds.length ? 'Cada uso vale por uno de estos servicios.' : 'Sin elegir, vale para cualquier servicio.'}</span>
            </div>
            <Field label="Vigencia (días)" hint="Desde el día de la compra. 180 días son unos 6 meses.">
              <input inputMode="numeric" value={draft.validDays} onChange={(e) => setDraft({ ...draft, validDays: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={`tnum ${inputCls}`} placeholder="180" />
            </Field>
            <div className="divide-y divide-line border-y border-line">
              <label className="flex items-center justify-between gap-4 py-3.5">
                <span><span className="block text-[15px] font-medium">Vender en línea</span><span className="block text-[13px] text-mute">Aparece en tu tienda de regalos.</span></span>
                <Switch checked={draft.sellOnline} onChange={(v) => setDraft({ ...draft, sellOnline: v })} label="Vender en línea" />
              </label>
              <label className="flex items-center justify-between gap-4 py-3.5">
                <span><span className="block text-[15px] font-medium">Activo</span><span className="block text-[13px] text-mute">Pausado no se vende, pero los usos ya vendidos siguen valiendo.</span></span>
                <Switch checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Activo" />
              </label>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

// ------------------------------ Premios ------------------------------
const KINDS: Array<[RewardKind, string]> = [
  ['free_service', 'Servicio gratis'],
  ['discount_fixed', 'Descuento fijo'],
  ['discount_percent', 'Descuento %'],
  ['product', 'Producto'],
];
interface RewardDraft { id?: string; name: string; points: string; kind: RewardKind; value: string; refId: string; active: boolean }

function Premios() {
  const api = useApi();
  const features = useFeatures();
  const services = useCatalog();
  const [products, setProducts] = useState<Product[]>([]);
  const [list, setList] = useState<Reward[] | null>(null);
  const [recent, setRecent] = useState<Redemption[]>([]);
  const [perVisit, setPerVisit] = useState<number | null>(null);
  const [draft, setDraft] = useState<RewardDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ rewards: Reward[]; recent: Redemption[] }>('/admin/rewards').then((d) => { setList(d.rewards); setRecent(d.recent); }).catch(() => setList([])), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api<{ products: Product[] }>('/admin/products').then((d) => setProducts(d.products.filter((p) => p.is_active))).catch(() => {});
    api<{ loyalty_points_per_visit?: number } | null>('/admin/settings').then((d) => d && typeof d.loyalty_points_per_visit === 'number' && setPerVisit(d.loyalty_points_per_visit)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const describe = (r: { kind: RewardKind; value: number; ref_id: string | null }) => {
    if (r.kind === 'free_service') return `${services.find((s) => s.id === r.ref_id)?.name ?? 'Servicio'} gratis`;
    if (r.kind === 'discount_fixed') return `${soles(r.value)} de descuento`;
    if (r.kind === 'discount_percent') return `${r.value}% de descuento`;
    return products.find((p) => p.id === r.ref_id)?.name ?? 'Producto de regalo';
  };

  // Nombre sugerido según el tipo, si el dueño no escribió uno
  const suggest = (d: RewardDraft) => {
    if (d.kind === 'free_service') { const s = services.find((x) => x.id === d.refId); return s ? `${s.name} gratis` : ''; }
    if (d.kind === 'discount_fixed') return d.value ? `S/ ${d.value} de descuento` : '';
    if (d.kind === 'discount_percent') return d.value ? `${d.value}% de descuento` : '';
    return products.find((x) => x.id === d.refId)?.name ?? '';
  };

  async function save() {
    if (!draft) return;
    const name = draft.name.trim() || suggest(draft);
    if (!name) return toast.error('Ponle un nombre al premio.');
    if ((draft.kind === 'free_service' || draft.kind === 'product') && !draft.refId) return toast.error(draft.kind === 'product' ? 'Elige el producto.' : 'Elige el servicio.');
    setBusy(true);
    const value = draft.kind === 'discount_fixed' ? toCents(draft.value) : draft.kind === 'discount_percent' ? Math.min(100, Number(draft.value) || 0) : 0;
    const body = { name, pointsCost: Number(draft.points), kind: draft.kind, value, refId: draft.kind === 'free_service' || draft.kind === 'product' ? draft.refId : null, active: draft.active };
    try {
      if (draft.id) await api(`/admin/rewards/${draft.id}`, { method: 'PATCH', body });
      else await api('/admin/rewards', { method: 'POST', body });
      toast.success('Premio guardado');
      setDraft(null);
      load();
    } catch {
      toast.error('Revisa los puntos y el valor del premio.');
    } finally {
      setBusy(false);
    }
  }

  const blank = (): RewardDraft => ({ name: '', points: '100', kind: 'free_service', value: '', refId: services[0]?.id ?? '', active: true });
  const edit = (r: Reward): RewardDraft => ({ id: r.id, name: r.name, points: String(r.points_cost), kind: r.kind, value: r.kind === 'discount_fixed' ? (r.value / 100).toFixed(2) : r.kind === 'discount_percent' ? String(r.value) : '', refId: r.ref_id ?? '', active: r.active });

  return (
    <>
      {features && !features.rewards && <FeatureOff what="El programa de puntos" />}
      <div className="mb-6 rounded-xl bg-field p-5">
        <div className="flex items-center gap-2 text-[15px] font-medium"><Trophy size={17} strokeWidth={1.75} /> Cómo suman puntos tus clientes</div>
        <ul className="mt-3 space-y-1.5 text-[14px] text-mute">
          <li>
            Cada visita que cobras suma {perVisit != null ? <span className="tnum font-medium text-ink">{perVisit} {perVisit === 1 ? 'punto' : 'puntos'}</span> : 'puntos'} a su cuenta. Lo cambias en <a href="#ajustes" className="font-medium text-ink underline">Ajustes</a>.
          </li>
          <li>Ven su avance en el enlace de su reserva, con lo que les falta para el próximo premio.</li>
          <li>Canjean el premio al pagar en Caja, usando sus puntos como medio de pago.</li>
        </ul>
      </div>
      <div className="mb-4 flex justify-end"><Btn onClick={() => setDraft(blank())}><Plus size={16} strokeWidth={2} /> Nuevo premio</Btn></div>
      {!list ? <Skeleton /> : list.length === 0 ? (
        <Empty icon={Trophy} title="Sin premios todavía" body="Un corte gratis a los 100 puntos es un clásico que funciona." action={<Btn onClick={() => setDraft(blank())}><Plus size={16} strokeWidth={2} /> Crear premio</Btn>} />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((r) => (
            <li key={r.id} className={`flex items-center gap-4 py-4 ${r.active ? '' : 'opacity-60'}`}>
              <span className="tnum flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-field leading-none">
                <span className="text-[16px] font-semibold">{r.points_cost}</span>
                <span className="mt-0.5 text-[11px] text-mute">puntos</span>
              </span>
              <button type="button" onClick={() => setDraft(edit(r))} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[15px] font-medium">{r.name}</div>
                <div className="truncate text-[13px] text-mute">{describe(r)}, {r.canjes} {r.canjes === 1 ? 'canje' : 'canjes'}</div>
              </button>
              <Switch checked={r.active} onChange={async (v) => { await api(`/admin/rewards/${r.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Premio ${r.name}`} states={['Activo', 'Pausado']} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-10 text-[17px] font-semibold tracking-[-0.02em]">Canjes recientes</h2>
      {recent.length === 0 ? (
        <p className="rounded-xl bg-field p-4 text-[14px] text-mute">Cuando un cliente canjee un premio en Caja, aparecerá aquí.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {recent.map((x, i) => (
            <li key={i} className="flex items-center justify-between gap-4 py-3.5 text-[15px]">
              <span className="min-w-0">
                <span className="block truncate font-medium">{x.client_name ?? 'Cliente'}</span>
                <span className="block truncate text-[13px] text-mute">{x.name}</span>
              </span>
              <span className="tnum shrink-0 text-right text-[13px] text-mute">
                <span className="block text-[14px] font-medium text-ink">-{x.points} puntos</span>
                <span className="inline-flex items-center gap-1"><Clock size={12} strokeWidth={1.75} /> {fmtShort(x.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar premio' : 'Nuevo premio'}
        footer={<><Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn><Btn onClick={save} busy={busy} disabled={!Number(draft?.points)}>Guardar</Btn></>}
      >
        {draft && (
          <div className="space-y-5">
            <div>
              <span className="mb-1.5 block text-[14px] font-medium">Tipo de premio</span>
              <div className="grid grid-cols-2 gap-2">
                {KINDS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={draft.kind === k}
                    onClick={() => { haptic.select(); setDraft({ ...draft, kind: k, refId: k === 'free_service' ? services[0]?.id ?? '' : k === 'product' ? products[0]?.id ?? '' : '', value: '' }); }}
                    className={`min-h-[44px] rounded-xl border text-[15px] ${draft.kind === k ? 'border-ink bg-field font-medium' : 'border-line'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {draft.kind === 'free_service' && (
              <Field label="Servicio">
                <select value={draft.refId} onChange={(e) => setDraft({ ...draft, refId: e.target.value })} className={inputCls}>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({soles(s.price_cents)})</option>)}
                </select>
              </Field>
            )}
            {draft.kind === 'product' && (
              <Field label="Producto" hint={products.length ? undefined : 'Primero agrega productos en Productos.'}>
                <select value={draft.refId} onChange={(e) => setDraft({ ...draft, refId: e.target.value })} className={inputCls}>
                  {products.length === 0 && <option value="">Sin productos</option>}
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({soles(p.price_cents)})</option>)}
                </select>
              </Field>
            )}
            {draft.kind === 'discount_fixed' && (
              <Field label="Descuento (S/)"><input inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className={`tnum ${inputCls}`} placeholder="10" /></Field>
            )}
            {draft.kind === 'discount_percent' && (
              <Field label="Descuento (%)"><input inputMode="numeric" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={`tnum ${inputCls}`} placeholder="20" /></Field>
            )}
            <Field label="Puntos necesarios">
              <input inputMode="numeric" value={draft.points} onChange={(e) => setDraft({ ...draft, points: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={`tnum ${inputCls}`} />
            </Field>
            <Field label="Nombre" hint={suggest(draft) && !draft.name.trim() ? `Si lo dejas vacío: "${suggest(draft)}".` : 'Así lo ve tu cliente.'}>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder={suggest(draft) || 'Corte gratis'} maxLength={80} />
            </Field>
            <label className="flex items-center justify-between gap-4 border-y border-line py-3.5">
              <span className="text-[15px] font-medium">Activo</span>
              <Switch checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Activo" />
            </label>
          </div>
        )}
      </Drawer>
    </>
  );
}
