'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Phone, Mail, AtSign, Store, Users, MapPin, CalendarClock, Check, X, Loader2, ExternalLink, Copy, Inbox } from 'lucide-react';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

export interface Application {
  id: string;
  status: 'new' | 'contacted' | 'negotiating' | 'approved' | 'rejected';
  shop_name: string;
  desired_slug: string | null;
  owner_name: string;
  email: string;
  phone: string;
  role: string | null;
  district: string | null;
  city: string;
  address: string | null;
  locations_count: string;
  staff_size: string;
  daily_clients: string;
  years_open: string | null;
  services: string[];
  current_booking: string[];
  current_software: string | null;
  interests: string[];
  payment_methods: string[];
  instagram: string | null;
  website: string | null;
  heard_from: string | null;
  contact_pref: string | null;
  contact_time: string | null;
  comments: string | null;
  internal_notes: string | null;
  agreed_price_cents: number | null;
  contacted_at: string | null;
  tenant_slug: string | null;
  created_at: string;
}

const STATUS: Record<Application['status'], { label: string; cls: string }> = {
  new: { label: 'Nueva', cls: 'bg-red-tint text-red' },
  contacted: { label: 'Contactada', cls: 'bg-[#eef2ff] text-[#1d3f94]' },
  negotiating: { label: 'En conversación', cls: 'bg-[#fff7e6] text-[#8a5a00]' },
  approved: { label: 'Aprobada', cls: 'bg-[#e8f6ee] text-[#0f7a3d]' },
  rejected: { label: 'Descartada', cls: 'bg-field text-mute' },
};
const FILTERS: Array<{ id: string; label: string }> = [
  { id: 'open', label: 'Por atender' },
  { id: 'new', label: 'Nuevas' },
  { id: 'contacted', label: 'Contactadas' },
  { id: 'negotiating', label: 'En conversación' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Descartadas' },
];

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
};
const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{9})$/, '51$1')}?text=${encodeURIComponent(text)}`;
const slugify = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Solicitudes de barberías que llegan desde date.pe/join. */
export function Solicitudes({ headers, onApproved }: { headers: Record<string, string>; onApproved: () => void }) {
  const [list, setList] = useState<Application[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('open');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${API_BASE_CLIENT}/api/platform/applications`, { headers });
    if (!r.ok) return setList([]);
    const d = await r.json();
    setList(d.applications ?? []);
    setCounts(d.counts ?? {});
  }, [headers]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(
    () => (list ?? []).filter((a) => (filter === 'open' ? ['new', 'contacted', 'negotiating'].includes(a.status) : a.status === filter)),
    [list, filter],
  );
  const pending = (counts.new ?? 0) + (counts.contacted ?? 0) + (counts.negotiating ?? 0);
  const current = (list ?? []).find((a) => a.id === openId) ?? null;

  return (
    <section id="solicitudes" className="mt-12 scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-3 text-[22px] font-semibold tracking-[-0.03em]">
            Solicitudes
            {(counts.new ?? 0) > 0 && <span className="tnum rounded-full bg-red px-2.5 py-0.5 text-[13px] font-semibold text-white">{counts.new} nuevas</span>}
          </h2>
          <p className="mt-1 text-[14px] text-mute">Barberías que pidieron acceso desde date.pe/join. Contáctalas, acuerden el plan y apruébalas.</p>
        </div>
      </div>
      <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
        {FILTERS.map((f) => {
          const n = f.id === 'open' ? pending : counts[f.id] ?? 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => { haptic.select(); setFilter(f.id); }}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[14px] ${filter === f.id ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
            >
              {f.label} <span className={`tnum ${filter === f.id ? 'text-white/70' : 'text-soft'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {!list ? (
        <div className="mt-6 h-32 animate-pulse rounded-xl bg-field" />
      ) : shown.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-8 text-mute">
          <Inbox size={20} strokeWidth={1.5} /> {filter === 'open' ? 'Nada pendiente. Las nuevas solicitudes aparecen aquí y te llegan por correo.' : 'No hay solicitudes en este estado.'}
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => { haptic.tap(); setOpenId(a.id); }} className="w-full rounded-xl border border-line p-4 text-left transition-colors hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold">{a.shop_name}</p>
                    <p className="truncate text-[14px] text-mute">
                      {a.owner_name}, {[a.district, a.city].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                  <div><dt className="text-soft">Personal</dt><dd className="font-medium">{a.staff_size}</dd></div>
                  <div><dt className="text-soft">Locales</dt><dd className="font-medium">{a.locations_count}</dd></div>
                  <div><dt className="text-soft">Clientes al día</dt><dd className="font-medium">{a.daily_clients}</dd></div>
                </dl>
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-soft">
                  <CalendarClock size={13} strokeWidth={1.75} /> {ago(a.created_at)}
                  {a.contact_pref && <>, prefiere {a.contact_pref}{a.contact_time ? ` en la ${a.contact_time}` : ''}</>}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ApplicationSheet app={current} headers={headers} onClose={() => setOpenId(null)} onChanged={load} onApproved={() => { load(); onApproved(); }} />
    </section>
  );
}

function ApplicationSheet({ app, headers, onClose, onChanged, onApproved }: { app: Application | null; headers: Record<string, string>; onClose: () => void; onChanged: () => void; onApproved: () => void }) {
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState('');
  const [slug, setSlug] = useState('');
  const [trialDays, setTrialDays] = useState(14);
  const [paidMonths, setPaidMonths] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [approved, setApproved] = useState<{ slug: string; accessUrl: string } | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  useEffect(() => {
    if (!app) return;
    setNotes(app.internal_notes ?? '');
    setPrice(app.agreed_price_cents != null ? String(app.agreed_price_cents / 100) : '');
    setSlug(app.desired_slug ?? slugify(app.shop_name));
    setApproved(null);
    setConfirmReject(false);
  }, [app]);

  if (!app) return <Sheet open={false} onClose={onClose} title="Solicitud">{null}</Sheet>;

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy('patch');
    const r = await fetch(`${API_BASE_CLIENT}/api/platform/applications/${app!.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    setBusy(null);
    if (!r.ok) return toast.error('No se pudo guardar.');
    toast.success(ok);
    onChanged();
  }

  async function approve() {
    const cents = Math.round(Number(price.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents < 0 || price.trim() === '') return toast.error('Escribe el precio mensual acordado (0 si es sin costo).');
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return toast.error('Revisa el subdominio: solo minúsculas, números y guiones.');
    setBusy('approve');
    const r = await fetch(`${API_BASE_CLIENT}/api/platform/applications/${app!.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ slug, monthlyPriceCents: cents, trialDays, paidMonths, sendEmail: true }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast.error(d.error === 'slug_en_uso' || d.error === 'slug_reservado' ? 'Ese subdominio no está disponible.' : 'No se pudo aprobar.');
    haptic.success();
    toast.success(`${app!.shop_name} ya está activa`);
    setApproved({ slug: d.slug, accessUrl: d.accessUrl });
    onApproved();
  }

  async function reject(notify: boolean) {
    setBusy('reject');
    const r = await fetch(`${API_BASE_CLIENT}/api/platform/applications/${app!.id}/reject`, { method: 'POST', headers, body: JSON.stringify({ notify }) });
    setBusy(null);
    if (!r.ok) return toast.error('No se pudo descartar.');
    toast.success('Solicitud descartada');
    onChanged();
    onClose();
  }

  const first = app.owner_name.split(' ')[0];
  const waText = `Hola ${first}, te escribo de date.pe por la solicitud de ${app.shop_name}. ¿Tienes unos minutos para mostrarte el sistema?`;
  const open = ['new', 'contacted', 'negotiating'].includes(app.status);

  return (
    <Sheet open onClose={onClose} title={app.shop_name}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${STATUS[app.status].cls}`}>{STATUS[app.status].label}</span>
          <span className="text-[13px] text-soft">Llegó {ago(app.created_at)}</span>
        </div>

        {/* Contactar en un toque */}
        <div className="grid grid-cols-3 gap-2">
          <a href={waLink(app.phone, waText)} target="_blank" rel="noopener noreferrer" onClick={() => app.status === 'new' && patch({ status: 'contacted' }, 'Marcada como contactada')} className="flex flex-col items-center gap-1.5 rounded-xl bg-ink py-3.5 text-[14px] font-medium text-white">
            <MessageCircle size={19} strokeWidth={1.75} /> WhatsApp
          </a>
          <a href={`tel:${app.phone}`} className="flex flex-col items-center gap-1.5 rounded-xl border border-line py-3.5 text-[14px] font-medium hover:border-ink">
            <Phone size={19} strokeWidth={1.75} /> Llamar
          </a>
          <a href={`mailto:${app.email}?subject=${encodeURIComponent(`date.pe para ${app.shop_name}`)}`} className="flex flex-col items-center gap-1.5 rounded-xl border border-line py-3.5 text-[14px] font-medium hover:border-ink">
            <Mail size={19} strokeWidth={1.75} /> Correo
          </a>
        </div>

        <dl className="divide-y divide-line rounded-xl border border-line text-[15px]">
          {[
            [Users, 'Contacto', `${app.owner_name}${app.role ? `, ${app.role.toLowerCase()}` : ''}`],
            [Phone, 'Celular', app.phone],
            [Mail, 'Correo', app.email],
            [MapPin, 'Ubicación', [app.address, app.district, app.city].filter(Boolean).join(', ')],
            [Store, 'Negocio', `${app.staff_size} personas, ${app.locations_count} ${app.locations_count === '1' ? 'local' : 'locales'}, ${app.daily_clients} clientes al día`],
            [CalendarClock, 'Antigüedad', app.years_open ?? 'No indicó'],
          ].map(([Icon, k, v]) => {
            const I = Icon as typeof Users;
            return (
              <div key={k as string} className="flex items-start gap-3 px-4 py-3">
                <I size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-soft" />
                <dt className="w-24 shrink-0 text-mute">{k as string}</dt>
                <dd className="min-w-0 flex-1 break-words">{v as string}</dd>
              </div>
            );
          })}
        </dl>

        <div className="space-y-4 text-[14px]">
          <Tags label="Hoy reservan por" items={app.current_booking} />
          {app.current_software && <p><span className="text-mute">Usa hoy:</span> {app.current_software}</p>}
          <Tags label="Le interesa" items={app.interests} strong />
          <Tags label="Servicios" items={app.services} />
          <Tags label="Cobra con" items={app.payment_methods} />
          {app.heard_from && <p><span className="text-mute">Se enteró por:</span> {app.heard_from}</p>}
          {(app.instagram || app.website) && (
            <div className="flex flex-wrap gap-2">
              {app.instagram && (
                <a href={`https://instagram.com/${app.instagram.replace(/^@/, '').replace(/.*instagram\.com\//, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 hover:border-ink">
                  <AtSign size={15} strokeWidth={1.75} /> {app.instagram}
                </a>
              )}
              {app.website && (
                <a href={app.website.startsWith('http') ? app.website : `https://${app.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 hover:border-ink">
                  <ExternalLink size={15} strokeWidth={1.75} /> {app.website}
                </a>
              )}
            </div>
          )}
          {app.comments && <p className="rounded-xl bg-field p-3 leading-relaxed">{app.comments}</p>}
        </div>

        {open && (
          <>
            {/* Seguimiento */}
            <div>
              <p className="mb-2 text-[14px] font-medium">Estado</p>
              <div className="flex flex-wrap gap-2">
                {(['new', 'contacted', 'negotiating'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => patch({ status: s }, `Estado: ${STATUS[s].label.toLowerCase()}`)}
                    className={`rounded-full border px-4 py-2 text-[14px] ${app.status === s ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-medium">Notas internas</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-line-2 px-3.5 py-3 text-[16px] outline-none focus:border-ink" placeholder="Qué conversaron, qué necesita, cuándo volver a llamar" />
              <button type="button" onClick={() => patch({ internalNotes: notes }, 'Notas guardadas')} className="mt-2 rounded-full px-4 py-2 text-[14px] font-medium hover:bg-field">
                Guardar notas
              </button>
            </label>

            {/* Aprobar con el plan acordado */}
            <div className="rounded-xl border border-ink p-4">
              <p className="text-[16px] font-semibold">Aprobar y crear la barbería</p>
              <p className="mt-1 text-[13px] text-mute">Se crea su página y su panel, y le llega un correo para crear su contraseña.</p>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[14px] font-medium">Precio mensual acordado</span>
                  <div className="flex items-center rounded-xl border border-line-2 focus-within:border-ink">
                    <span className="border-r border-line px-3.5 py-3 text-[16px] text-mute">S/</span>
                    <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} onBlur={() => price.trim() && patch({ agreedPriceCents: Math.round(Number(price.replace(',', '.')) * 100) }, 'Precio guardado')} inputMode="decimal" className="w-full bg-transparent px-3.5 py-3 text-[16px] outline-none" placeholder="0 si es sin costo" />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[14px] font-medium">Subdominio</span>
                  <div className="flex items-center rounded-xl border border-line-2 pr-3 focus-within:border-ink">
                    <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} autoCapitalize="none" className="w-full bg-transparent px-3.5 py-3 text-[16px] outline-none" />
                    <span className="text-[16px] text-mute">.date.pe</span>
                  </div>
                </label>
                <div>
                  <span className="mb-1.5 block text-[14px] font-medium">Días de prueba</span>
                  <div className="flex flex-wrap gap-2">
                    {[0, 7, 14, 30].map((d) => (
                      <button key={d} type="button" onClick={() => setTrialDays(d)} className={`rounded-full border px-4 py-2 text-[14px] ${trialDays === d ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                        {d === 0 ? 'Sin prueba' : `${d} días`}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-[14px] font-medium">Meses ya pagados</span>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 3, 6, 12].map((m) => (
                      <button key={m} type="button" onClick={() => setPaidMonths(m)} className={`rounded-full border px-4 py-2 text-[14px] ${paidMonths === m ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                        {m === 0 ? 'Ninguno' : `${m} ${m === 1 ? 'mes' : 'meses'}`}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" disabled={busy !== null} onClick={approve} className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-[15px] font-medium text-white disabled:opacity-50">
                  {busy === 'approve' ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2} />} Aprobar {price.trim() ? `con ${soles(Math.round(Number(price.replace(',', '.')) * 100) || 0)} al mes` : ''}
                </button>
              </div>
            </div>

            {!confirmReject ? (
              <button type="button" onClick={() => setConfirmReject(true)} className="w-full rounded-xl py-3 text-[14px] font-medium text-mute hover:bg-field">
                Descartar solicitud
              </button>
            ) : (
              <div className="rounded-xl bg-field p-4">
                <p className="text-[14px]">¿Descartar {app.shop_name}? Puedes avisarle por correo.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => reject(true)} className="rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-white">Descartar y avisar</button>
                  <button type="button" disabled={busy !== null} onClick={() => reject(false)} className="rounded-full border border-line px-4 py-2 text-[14px] font-medium">Descartar sin avisar</button>
                  <button type="button" onClick={() => setConfirmReject(false)} className="rounded-full px-4 py-2 text-[14px]"><X size={15} className="inline" /> Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}

        {(approved || app.status === 'approved') && (
          <div className="rounded-xl bg-[#e8f6ee] p-4 text-[14px] text-[#0f5b2e]">
            <p className="font-medium">Barbería activa: {(approved?.slug ?? app.tenant_slug) ?? ''}.date.pe</p>
            {approved && (
              <>
                <p className="mt-1">Le enviamos el correo para crear su contraseña. Si no le llega, mándale este enlace (vale 7 días):</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => { navigator.clipboard.writeText(approved.accessUrl); toast.success('Enlace copiado'); }} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 font-medium">
                    <Copy size={15} strokeWidth={1.75} /> Copiar enlace
                  </button>
                  <a href={waLink(app.phone, `Hola ${first}, ya activamos ${app.shop_name} en date.pe. Crea tu contraseña aquí: ${approved.accessUrl}`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 font-medium">
                    <MessageCircle size={15} strokeWidth={1.75} /> Enviar por WhatsApp
                  </a>
                </div>
              </>
            )}
            {(approved?.slug ?? app.tenant_slug) && (
              <a href={tenantUrl((approved?.slug ?? app.tenant_slug)!)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-medium underline">
                Ver su página <ExternalLink size={14} strokeWidth={1.75} />
              </a>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Tags({ label, items, strong }: { label: string; items: string[]; strong?: boolean }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-mute">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <span key={x} className={`rounded-full px-2.5 py-1 text-[13px] ${strong ? 'bg-ink text-white' : 'bg-field'}`}>{x}</span>
        ))}
      </div>
    </div>
  );
}
