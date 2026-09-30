'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, TicketPercent, Gift, Crown, Copy, Trash2 } from 'lucide-react';
import { useApi, soles } from './api';
import { PageHead, Btn, Switch, Drawer, Field, inputCls, Empty, Skeleton } from './ui';
import { toast } from '@/lib/toast';

type Tab = 'codigos' | 'gift' | 'membresias';

interface Promo { id: string; code: string; kind: 'percent' | 'fixed'; value: number; active: boolean; expires_at: string | null; max_uses: number | null; used_count: number }
interface GiftCard { id: string; code: string; initial_cents: number; balance_cents: number; active: boolean; created_at: string }
interface Plan { id: string; name: string; description: string | null; price_cents: number; period: 'month' | 'year'; perks: string | null; active: boolean }

export function Promociones() {
  const [tab, setTab] = useState<Tab>('codigos');
  return (
    <>
      <PageHead title="Promociones" sub="Códigos de descuento, gift cards y membresías para que tus clientes vuelvan." />
      <div className="mb-8 flex gap-1 border-b border-line" role="tablist">
        {([['codigos', 'Códigos', TicketPercent], ['gift', 'Gift cards', Gift], ['membresias', 'Membresías', Crown]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[15px] font-medium transition-colors ${tab === id ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-ink'}`}
          >
            <Icon size={16} strokeWidth={1.75} /> {label}
          </button>
        ))}
      </div>
      {tab === 'codigos' && <Codigos />}
      {tab === 'gift' && <GiftCards />}
      {tab === 'membresias' && <Membresias />}
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
            <li key={p.id} className="flex flex-wrap items-center gap-4 py-4">
              <button type="button" onClick={() => copy(p.code)} className="tnum flex items-center gap-2 rounded-lg bg-field px-3 py-1.5 font-mono text-[14px] font-medium hover:bg-line" title="Copiar">
                {p.code} <Copy size={13} strokeWidth={1.75} className="text-mute" />
              </button>
              <span className="text-[15px] font-medium">{p.kind === 'percent' ? `${p.value}% de descuento` : `${soles(p.value)} de descuento`}</span>
              <span className="text-[14px] text-mute">
                {p.used_count} {p.used_count === 1 ? 'uso' : 'usos'}{p.max_uses ? ` de ${p.max_uses}` : ''}
                {p.expires_at ? `, vence el ${new Date(p.expires_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}` : ''}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Switch checked={p.active} onChange={async (v) => { await api(`/admin/promotions/${p.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Activo ${p.code}`} />
                <button type="button" onClick={async () => { if (confirm(`¿Eliminar ${p.code}?`)) { await api(`/admin/promotions/${p.id}`, { method: 'DELETE' }); load(); } }} className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-field hover:text-red" aria-label={`Eliminar ${p.code}`}>
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </div>
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
  const [list, setList] = useState<GiftCard[] | null>(null);
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
              <div className="ml-auto"><Switch checked={g.active} onChange={async (v) => { await api(`/admin/gift-cards/${g.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Activa ${g.code}`} /></div>
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
                <Switch checked={p.active} onChange={async (v) => { await api(`/admin/memberships/${p.id}`, { method: 'PATCH', body: { active: v } }); load(); }} label={`Activa ${p.name}`} />
              </div>
              {p.perks && <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-mute">{p.perks.split('|').map((x) => <li key={x}>{x}</li>)}</ul>}
            </div>
          ))}
        </div>
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
