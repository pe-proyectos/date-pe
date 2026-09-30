'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImagePlus, Loader2, ExternalLink, Palette, CalendarCheck, BellRing, Gift, MapPin, FileText, Wallet, Globe, Plus, Trash2, Copy, RefreshCw, Eye, EyeOff,
} from 'lucide-react';
import { useAdmin, useApi } from './api';
import { PageHead, Btn, Switch, Field, inputCls, Skeleton, Drawer, Empty } from './ui';
import { uploadImage } from '@/lib/upload';
import { tenantUrl } from '@/lib/config';
import { onColor } from '@/lib/color';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { DISTRICTS } from '@/lib/districts';

interface Branding { logo_url: string | null; cover_url: string | null; color_primary: string; tagline: string | null; about: string | null; instagram: string | null; whatsapp: string | null }
interface Settings {
  deposit_percent: number; require_deposit: boolean; cancel_window_hours: number; slot_interval_min: number; loyalty_points_per_visit: number;
  reminders_enabled: boolean; review_requests_enabled: boolean; rebook_days: number; notify_owner_email: string | null;
  require_verification: boolean; allow_client_reschedule: boolean;
  referral_enabled: boolean; referral_discount_percent: number; referral_reward_points: number;
  sunat_enabled: boolean; sunat_ruc: string | null; sunat_razon_social: string | null; sunat_direccion: string | null;
  sunat_serie_boleta: string | null; sunat_serie_factura: string | null; nubefact_url: string | null; nubefact_token_set: boolean;
  mp_public_key: string | null; mp_access_token_set: boolean;
}
interface Location { id: string; name: string; address: string | null; district: string | null; province: string | null; phone: string | null; is_active: boolean; barberos: number }
interface DomainInfo { domain: string | null; status: null | 'pending' | 'active' | 'error'; dns?: { ok: boolean; found: string[] }; serverIp: string }

const PRESETS = ['#0a0a0a', '#0f4c5c', '#1d3f94', '#7a2e1b', '#3f5e2a', '#6b2d5c', '#b45309'];
const REBOOK = [0, 14, 21, 30, 45];

const INDEX = [
  { id: 'marca', label: 'Tu marca', icon: Palette },
  { id: 'reservas', label: 'Reservas', icon: CalendarCheck },
  { id: 'avisos', label: 'Avisos automáticos', icon: BellRing },
  { id: 'referidos', label: 'Referidos', icon: Gift },
  { id: 'sedes', label: 'Sedes', icon: MapPin },
  { id: 'comprobantes', label: 'Comprobantes', icon: FileText },
  { id: 'adelanto', label: 'Cobro del adelanto', icon: Wallet },
  { id: 'dominio', label: 'Dominio propio', icon: Globe },
] as const;
type IndexId = (typeof INDEX)[number]['id'];

const num = (v: string) => Number(v.replace(/\D/g, '')) || 0;
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function Ajustes() {
  const { tenant, token } = useAdmin();
  const api = useApi();
  const [b, setB] = useState<Branding | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const [nubefactToken, setNubefactToken] = useState('');
  const [mpToken, setMpToken] = useState('');
  const [active, setActive] = useState<IndexId>('marca');
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<'logo' | 'cover'>('logo');

  useEffect(() => {
    api<Branding | null>('/admin/branding').then((d) => setB(d ?? { logo_url: null, cover_url: null, color_primary: '#0a0a0a', tagline: '', about: '', instagram: '', whatsapp: '' })).catch(() => {});
    api<Settings | null>('/admin/settings').then((d) => d && setS(d)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resalta en el índice la sección que se está leyendo
  useEffect(() => {
    const els = INDEX.map((x) => document.getElementById(`ajustes-${x.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, c) => a.boundingClientRect.top - c.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id.replace('ajustes-', '') as IndexId);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [b, s]);

  function jump(id: IndexId) {
    haptic.tap();
    setActive(id);
    document.getElementById(`ajustes-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function onFile(file: File) {
    const kind = target.current;
    setUploading(kind);
    try {
      const url = await uploadImage(file, 'branding', { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` });
      setB((prev) => (prev ? { ...prev, [kind === 'logo' ? 'logo_url' : 'cover_url']: url } : prev));
      toast.success(kind === 'logo' ? 'Logo cargado. Guarda para publicarlo.' : 'Portada cargada. Guarda para publicarla.');
    } catch {
      toast.error('No se pudo subir la imagen.');
    } finally {
      setUploading(null);
    }
  }

  async function saveBrand() {
    if (!b) return;
    setBusy('brand');
    try {
      await api('/admin/branding', {
        method: 'PUT',
        body: {
          logoUrl: b.logo_url, coverUrl: b.cover_url, colorPrimary: b.color_primary,
          tagline: b.tagline || null, about: b.about || null, instagram: b.instagram || null,
          whatsapp: b.whatsapp ? (b.whatsapp.startsWith('+') ? b.whatsapp : `+51${b.whatsapp.replace(/\D/g, '')}`) : null,
        },
      });
      toast.success('Tu página se actualizó');
    } catch {
      toast.error('No se pudo guardar. Revisa los campos.');
    } finally {
      setBusy(null);
    }
  }

  /** Guarda solo los campos de una sección (PUT parcial). */
  async function save(key: string, body: Record<string, unknown>, ok: string, fail = 'No se pudo guardar. Revisa los campos.') {
    setBusy(key);
    try {
      await api('/admin/settings', { method: 'PUT', body });
      toast.success(ok);
      return true;
    } catch {
      toast.error(fail);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function saveRules() {
    if (!s) return;
    save('rules', {
      depositPercent: s.deposit_percent, requireDeposit: s.require_deposit, cancelWindowHours: s.cancel_window_hours,
      slotIntervalMin: s.slot_interval_min, loyaltyPointsPerVisit: s.loyalty_points_per_visit,
      allowClientReschedule: s.allow_client_reschedule, requireVerification: s.require_verification,
    }, 'Reglas de reserva guardadas');
  }

  function saveNotices() {
    if (!s) return;
    const email = (s.notify_owner_email ?? '').trim();
    if (email && !isEmail(email)) return toast.error('Revisa el correo para avisos.');
    save('notices', { remindersEnabled: s.reminders_enabled, reviewRequestsEnabled: s.review_requests_enabled, rebookDays: s.rebook_days, notifyOwnerEmail: email }, 'Avisos guardados');
  }

  function saveReferral() {
    if (!s) return;
    if (s.referral_discount_percent > 100) return toast.error('El descuento va de 0 a 100%.');
    save('referral', { referralEnabled: s.referral_enabled, referralDiscountPercent: s.referral_discount_percent, referralRewardPoints: s.referral_reward_points }, 'Referidos guardados');
  }

  async function saveSunat() {
    if (!s) return;
    const ruc = (s.sunat_ruc ?? '').trim();
    if (ruc && !/^\d{11}$/.test(ruc)) return toast.error('El RUC tiene 11 dígitos.');
    if (!/^B[A-Z0-9]{3}$/.test(s.sunat_serie_boleta ?? '')) return toast.error('La serie de boleta empieza con B y tiene 4 caracteres, por ejemplo B001.');
    if (!/^F[A-Z0-9]{3}$/.test(s.sunat_serie_factura ?? '')) return toast.error('La serie de factura empieza con F y tiene 4 caracteres, por ejemplo F001.');
    const url = (s.nubefact_url ?? '').trim();
    if (url && !/^https?:\/\/\S+$/.test(url)) return toast.error('Revisa la URL de Nubefact.');
    const body: Record<string, unknown> = {
      sunatEnabled: s.sunat_enabled, sunatRuc: ruc, sunatRazonSocial: s.sunat_razon_social ?? '', sunatDireccion: s.sunat_direccion ?? '',
      sunatSerieBoleta: s.sunat_serie_boleta, sunatSerieFactura: s.sunat_serie_factura, nubefactUrl: url,
    };
    if (nubefactToken.trim()) body.nubefactToken = nubefactToken.trim();
    if (await save('sunat', body, 'Comprobantes guardados')) {
      if (nubefactToken.trim()) setS({ ...s, nubefact_token_set: true });
      setNubefactToken('');
    }
  }

  async function saveMp() {
    if (!s) return;
    const body: Record<string, unknown> = { mpPublicKey: (s.mp_public_key ?? '').trim() };
    if (mpToken.trim()) body.mpAccessToken = mpToken.trim();
    if (await save('mp', body, 'Datos de MercadoPago guardados')) {
      if (mpToken.trim()) setS({ ...s, mp_access_token_set: true });
      setMpToken('');
    }
  }

  async function clearSecret(kind: 'nubefact' | 'mp') {
    if (!s || !confirm(kind === 'nubefact' ? '¿Quitar el token de Nubefact? Los comprobantes volverán a ser de prueba.' : '¿Quitar el token de MercadoPago? Los adelantos dejarán de llegar a tu cuenta.')) return;
    if (await save(kind, kind === 'nubefact' ? { nubefactToken: '' } : { mpAccessToken: '' }, 'Token quitado')) {
      setS(kind === 'nubefact' ? { ...s, nubefact_token_set: false } : { ...s, mp_access_token_set: false });
    }
  }

  const rebookOptions = s && !REBOOK.includes(s.rebook_days) ? [...REBOOK, s.rebook_days].sort((x, y) => x - y) : REBOOK;

  return (
    <>
      <PageHead
        title="Ajustes"
        actions={<a href={tenantUrl(tenant)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium hover:border-ink"><ExternalLink size={16} strokeWidth={1.75} /> Ver mi página</a>}
      />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      {/* Móvil: índice deslizable para saltar entre secciones */}
      <nav aria-label="Secciones de ajustes" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:hidden">
        {INDEX.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => jump(id)} className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors ${active === id ? 'bg-ink text-white' : 'bg-field text-ink'}`}>
            {label}
          </button>
        ))}
      </nav>

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        {/* Escritorio: índice fijo */}
        <nav aria-label="Secciones de ajustes" className="hidden lg:block">
          <ul className="sticky top-10 space-y-0.5">
            {INDEX.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button type="button" onClick={() => jump(id)} aria-current={active === id ? 'true' : undefined} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] transition-colors ${active === id ? 'bg-field font-medium text-ink' : 'text-mute hover:bg-field hover:text-ink'}`}>
                  <Icon size={16} strokeWidth={1.75} /> {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {/* ------------------------------ Marca ------------------------------ */}
          <Section id="marca" title="Tu marca" sub={`Así se ve tu página en ${tenant}.date.pe.`}>
            {!b ? <Skeleton rows={3} /> : (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="mb-1.5 block text-[14px] font-medium">Logo</span>
                    <button type="button" onClick={() => { target.current = 'logo'; fileRef.current?.click(); }} className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-dashed border-line-2 bg-field hover:border-ink">
                      {uploading === 'logo' ? <Loader2 className="animate-spin text-mute" size={20} /> : b.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : <ImagePlus size={22} strokeWidth={1.5} className="text-mute" />}
                    </button>
                  </div>
                  <div className="min-w-[240px] flex-1">
                    <span className="mb-1.5 block text-[14px] font-medium">Portada</span>
                    <button type="button" onClick={() => { target.current = 'cover'; fileRef.current?.click(); }} className="flex aspect-[21/9] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-2 bg-field hover:border-ink">
                      {uploading === 'cover' ? <Loader2 className="animate-spin text-mute" size={20} /> : b.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.cover_url} alt="" className="h-full w-full object-cover" />
                      ) : <span className="flex items-center gap-2 text-[14px] text-mute"><ImagePlus size={18} strokeWidth={1.5} /> Sube una foto del local</span>}
                    </button>
                  </div>
                </div>

                <Field label="Color de tu marca" hint="Se usa en botones y detalles de tu página.">
                  <div className="flex flex-wrap items-center gap-2">
                    {PRESETS.map((c) => (
                      <button key={c} type="button" onClick={() => setB({ ...b, color_primary: c })} className={`h-9 w-9 rounded-full ring-offset-2 transition-shadow ${b.color_primary === c ? 'ring-2 ring-ink' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} />
                    ))}
                    <label className="flex items-center gap-2 rounded-full border border-line-2 py-1 pl-1 pr-3">
                      <input type="color" value={b.color_primary} onChange={(e) => setB({ ...b, color_primary: e.target.value })} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                      <span className="tnum font-mono text-[13px]">{b.color_primary}</span>
                    </label>
                    <span className="ml-2 rounded-full px-4 py-2 text-[14px] font-medium" style={{ background: b.color_primary, color: onColor(b.color_primary) }}>Reservar</span>
                  </div>
                </Field>
                <Field label="Frase principal" hint="Una línea que diga qué te hace distinto.">
                  <input value={b.tagline ?? ''} onChange={(e) => setB({ ...b, tagline: e.target.value })} maxLength={90} className={inputCls} placeholder="Cortes clásicos y fades en Miraflores" />
                </Field>
                <Field label="Sobre tu barbería">
                  <textarea rows={3} value={b.about ?? ''} onChange={(e) => setB({ ...b, about: e.target.value })} maxLength={400} className={`resize-none ${inputCls}`} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="WhatsApp de contacto" hint="Aparece como botón en tu página.">
                    <input value={b.whatsapp ?? ''} onChange={(e) => setB({ ...b, whatsapp: e.target.value })} inputMode="tel" className={`tnum ${inputCls}`} placeholder="987 654 321" />
                  </Field>
                  <Field label="Instagram"><input value={b.instagram ?? ''} onChange={(e) => setB({ ...b, instagram: e.target.value })} className={inputCls} placeholder="@tubarberia" /></Field>
                </div>
                <Btn onClick={saveBrand} busy={busy === 'brand'}>Guardar marca</Btn>
              </div>
            )}
          </Section>

          {/* ----------------------------- Reservas ----------------------------- */}
          <Section id="reservas" title="Reservas" sub="Adelanto, cancelaciones, cambios de hora y cada cuánto se ofrecen horarios.">
            {!s ? <Skeleton rows={3} /> : (
              <div className="space-y-6">
                <div className="divide-y divide-line border-y border-line">
                  <ToggleRow title="Pedir adelanto para reservar" body="El cliente paga un adelanto con Yape, tarjeta o PayPal. Reduce las ausencias." checked={s.require_deposit} onChange={(v) => setS({ ...s, require_deposit: v })} />
                  {s.require_deposit && (
                    <div className="py-5">
                      <Field label={`Adelanto: ${s.deposit_percent}% del precio`}>
                        <input type="range" min={5} max={100} step={5} value={s.deposit_percent} onChange={(e) => setS({ ...s, deposit_percent: Number(e.target.value) })} className="w-full accent-[#0a0a0a]" />
                      </Field>
                    </div>
                  )}
                  <ToggleRow title="Cambiar la hora desde su enlace" body="Los clientes pueden cambiar la hora desde su enlace, respetando el plazo de cancelación." checked={s.allow_client_reschedule} onChange={(v) => setS({ ...s, allow_client_reschedule: v })} />
                  <ToggleRow title="Verificar el correo" body="Pedir código por correo antes de reservar. Evita reservas falsas." checked={s.require_verification} onChange={(v) => setS({ ...s, require_verification: v })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Cancelar hasta (horas antes)">
                    <input inputMode="numeric" value={s.cancel_window_hours} onChange={(e) => setS({ ...s, cancel_window_hours: num(e.target.value) })} className={`tnum ${inputCls}`} />
                  </Field>
                  <Field label="Horarios cada">
                    <select value={s.slot_interval_min} onChange={(e) => setS({ ...s, slot_interval_min: Number(e.target.value) })} className={inputCls}>
                      {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
                    </select>
                  </Field>
                  <Field label="Puntos por visita">
                    <input inputMode="numeric" value={s.loyalty_points_per_visit} onChange={(e) => setS({ ...s, loyalty_points_per_visit: num(e.target.value) })} className={`tnum ${inputCls}`} />
                  </Field>
                </div>
                <Btn onClick={saveRules} busy={busy === 'rules'}>Guardar reglas</Btn>
              </div>
            )}
          </Section>

          {/* ------------------------- Avisos automáticos ------------------------- */}
          <Section id="avisos" title="Avisos automáticos" sub="Correos que salen solos para que nadie se olvide de su cita.">
            {!s ? <Skeleton rows={3} /> : (
              <div className="space-y-6">
                <div className="divide-y divide-line border-y border-line">
                  <ToggleRow title="Recordatorio 24 h y 2 h antes" body="El cliente recibe un correo antes de su cita con el enlace para cambiarla o cancelarla." checked={s.reminders_enabled} onChange={(v) => setS({ ...s, reminders_enabled: v })} />
                  <ToggleRow title="Pedir reseña después de la visita" body="Una hora después de la cita le pedimos que califique su visita." checked={s.review_requests_enabled} onChange={(v) => setS({ ...s, review_requests_enabled: v })} />
                </div>
                <div>
                  <p className="mb-1.5 text-[14px] font-medium">Invitar a volver</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Invitar a volver">
                    {rebookOptions.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={s.rebook_days === d}
                        onClick={() => { haptic.select(); setS({ ...s, rebook_days: d }); }}
                        className={`min-h-[44px] rounded-full px-4 text-[14px] font-medium transition-colors ${s.rebook_days === d ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`}
                      >
                        {d === 0 ? 'Apagado' : `${d} días`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[13px] text-soft">Si el cliente no vuelve a reservar en ese tiempo, le mandamos un correo para agendar de nuevo.</p>
                </div>
                <Field label="Correo para tus avisos" hint="Te avisamos de cada reserva, cambio y cancelación. Déjalo vacío para no recibirlos.">
                  <input type="email" inputMode="email" autoComplete="email" value={s.notify_owner_email ?? ''} onChange={(e) => setS({ ...s, notify_owner_email: e.target.value })} className={inputCls} placeholder="tu@correo.com" />
                </Field>
                <Btn onClick={saveNotices} busy={busy === 'notices'}>Guardar avisos</Btn>
              </div>
            )}
          </Section>

          {/* ------------------------------ Referidos ------------------------------ */}
          <Section id="referidos" title="Referidos" sub="Tus clientes traen amigos y ambos ganan.">
            {!s ? <Skeleton rows={2} /> : (
              <div className="space-y-6">
                <div className="divide-y divide-line border-y border-line">
                  <ToggleRow title="Código de amigo" body="Cada cliente recibe su propio código. Un amigo nuevo lo escribe al reservar y obtiene un descuento; quien lo invitó gana puntos cuando el amigo asiste." checked={s.referral_enabled} onChange={(v) => setS({ ...s, referral_enabled: v })} />
                </div>
                {s.referral_enabled && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Descuento para el amigo (%)" hint="Solo en su primera reserva.">
                      <input inputMode="numeric" value={s.referral_discount_percent} onChange={(e) => setS({ ...s, referral_discount_percent: Math.min(100, num(e.target.value)) })} className={`tnum ${inputCls}`} />
                    </Field>
                    <Field label="Puntos para quien invita" hint="Se suman cuando el amigo asiste.">
                      <input inputMode="numeric" value={s.referral_reward_points} onChange={(e) => setS({ ...s, referral_reward_points: Math.min(10000, num(e.target.value)) })} className={`tnum ${inputCls}`} />
                    </Field>
                  </div>
                )}
                <Btn onClick={saveReferral} busy={busy === 'referral'}>Guardar referidos</Btn>
              </div>
            )}
          </Section>

          {/* -------------------------------- Sedes -------------------------------- */}
          <Section id="sedes" title="Sedes" sub="Tus locales. Cada barbero puede atender en una sede o en todas.">
            <Sedes />
          </Section>

          {/* ---------------------------- Comprobantes ---------------------------- */}
          <Section id="comprobantes" title="Comprobantes electrónicos (SUNAT)" sub="Boletas y facturas desde la agenda, al marcar una cita como atendida.">
            {!s ? <Skeleton rows={4} /> : (
              <div className="space-y-6">
                <div className="rounded-xl bg-field p-4 text-[14px] text-mute">
                  Se emiten a través de Nubefact, un proveedor autorizado por SUNAT. Sin tu cuenta de Nubefact los comprobantes salen de prueba (serie PRUEBA-B001) y no tienen validez tributaria.{' '}
                  <a href="https://www.nubefact.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-4">Crear cuenta en Nubefact <ExternalLink size={13} strokeWidth={1.75} /></a>
                </div>
                <div className="divide-y divide-line border-y border-line">
                  <ToggleRow title="Emitir comprobantes" body="Muestra el botón de boleta o factura en cada cita atendida." checked={s.sunat_enabled} onChange={(v) => setS({ ...s, sunat_enabled: v })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="RUC">
                    <input inputMode="numeric" maxLength={11} value={s.sunat_ruc ?? ''} onChange={(e) => setS({ ...s, sunat_ruc: e.target.value.replace(/\D/g, '').slice(0, 11) })} className={`tnum ${inputCls}`} placeholder="20123456789" />
                  </Field>
                  <Field label="Razón social">
                    <input value={s.sunat_razon_social ?? ''} onChange={(e) => setS({ ...s, sunat_razon_social: e.target.value })} maxLength={200} className={inputCls} />
                  </Field>
                </div>
                <Field label="Dirección fiscal">
                  <input value={s.sunat_direccion ?? ''} onChange={(e) => setS({ ...s, sunat_direccion: e.target.value })} maxLength={300} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Serie de boleta">
                    <input value={s.sunat_serie_boleta ?? ''} onChange={(e) => setS({ ...s, sunat_serie_boleta: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) })} className={`font-mono uppercase ${inputCls}`} placeholder="B001" />
                  </Field>
                  <Field label="Serie de factura">
                    <input value={s.sunat_serie_factura ?? ''} onChange={(e) => setS({ ...s, sunat_serie_factura: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) })} className={`font-mono uppercase ${inputCls}`} placeholder="F001" />
                  </Field>
                </div>
                <Field label="URL de Nubefact" hint="La ruta de tu cuenta, la encuentras en Nubefact en la sección API.">
                  <input type="url" inputMode="url" value={s.nubefact_url ?? ''} onChange={(e) => setS({ ...s, nubefact_url: e.target.value })} className={inputCls} placeholder="https://api.nubefact.com/api/v1/..." />
                </Field>
                <SecretField label="Token de Nubefact" isSet={s.nubefact_token_set} value={nubefactToken} onChange={setNubefactToken} onClear={() => clearSecret('nubefact')} />
                <Btn onClick={saveSunat} busy={busy === 'sunat'}>Guardar comprobantes</Btn>
              </div>
            )}
          </Section>

          {/* ------------------------- Cobro del adelanto ------------------------- */}
          <Section id="adelanto" title="Cobro directo del adelanto" sub="Conecta tu cuenta de MercadoPago.">
            {!s ? <Skeleton rows={2} /> : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-field p-4 text-[14px] text-mute">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${s.mp_access_token_set ? 'bg-ok-tint text-ok' : 'bg-white text-mute'}`}>{s.mp_access_token_set ? 'Conectado' : 'Sin conectar'}</span>
                  <span>Con tus credenciales, los adelantos que pagan tus clientes con MercadoPago llegan directo a tu cuenta. Las encuentras en MercadoPago, en Tus integraciones, Credenciales de producción.</span>
                </div>
                <SecretField label="Access token" isSet={s.mp_access_token_set} value={mpToken} onChange={setMpToken} onClear={() => clearSecret('mp')} placeholder="APP_USR-..." />
                <Field label="Public key">
                  <input value={s.mp_public_key ?? ''} onChange={(e) => setS({ ...s, mp_public_key: e.target.value })} maxLength={200} autoComplete="off" spellCheck={false} className={`font-mono ${inputCls}`} placeholder="APP_USR-..." />
                </Field>
                <Btn onClick={saveMp} busy={busy === 'mp'}>Guardar MercadoPago</Btn>
              </div>
            )}
          </Section>

          {/* ---------------------------- Dominio propio ---------------------------- */}
          <Section id="dominio" title="Dominio propio" sub={`Usa tu propio dominio en lugar de ${tenant}.date.pe.`} last>
            <Dominio />
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ id, title, sub, children, last }: { id: string; title: string; sub?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <section id={`ajustes-${id}`} className={`scroll-mt-24 py-10 first:pt-0 lg:scroll-mt-10 ${last ? '' : 'border-b border-line'}`}>
      <h2 className="text-[19px] font-semibold tracking-[-0.02em]">{title}</h2>
      {sub && <p className="mt-1 text-[15px] text-mute">{sub}</p>}
      <div className="mt-6 max-w-2xl">{children}</div>
    </section>
  );
}

function ToggleRow({ title, body, checked, onChange }: { title: string; body: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-[15px] font-medium">{title}</div>
        <div className="text-[14px] text-mute">{body}</div>
      </div>
      <Switch checked={checked} onChange={(v) => { haptic.select(); onChange(v); }} label={title} states={['Activo', 'Apagado']} />
    </div>
  );
}

/** Campo de clave: nunca vuelve del servidor; si ya existe se muestra "Configurado". */
function SecretField({ label, isSet, value, onChange, onClear, placeholder }: { label: string; isSet: boolean; value: string; onChange: (v: string) => void; onClear: () => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={isSet ? 'Escribe uno nuevo solo si quieres reemplazarlo.' : undefined}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center rounded-xl border border-line-2 bg-white pr-1 transition-colors focus-within:border-ink">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={200}
            placeholder={isSet ? 'Configurado' : placeholder}
            className="w-full min-w-0 bg-transparent px-3.5 py-2.5 font-mono text-[15px] outline-none"
          />
          <button type="button" onClick={() => setShow(!show)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-mute hover:bg-field" aria-label={show ? 'Ocultar' : 'Mostrar'}>
            {show ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
          </button>
        </div>
        {isSet && <Btn variant="danger" onClick={onClear}>Quitar</Btn>}
      </div>
    </Field>
  );
}

// ------------------------------------ Sedes ------------------------------------

interface SedeDraft { id?: string; name: string; address: string; district: string; phone: string; isActive: boolean }

function Sedes() {
  const api = useApi();
  const [list, setList] = useState<Location[] | null>(null);
  const [draft, setDraft] = useState<SedeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ locations: Location[] }>('/admin/locations').then((d) => setList(d.locations)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    const body = { name: draft.name.trim(), address: draft.address.trim() || null, district: draft.district.trim() || null, phone: draft.phone.trim() || null, isActive: draft.isActive };
    try {
      if (draft.id) await api(`/admin/locations/${draft.id}`, { method: 'PATCH', body });
      else await api('/admin/locations', { method: 'POST', body: { ...body, province: 'Lima' } });
      toast.success(draft.id ? 'Sede actualizada' : 'Sede creada');
      setDraft(null);
      load();
    } catch {
      toast.error('Revisa el nombre de la sede.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !confirm(`¿Eliminar ${draft.name}?`)) return;
    setBusy(true);
    try {
      await api(`/admin/locations/${draft.id}`, { method: 'DELETE' });
      toast.success('Sede eliminada');
      setDraft(null);
      load();
    } catch (e) {
      toast.error((e as Error).message === 'ultima_sede' ? 'Necesitas al menos una sede. Crea otra antes de eliminar esta.' : 'No se pudo eliminar la sede.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!list ? <Skeleton rows={2} /> : list.length === 0 ? (
        <Empty icon={MapPin} title="Sin sedes" body="Agrega tu local para que aparezca en tu página y en el buscador." />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setDraft({ id: l.id, name: l.name, address: l.address ?? '', district: l.district ?? '', phone: l.phone ?? '', isActive: l.is_active })}
                className="flex w-full items-center gap-4 py-4 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-field"><MapPin size={18} strokeWidth={1.75} /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15px] font-medium ${l.is_active ? '' : 'text-soft'}`}>{l.name}</span>
                  <span className="block truncate text-[14px] text-mute">
                    {[l.address, l.district].filter(Boolean).join(', ') || 'Sin dirección'}, {l.barberos === 1 ? '1 barbero' : `${l.barberos} barberos`}
                  </span>
                </span>
                {!l.is_active && <span className="shrink-0 rounded-full bg-field px-2.5 py-1 text-[12px] font-medium text-mute">Pausada</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Btn variant="secondary" className="mt-4" onClick={() => setDraft({ name: '', address: '', district: '', phone: '', isActive: true })}><Plus size={16} strokeWidth={2} /> Agregar sede</Btn>

      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar sede' : 'Nueva sede'}
        footer={
          <>
            {draft?.id && <Btn variant="danger" className="mr-auto" onClick={remove} disabled={busy}><Trash2 size={16} strokeWidth={1.75} /> Eliminar</Btn>}
            <Btn variant="ghost" onClick={() => setDraft(null)}>Cancelar</Btn>
            <Btn onClick={save} busy={busy} disabled={!draft?.name.trim()}>Guardar</Btn>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Nombre"><input autoFocus={!draft.id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} className={inputCls} placeholder="Sede Miraflores" /></Field>
            <Field label="Dirección"><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} maxLength={200} className={inputCls} placeholder="Av. José Larco 123" /></Field>
            <Field label="Distrito" hint="Así apareces en el buscador de tu distrito.">
              <input list="ajustes-distritos" value={draft.district} onChange={(e) => setDraft({ ...draft, district: e.target.value })} maxLength={60} className={inputCls} placeholder="Miraflores" />
              <datalist id="ajustes-distritos">{DISTRICTS.map((d) => <option key={d.slug} value={d.name} />)}</datalist>
            </Field>
            <Field label="Teléfono"><input inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} maxLength={30} className={`tnum ${inputCls}`} placeholder="987 654 321" /></Field>
            <div className="flex items-center justify-between gap-6 border-t border-line pt-4">
              <div>
                <div className="text-[15px] font-medium">Recibe reservas</div>
                <div className="text-[14px] text-mute">Si la pausas, no aparece en tu página.</div>
              </div>
              <Switch checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} label="Sede activa" states={['Activa', 'Pausada']} />
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

// -------------------------------- Dominio propio --------------------------------

const DOMAIN_STATUS: Record<string, [string, string]> = {
  pending: ['Pendiente de DNS', 'bg-[#fff4e0] text-[#8a5300]'],
  active: ['Activo', 'bg-ok-tint text-ok'],
  error: ['Error', 'bg-red-tint text-red-deep'],
};
const DOMAIN_ERRORS: Record<string, string> = {
  dominio_invalido: 'Escribe un dominio válido, por ejemplo mibarberia.pe.',
  dominio_reservado: 'Ese dominio no se puede usar.',
  dominio_en_uso: 'Ese dominio ya está conectado a otra barbería.',
};

function Dominio() {
  const api = useApi();
  const [info, setInfo] = useState<DomainInfo | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'save' | 'check' | 'remove' | null>(null);

  const load = useCallback(async (quiet = true) => {
    try {
      const d = await api<DomainInfo>('/admin/domain');
      setInfo(d);
      setValue((v) => v || d.domain || '');
      if (!quiet) {
        if (d.status === 'active') toast.success('Tu dominio ya funciona.');
        else toast.info(d.dns?.ok ? 'El DNS ya apunta bien. El certificado se emite en unos minutos.' : 'Todavía no vemos el registro A. Puede tardar hasta unas horas.');
      }
    } catch {
      if (!quiet) toast.error('No pudimos revisar el dominio.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  async function put(domain: string | null) {
    setBusy(domain ? 'save' : 'remove');
    try {
      const d = await api<DomainInfo>('/admin/domain', { method: 'PUT', body: { domain } });
      setInfo(d);
      setValue(d.domain ?? '');
      toast.success(domain ? 'Dominio guardado. Ahora crea el registro A.' : 'Dominio quitado');
    } catch (e) {
      toast.error(DOMAIN_ERRORS[(e as Error).message] ?? 'No se pudo guardar el dominio.');
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    haptic.tap();
    setBusy('check');
    await load(false);
    setBusy(null);
  }

  if (!info) return <Skeleton rows={2} />;
  const pill = info.status ? DOMAIN_STATUS[info.status] : null;
  const clean = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  return (
    <div className="space-y-6">
      <Field label="Tu dominio" hint="Sin https:// ni barras. Si lo compraste en Punto.pe, GoDaddy u otro, funciona igual.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={253} className={inputCls} placeholder="mibarberia.pe" />
          <Btn onClick={() => put(clean)} busy={busy === 'save'} disabled={!clean || clean === info.domain} className="shrink-0">Guardar</Btn>
        </div>
      </Field>

      {info.domain && (
        <div className="rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-medium">{info.domain}</p>
              {info.status === 'active' && (
                <a href={`https://${info.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[14px] text-mute hover:text-ink">Abrir <ExternalLink size={13} strokeWidth={1.75} /></a>
              )}
            </div>
            {pill && <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${pill[1]}`}>{pill[0]}</span>}
          </div>

          {info.status !== 'active' && (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-mute">
              <li>Entra al panel donde compraste tu dominio, en la sección DNS.</li>
              <li>
                Crea un registro A en tu dominio que apunte a{' '}
                <button type="button" onClick={() => { navigator.clipboard.writeText(info.serverIp); toast.success('IP copiada'); }} className="tnum inline-flex items-center gap-1.5 rounded-lg bg-field px-2 py-0.5 font-mono text-[14px] font-medium text-ink hover:bg-line">
                  {info.serverIp} <Copy size={12} strokeWidth={1.75} className="text-mute" />
                </button>
                . No uses CNAME.
              </li>
              <li>Espera unos minutos y pulsa Revisar de nuevo. El certificado HTTPS se emite solo cuando el DNS apunta.</li>
            </ol>
          )}
          {info.dns && info.status !== 'active' && (
            <p className="mt-4 text-[14px] text-soft">
              {info.dns.found.length ? `Hoy tu dominio apunta a ${info.dns.found.join(', ')}.` : 'Todavía no encontramos un registro A.'}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            <Btn variant="secondary" onClick={check} busy={busy === 'check'}>{busy !== 'check' && <RefreshCw size={16} strokeWidth={1.75} />} Revisar de nuevo</Btn>
            <Btn variant="danger" onClick={() => { if (confirm(`¿Quitar ${info.domain}? Tu página seguirá en tu dirección de date.pe.`)) put(null); }} busy={busy === 'remove'}><Trash2 size={16} strokeWidth={1.75} /> Quitar dominio</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
