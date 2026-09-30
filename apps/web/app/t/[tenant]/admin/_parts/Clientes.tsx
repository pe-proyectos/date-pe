'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, Contact, MessageCircle, Award, Copy, Gift, Phone, Trash2, Hourglass, CircleAlert, Camera, ImagePlus, Plus, X, Star, Layers, BadgeCheck, CalendarClock, Repeat, Scissors, Receipt,
} from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Empty, Skeleton, Field, inputCls, Btn, Switch, StatusPill, usePanel, featureOn } from './ui';
import { Sheet } from '@/components/Sheet';
import { Lightbox } from '@/components/Lightbox';
import { uploadImage } from '@/lib/upload';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

interface Client {
  id: string; name: string | null; phone: string; email: string | null; loyalty_points: number;
  visitas: string; ausencias: string; gastado_cents: string; ultima_cita: string | null; proxima_cita: string | null;
  referral_code?: string | null;
}
interface Wait {
  id: string; day: string; name: string; phone: string; email: string | null; notified_at: string | null; booked: boolean;
  service_name: string | null; staff_name: string | null;
}
interface ClientFull {
  id: string; name: string | null; phone: string; email: string | null; birthday: string | null; tags: string[] | null;
  preferences: string | null; allergies: string | null; notes: string | null; marketing_opt_in: boolean; blocked: boolean;
  visitas: number; ausencias: number; barbero_favorito: string | null; cada_cuantos_dias: number | null; loyalty_points: number;
  referral_code: string | null; gastado_pos_cents: number; gastado_citas_cents: number;
}
interface HistoryRow { id: string; starts_at: string; status: string; price_cents: number; staff_name: string | null; service_name: string | null; stars: number | null }
interface Photo { id: string; url: string; caption: string | null; created_at: string; staff_name: string | null }
interface Wallet {
  points: number; referralCode: string | null;
  packages: { id: string; name: string; uses_total: number; uses_left: number; expires_at: string | null }[];
  memberships: { id: string; name: string; ends_at: string; discount_percent: number | null; included_uses: number | null }[];
  rewards: { id: string; name: string; points_cost: number; available: boolean }[];
}
interface SaleRow { id: string; number: number; created_at: string; total_cents: number; status: string; items: string | null }
interface Detail { client: ClientFull; history: HistoryRow[]; photos: Photo[]; wallet: Wallet; sales: SaleRow[] }
interface Draft { name: string; email: string; birthday: string; preferences: string; allergies: string; notes: string; tags: string[]; marketingOptIn: boolean; blocked: boolean; points: string }
type Tab = 'clientes' | 'espera';
type FileTab = 'ficha' | 'fotos' | 'billetera' | 'historial';

const toDraft = (c: ClientFull): Draft => ({
  name: c.name ?? '', email: c.email ?? '', birthday: c.birthday ? c.birthday.slice(0, 10) : '', preferences: c.preferences ?? '', allergies: c.allergies ?? '',
  notes: c.notes ?? '', tags: c.tags ?? [], marketingOptIn: !!c.marketing_opt_in, blocked: !!c.blocked, points: String(c.loyalty_points ?? 0),
});

export function Clientes() {
  const api = useApi();
  const { me } = usePanel();
  // La lista de espera es del dueño y el encargado; la caja no tiene permiso
  const canWaitlist = !me || me.role === 'owner' || me.role === 'manager';
  const [q, setQ] = useState('');
  const [list, setList] = useState<Client[] | null>(null);
  const [open, setOpen] = useState<Client | null>(null);
  const [tab, setTab] = useState<Tab>('clientes');
  const [wait, setWait] = useState<Wait[] | null>(null);

  const loadWait = useCallback(() => api<{ waitlist: Wait[] }>('/admin/waitlist').then((d) => setWait(d.waitlist)).catch(() => setWait([])), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'espera' && canWaitlist) loadWait(); }, [tab, loadWait, canWaitlist]);

  async function removeWait(w: Wait) {
    if (!confirm(`¿Quitar a ${w.name} de la lista de espera?`)) return;
    setWait((p) => p?.filter((x) => x.id !== w.id) ?? null);
    try {
      await api(`/admin/waitlist/${w.id}`, { method: 'DELETE' });
      toast.success('Quitado de la lista de espera');
    } catch {
      toast.error('No se pudo quitar.');
      loadWait();
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ clients: Client[] }>(`/admin/clients?q=${encodeURIComponent(q)}`).then((d) => setList(d.clients)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onSaved = (id: string, patch: Partial<Client>) => setList((p) => p?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? null);

  return (
    <>
      <PageHead
        title="Clientes"
        sub={tab === 'clientes' ? 'Cada reserva crea o actualiza la ficha del cliente. Toca a alguien para ver su ficha completa.' : 'Quienes esperan un horario libre. Les avisamos por correo si alguien cancela ese día.'}
      />
      {canWaitlist && (
        <div className="mb-6 flex w-full max-w-md rounded-full border border-line p-1 sm:w-auto" role="tablist" aria-label="Vista">
          {([['clientes', 'Clientes'], ['espera', 'Lista de espera']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => { haptic.tap(); setTab(id); }}
              className={`min-h-10 flex-1 rounded-full px-4 text-[14px] font-medium transition-colors sm:flex-none ${tab === id ? 'bg-ink text-white' : 'text-mute hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'espera' && canWaitlist ? (
        <Waitlist list={wait} onRemove={removeWait} />
      ) : (
      <>
      <div className="mb-6 flex max-w-md items-center gap-2 rounded-full border border-line-2 px-4 focus-within:border-ink">
        <Search size={17} strokeWidth={1.75} className="text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o celular" className="w-full bg-transparent py-2.5 text-[16px] outline-none md:text-[15px]" />
      </div>

      {!list ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <Empty icon={Contact} title={q ? 'Sin resultados' : 'Aún no tienes clientes'} body={q ? 'Prueba con otro nombre o número.' : 'Aparecen aquí apenas alguien reserva.'} />
      ) : (
        <>
        <ul className="divide-y divide-line border-y border-line md:hidden">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpen(c)} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-field">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field text-[15px] font-semibold">{(c.name ?? '?').trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name ?? 'Sin nombre'}</span>
                  <span className="tnum block text-[13px] text-mute">
                    {c.visitas} {Number(c.visitas) === 1 ? 'visita' : 'visitas'}, {soles(c.gastado_cents)}
                    {Number(c.ausencias) > 0 && <span className="text-red">, {c.ausencias} {Number(c.ausencias) === 1 ? 'ausencia' : 'ausencias'}</span>}
                  </span>
                  <span className="block text-[13px] text-soft">
                    {c.proxima_cita ? `Próxima: ${shortDate(c.proxima_cita)}` : c.ultima_cita ? `Última: ${shortDate(c.ultima_cita)}` : 'Sin visitas aún'}
                  </span>
                </span>
                <span className="tnum shrink-0 text-right text-[13px] font-medium">{c.loyalty_points} pts</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-ink text-[13px] text-mute">
                <th className="py-3 pr-4 font-medium">Cliente</th>
                <th className="py-3 pr-4 text-right font-medium">Visitas</th>
                <th className="py-3 pr-4 text-right font-medium">Ausencias</th>
                <th className="py-3 pr-4 text-right font-medium">Gastado</th>
                <th className="py-3 pr-4 text-right font-medium">Puntos</th>
                <th className="py-3 pr-4 font-medium">Última visita</th>
                <th className="py-3 font-medium">Próxima cita</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c)} className="cursor-pointer border-b border-line hover:bg-field/60">
                  <td className="py-3.5 pr-4">
                    <div className="font-medium">{c.name ?? 'Sin nombre'}</div>
                    <div className="tnum text-[13px] text-mute">{c.phone}</div>
                  </td>
                  <td className="tnum py-3.5 pr-4 text-right">{c.visitas}</td>
                  <td className={`tnum py-3.5 pr-4 text-right ${Number(c.ausencias) > 0 ? 'text-red' : ''}`}>{c.ausencias}</td>
                  <td className="tnum py-3.5 pr-4 text-right">{soles(c.gastado_cents)}</td>
                  <td className="tnum py-3.5 pr-4 text-right">{c.loyalty_points}</td>
                  <td className="py-3.5 pr-4 text-mute">{c.ultima_cita ? shortDate(c.ultima_cita, true) : 'Nunca'}</td>
                  <td className="py-3.5 text-mute">{c.proxima_cita ? shortDate(c.proxima_cita, true) : 'Sin agendar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      </>
      )}

      <ClientFile row={open} onClose={() => setOpen(null)} onSaved={onSaved} />
    </>
  );
}

/* ------------------------------- Ficha completa del cliente ------------------------------- */

function ClientFile({ row, onClose, onSaved }: { row: Client | null; onClose: () => void; onSaved: (id: string, patch: Partial<Client>) => void }) {
  const { tenant, token } = useAdmin();
  const api = useApi();
  const { features } = usePanel();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<FileTab>('ficha');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tag, setTag] = useState('');
  const [lightbox, setLightbox] = useState<number | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photosOn = featureOn(features, 'client_photos');

  const load = useCallback(async (id: string) => {
    try {
      const d = await api<Detail>(`/admin/clients/${id}`);
      setDetail(d);
      setDraft(toDraft(d.client));
    } catch {
      toast.error('No se pudo abrir la ficha.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!row) return;
    setDetail(null);
    setDraft(null);
    setTab('ficha');
    setTag('');
    load(row.id);
  }, [row, load]);

  const c = detail?.client;
  const dirty = !!(c && draft && JSON.stringify(draft) !== JSON.stringify(toDraft(c)));

  async function save() {
    if (!c || !draft) return;
    const email = draft.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('Revisa el correo.');
    setBusy(true);
    try {
      await api(`/admin/clients/${c.id}/profile`, {
        method: 'PATCH',
        body: {
          name: draft.name.trim(), email, birthday: draft.birthday, tags: draft.tags, preferences: draft.preferences.trim(),
          allergies: draft.allergies.trim(), notes: draft.notes.trim(), marketingOptIn: draft.marketingOptIn, blocked: draft.blocked,
        },
      });
      const pts = Number(draft.points) || 0;
      if (pts !== c.loyalty_points) await api(`/admin/clients/${c.id}`, { method: 'PATCH', body: { loyaltyPoints: pts } });
      toast.success('Ficha guardada');
      onSaved(c.id, { name: draft.name.trim() || c.name, email: email || null, loyalty_points: pts });
      load(c.id);
    } catch {
      toast.error('No se pudo guardar. Revisa los campos.');
    } finally {
      setBusy(false);
    }
  }

  function addTag() {
    const t = tag.trim().slice(0, 30);
    if (!draft || !t || draft.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return setTag('');
    if (draft.tags.length >= 20) return toast.info('Máximo 20 etiquetas.');
    setDraft({ ...draft, tags: [...draft.tags, t] });
    setTag('');
  }

  async function onPhoto(file: File) {
    if (!c) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, 'clients', { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` });
      await api(`/admin/clients/${c.id}/photos`, { method: 'POST', body: { url } });
      toast.success('Foto guardada');
      load(c.id);
    } catch {
      toast.error('No se pudo subir la foto.');
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(p: Photo) {
    if (!c || !confirm('¿Eliminar esta foto?')) return;
    setDetail((d) => (d ? { ...d, photos: d.photos.filter((x) => x.id !== p.id) } : d));
    try {
      await api(`/admin/clients/${c.id}/photos/${p.id}`, { method: 'DELETE' });
      toast.success('Foto eliminada');
    } catch {
      toast.error('No se pudo eliminar.');
      load(c.id);
    }
  }

  const gasto = row ? Number(row.gastado_cents) || Math.max(c?.gastado_pos_cents ?? 0, c?.gastado_citas_cents ?? 0) : 0;
  const future = detail?.history.filter((h) => ['pending', 'confirmed'].includes(h.status) && new Date(h.starts_at).getTime() > Date.now()) ?? [];
  const upcoming = future[future.length - 1];
  const nextVisit = row?.proxima_cita ?? upcoming?.starts_at ?? null;
  const photos = detail?.photos ?? [];
  const tabs: [FileTab, string][] = [['ficha', 'Ficha'], ['fotos', `Fotos${photos.length ? ` (${photos.length})` : ''}`], ['billetera', 'Billetera'], ['historial', 'Historial']];

  return (
    <>
      <Sheet
        open={!!row}
        onClose={onClose}
        full
        title={row?.name ?? 'Cliente'}
        footer={tab === 'ficha' && draft ? <><Btn variant="ghost" onClick={onClose}>Cerrar</Btn><Btn onClick={save} busy={busy} disabled={!dirty}>Guardar ficha</Btn></> : <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>}
      >
        {!detail || !c || !draft ? (
          <Skeleton rows={5} />
        ) : (
          <div className="space-y-6">
            {/* Cabecera */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tnum text-[15px] text-mute">{c.phone}</span>
                {c.blocked && <span className="rounded-full bg-red-tint px-2.5 py-1 text-[12px] font-medium text-red-deep">Bloqueado</span>}
                {(c.tags ?? []).map((t) => <span key={t} className="rounded-full bg-field px-2.5 py-1 text-[12px] font-medium">{t}</span>)}
              </div>
              <div className="mt-3 flex gap-2">
                <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink"><Phone size={15} strokeWidth={1.75} /> Llamar</a>
                <a href={`https://wa.me/${waNumber(c.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink"><MessageCircle size={15} strokeWidth={1.75} /> WhatsApp</a>
              </div>
            </div>

            {c.allergies && (
              <p className="flex items-start gap-2 rounded-xl bg-red-tint px-4 py-3 text-[15px] text-red-deep">
                <CircleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <span><span className="font-semibold">Alergia:</span> {c.allergies}</span>
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Stat label="Visitas" value={String(c.visitas)} />
              <Stat label="Ausencias" value={String(c.ausencias)} warn={c.ausencias > 0} />
              <Stat label="Gasto" value={soles(gasto)} />
            </div>
            <dl className="divide-y divide-line border-y border-line text-[15px]">
              <InfoRow icon={Scissors} label="Barbero favorito" value={c.barbero_favorito ?? 'Aún no'} />
              <InfoRow icon={Repeat} label="Frecuencia" value={c.cada_cuantos_dias ? `Viene cada ${c.cada_cuantos_dias} días` : 'Aún sin patrón'} />
              <InfoRow icon={CalendarClock} label="Próxima visita" value={nextVisit ? shortDate(nextVisit, true) : 'Sin agendar'} />
            </dl>

            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-6 md:px-6" role="tablist" aria-label="Secciones de la ficha">
              {tabs.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { haptic.tap(); setTab(id); }} className={`min-h-11 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors ${tab === id ? 'bg-ink text-white' : 'bg-field text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'ficha' && (
              <div className="space-y-4">
                <Field label="Alergias o cuidados" hint="Se resalta en rojo para todo el equipo.">
                  <input value={draft.allergies} onChange={(e) => setDraft({ ...draft, allergies: e.target.value })} maxLength={200} className={`${inputCls} ${draft.allergies ? 'border-red bg-red-tint/40' : ''}`} placeholder="Ej. alergia a la cera con alcohol" />
                </Field>
                <Field label="Cómo le gusta" hint="El barbero lo ve antes de atenderlo.">
                  <textarea rows={2} value={draft.preferences} onChange={(e) => setDraft({ ...draft, preferences: e.target.value })} maxLength={500} className={`resize-none ${inputCls}`} placeholder="Fade bajo, número 2 a los lados, sin tocar la barba" />
                </Field>
                <div>
                  <span className="mb-1.5 block text-[14px] font-medium">Etiquetas</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {draft.tags.map((t) => (
                      <span key={t} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-field pl-3.5 pr-1 text-[14px]">
                        {t}
                        <button type="button" onClick={() => setDraft({ ...draft, tags: draft.tags.filter((x) => x !== t) })} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-line" aria-label={`Quitar ${t}`}><X size={14} strokeWidth={1.75} /></button>
                      </span>
                    ))}
                    <div className="flex items-center gap-1 rounded-full border border-line-2 pl-3.5 pr-1 focus-within:border-ink">
                      <input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} maxLength={30} placeholder="VIP, estudiante" className="h-10 w-32 bg-transparent text-[16px] outline-none" />
                      <button type="button" onClick={addTag} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-field" aria-label="Agregar etiqueta"><Plus size={15} strokeWidth={2} /></button>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nombre"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} autoCapitalize="words" className={inputCls} /></Field>
                  <Field label="Cumpleaños" hint="Para el saludo con descuento."><input type="date" value={draft.birthday} onChange={(e) => setDraft({ ...draft, birthday: e.target.value })} className={inputCls} /></Field>
                </div>
                <Field label="Correo"><input type="email" inputMode="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} /></Field>
                <Field label="Notas internas" hint="Solo las ve tu equipo.">
                  <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={2000} className={`resize-none ${inputCls}`} />
                </Field>
                <Field label="Puntos de lealtad" hint="Puedes ajustarlos si el cliente canjeó un premio.">
                  <div className="flex items-center gap-2">
                    <Award size={18} strokeWidth={1.75} className="text-mute" />
                    <input inputMode="numeric" value={draft.points} onChange={(e) => setDraft({ ...draft, points: e.target.value.replace(/\D/g, '') })} className={`tnum ${inputCls}`} />
                  </div>
                </Field>
                <div className="divide-y divide-line border-y border-line">
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <div><p className="text-[15px] font-medium">Recibe novedades</p><p className="text-[14px] text-mute">Promociones, cumpleaños e invitaciones a volver.</p></div>
                    <Switch checked={draft.marketingOptIn} onChange={(v) => setDraft({ ...draft, marketingOptIn: v })} label="Recibe novedades" />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3.5">
                    <div><p className="text-[15px] font-medium">Bloqueado</p><p className="text-[14px] text-mute">No puede reservar online. Útil si falta seguido.</p></div>
                    <Switch checked={draft.blocked} onChange={(v) => setDraft({ ...draft, blocked: v })} label="Bloqueado" />
                  </div>
                </div>
              </div>
            )}

            {tab === 'fotos' && (
              <div>
                <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
                {photosOn && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Btn onClick={() => camRef.current?.click()} busy={uploading} className="min-h-11"><Camera size={16} strokeWidth={1.75} /> Tomar foto</Btn>
                    <Btn variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading} className="min-h-11"><ImagePlus size={16} strokeWidth={1.75} /> Subir foto</Btn>
                  </div>
                )}
                {photos.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line-2 p-6 text-[15px] text-mute">Guarda la foto de cada corte: la próxima vez sabrán exactamente cómo lo quiere.</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {photos.map((p, i) => (
                      <li key={p.id} className="group relative">
                        <button type="button" onClick={() => setLightbox(i)} className="block aspect-[4/5] w-full overflow-hidden rounded-xl bg-field" aria-label="Ver foto">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={p.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
                        </button>
                        <p className="mt-1 truncate text-[12px] text-mute">{shortDate(p.created_at, true)}{p.staff_name ? `, ${p.staff_name}` : ''}</p>
                        <button type="button" onClick={() => removePhoto(p)} className="absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-mute shadow-sm hover:text-red" aria-label="Eliminar foto">
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'billetera' && <WalletView w={detail.wallet} referral={c.referral_code ?? row?.referral_code ?? null} />}

            {tab === 'historial' && (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-1 text-[15px] font-semibold">Citas</h3>
                  {detail.history.length === 0 ? <p className="text-[15px] text-mute">Sin citas todavía.</p> : (
                    <ul className="divide-y divide-line border-y border-line">
                      {detail.history.map((h) => (
                        <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-medium">{h.service_name ?? 'Servicio'}</p>
                            <p className="text-[13px] text-mute">{shortDate(h.starts_at, true)}{h.staff_name ? `, con ${h.staff_name}` : ''}</p>
                            {h.stars != null && (
                              <span className="mt-1 flex items-center gap-0.5" aria-label={`${h.stars} de 5 estrellas`}>
                                {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} strokeWidth={n <= (h.stars ?? 0) ? 0 : 1.5} className={n <= (h.stars ?? 0) ? 'fill-ink' : 'text-line-2'} />)}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="tnum text-[14px]">{soles(h.price_cents)}</span>
                            <StatusPill status={h.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h3 className="mb-1 text-[15px] font-semibold">Compras en caja</h3>
                  {detail.sales.length === 0 ? <p className="text-[15px] text-mute">Sin compras registradas.</p> : (
                    <ul className="divide-y divide-line border-y border-line">
                      {detail.sales.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Receipt size={16} strokeWidth={1.75} className="shrink-0 text-mute" />
                            <div className="min-w-0">
                              <p className="truncate text-[15px]">{s.items ?? 'Venta'}</p>
                              <p className="tnum text-[13px] text-mute">N.° {s.number}, {shortDate(s.created_at, true)}</p>
                            </div>
                          </div>
                          <span className={`tnum shrink-0 text-[14px] ${s.status === 'void' ? 'text-soft line-through' : ''}`}>{soles(s.total_cents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Lightbox images={photos.map((p) => ({ src: p.url, alt: p.caption || shortDate(p.created_at, true) }))} index={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line px-3 py-3">
      <p className="text-[12px] text-mute">{label}</p>
      <p className={`tnum mt-0.5 truncate text-[18px] font-semibold tracking-[-0.02em] ${warn ? 'text-red' : ''}`}>{value}</p>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="flex items-center gap-2 text-mute"><Icon size={16} strokeWidth={1.75} /> {label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function WalletView({ w, referral }: { w: Wallet; referral: string | null }) {
  const available = w.rewards.filter((r) => r.available);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-line p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-field"><Award size={20} strokeWidth={1.75} /></span>
        <div>
          <p className="tnum text-[22px] font-semibold leading-tight tracking-[-0.03em]">{w.points} puntos</p>
          <p className="text-[14px] text-mute">{available.length ? `Puede canjear ${available.length === 1 ? '1 premio' : `${available.length} premios`}` : 'Aún no alcanza para un premio'}</p>
        </div>
      </div>

      {w.rewards.length > 0 && (
        <section>
          <h3 className="mb-1 text-[15px] font-semibold">Premios</h3>
          <ul className="divide-y divide-line border-y border-line">
            {w.rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <span className={r.available ? 'font-medium' : 'text-mute'}>{r.name}</span>
                <span className={`tnum shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${r.available ? 'bg-ok-tint text-ok' : 'bg-field text-mute'}`}>
                  {r.available ? 'Disponible' : `${r.points_cost} pts`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-[15px] font-semibold">Paquetes</h3>
        {w.packages.length === 0 ? <p className="text-[15px] text-mute">Sin paquetes activos.</p> : (
          <ul className="divide-y divide-line border-y border-line">
            {w.packages.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium"><Layers size={16} strokeWidth={1.75} className="text-mute" /> {p.name}</span>
                  <span className="tnum shrink-0 text-[14px]">Le quedan {p.uses_left} de {p.uses_total}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-field"><div className="h-full rounded-full bg-ink" style={{ width: `${Math.round((p.uses_left / Math.max(1, p.uses_total)) * 100)}%` }} /></div>
                {p.expires_at && <p className="mt-1 text-[13px] text-soft">Vence el {shortDate(p.expires_at, true)}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-[15px] font-semibold">Membresía</h3>
        {w.memberships.length === 0 ? <p className="text-[15px] text-mute">Sin membresía activa.</p> : (
          <ul className="divide-y divide-line border-y border-line">
            {w.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-2 font-medium"><BadgeCheck size={16} strokeWidth={1.75} className="text-mute" /> {m.name}</span>
                <span className="shrink-0 text-right text-[14px] text-mute">
                  {m.discount_percent ? `${m.discount_percent}% de descuento. ` : ''}Hasta el {shortDate(m.ends_at, true)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {referral && (
        <div>
          <span className="mb-1.5 block text-[14px] font-medium">Código de amigo</span>
          <div className="flex items-center gap-2">
            <span className="flex min-h-11 flex-1 items-center gap-2 rounded-xl bg-field px-3.5 font-mono text-[16px] font-medium tracking-[0.04em]">
              <Gift size={17} strokeWidth={1.75} className="text-mute" /> {referral}
            </span>
            <Btn
              variant="secondary"
              className="min-h-11"
              onClick={() => { navigator.clipboard.writeText(referral).then(() => toast.success('Código copiado'), () => toast.error('No se pudo copiar.')); }}
            >
              <Copy size={15} strokeWidth={1.75} /> Copiar
            </Btn>
          </div>
          <span className="mt-1 block text-[13px] text-soft">Si un amigo reserva con este código, tiene descuento y este cliente suma puntos.</span>
        </div>
      )}
    </div>
  );
}

function shortDate(iso: string, year = false) {
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'America/Lima' }).replace('.', '');
}

/** Número para WhatsApp con código de país (Perú: 51) si viene sin él. */
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length === 9 ? `51${d}` : d;
}

function dayTitle(date: string) {
  const t = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function waitStatus(w: Wait): [string, string] {
  if (w.booked) return ['Ya reservó', 'bg-ok-tint text-ok'];
  if (w.notified_at) {
    const hora = new Date(w.notified_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
    return [`Avisado ${hora}`, 'bg-[#e8eefb] text-[#1d3f94]'];
  }
  return ['Esperando', 'bg-field text-mute'];
}

function Waitlist({ list, onRemove }: { list: Wait[] | null; onRemove: (w: Wait) => void }) {
  if (!list) return <Skeleton />;
  if (list.length === 0) {
    return (
      <Empty
        icon={Hourglass}
        title="Nadie en lista de espera"
        body="Cuando un día está lleno, tus clientes pueden anotarse desde tu página de reservas. Si alguien cancela, les avisamos por correo y aparecen aquí."
      />
    );
  }
  const groups: [string, Wait[]][] = [];
  for (const w of list) {
    const last = groups[groups.length - 1];
    if (last && last[0] === w.day) last[1].push(w);
    else groups.push([w.day, [w]]);
  }
  return (
    <div className="space-y-6">
      {groups.map(([day, rows]) => (
        <div key={day}>
          <h3 className="mb-1 text-[14px] font-medium text-mute">{dayTitle(day)}</h3>
          <ul className="divide-y divide-line border-y border-line">
            {rows.map((w) => {
              const [label, cls] = waitStatus(w);
              const detail = [w.service_name, w.staff_name ? `con ${w.staff_name}` : 'cualquier barbero'].filter(Boolean).join(', ');
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{w.name}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${cls}`}>{label}</span>
                    </div>
                    <div className="text-[14px] text-mute">{detail}</div>
                    <div className="tnum text-[13px] text-soft">{w.phone}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`tel:${w.phone}`} className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-ink" aria-label={`Llamar a ${w.name}`}>
                      <Phone size={16} strokeWidth={1.75} />
                    </a>
                    <a href={`https://wa.me/${waNumber(w.phone)}`} target="_blank" rel="noopener noreferrer" className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-ink" aria-label={`WhatsApp a ${w.name}`}>
                      <MessageCircle size={16} strokeWidth={1.75} />
                    </a>
                    <button type="button" onClick={() => onRemove(w)} className="flex h-11 w-11 items-center justify-center rounded-full text-mute transition-colors hover:bg-red-tint hover:text-red" aria-label={`Quitar a ${w.name}`}>
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
