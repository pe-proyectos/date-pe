'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, ExternalLink } from 'lucide-react';
import { useAdmin, useApi } from './api';
import { PageHead, Btn, Switch, Field, inputCls, Skeleton } from './ui';
import { uploadImage } from '@/lib/upload';
import { tenantUrl } from '@/lib/config';
import { onColor } from '@/lib/color';
import { toast } from '@/lib/toast';

interface Branding { logo_url: string | null; cover_url: string | null; color_primary: string; tagline: string | null; about: string | null; instagram: string | null; whatsapp: string | null }
interface Settings { deposit_percent: number; require_deposit: boolean; cancel_window_hours: number; slot_interval_min: number; loyalty_points_per_visit: number }

const PRESETS = ['#0a0a0a', '#0f4c5c', '#1d3f94', '#7a2e1b', '#3f5e2a', '#6b2d5c', '#b45309'];

export function Ajustes() {
  const { tenant, token } = useAdmin();
  const api = useApi();
  const [b, setB] = useState<Branding | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<'brand' | 'rules' | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<'logo' | 'cover'>('logo');

  useEffect(() => {
    api<Branding | null>('/admin/branding').then((d) => setB(d ?? { logo_url: null, cover_url: null, color_primary: '#0a0a0a', tagline: '', about: '', instagram: '', whatsapp: '' })).catch(() => {});
    api<Settings>('/admin/settings').then(setS).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function saveRules() {
    if (!s) return;
    setBusy('rules');
    try {
      await api('/admin/settings', {
        method: 'PUT',
        body: {
          depositPercent: s.deposit_percent, requireDeposit: s.require_deposit, cancelWindowHours: s.cancel_window_hours,
          slotIntervalMin: s.slot_interval_min, loyaltyPointsPerVisit: s.loyalty_points_per_visit,
        },
      });
      toast.success('Reglas de reserva guardadas');
    } catch {
      toast.error('No se pudo guardar.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHead
        title="Ajustes"
        actions={<a href={tenantUrl(tenant)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium hover:border-ink"><ExternalLink size={16} strokeWidth={1.75} /> Ver mi página</a>}
      />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      <section className="grid gap-10 border-b border-line pb-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Tu marca</h2>
          <p className="mt-1 text-[15px] text-mute">Así se ve tu página en {tenant}.date.pe.</p>
        </div>
        {!b ? <div className="lg:col-span-8"><Skeleton rows={3} /></div> : (
          <div className="space-y-6 lg:col-span-8">
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
      </section>

      <section className="grid gap-10 pt-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Reglas de reserva</h2>
          <p className="mt-1 text-[15px] text-mute">Adelanto, cancelaciones y cada cuánto se ofrecen horarios.</p>
        </div>
        {!s ? <div className="lg:col-span-8"><Skeleton rows={3} /></div> : (
          <div className="space-y-6 lg:col-span-8">
            <div className="flex items-center justify-between gap-6 border-b border-line pb-6">
              <div>
                <div className="text-[15px] font-medium">Pedir adelanto para reservar</div>
                <div className="text-[14px] text-mute">El cliente paga un adelanto con Yape, tarjeta o PayPal. Reduce las ausencias.</div>
              </div>
              <Switch checked={s.require_deposit} onChange={(v) => setS({ ...s, require_deposit: v })} label="Pedir adelanto" />
            </div>
            {s.require_deposit && (
              <Field label={`Adelanto: ${s.deposit_percent}% del precio`}>
                <input type="range" min={5} max={100} step={5} value={s.deposit_percent} onChange={(e) => setS({ ...s, deposit_percent: Number(e.target.value) })} className="w-full accent-[#0a0a0a]" />
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Cancelar hasta (horas antes)">
                <input inputMode="numeric" value={s.cancel_window_hours} onChange={(e) => setS({ ...s, cancel_window_hours: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`tnum ${inputCls}`} />
              </Field>
              <Field label="Horarios cada">
                <select value={s.slot_interval_min} onChange={(e) => setS({ ...s, slot_interval_min: Number(e.target.value) })} className={inputCls}>
                  {[10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
                </select>
              </Field>
              <Field label="Puntos por visita">
                <input inputMode="numeric" value={s.loyalty_points_per_visit} onChange={(e) => setS({ ...s, loyalty_points_per_visit: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`tnum ${inputCls}`} />
              </Field>
            </div>
            <Btn onClick={saveRules} busy={busy === 'rules'}>Guardar reglas</Btn>
          </div>
        )}
      </section>
    </>
  );
}
