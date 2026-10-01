'use client';

import { useEffect, useState } from 'react';
import { API_BASE_CLIENT } from '@/lib/config';
import { Check, ExternalLink, Image as ImageIcon, Type } from 'lucide-react';
import type { SiteMood, SiteTheme } from '@/lib/api';
import { MOOD_LIST, resolveTheme } from '../../_site/theme';
import { fontVars } from '../../_site/fonts';
import { useApi } from './api';
import { Field, Switch, inputCls } from './ui';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

/**
 * Estilo de la página pública: ambiente (paleta y tipografía), tipo de portada, frase
 * grande y año de apertura. Cada cambio se guarda al instante.
 */
export function EstiloPagina({ initial, accent, tenant, pageUrl }: { initial: SiteTheme | null | undefined; accent: string; tenant: string; pageUrl: string }) {
  const api = useApi();
  const [t, setT] = useState<SiteTheme>({ mood: 'clasica', hero: 'imagen', marquee: true, ...(initial ?? {}) });
  const [headline, setHeadline] = useState(initial?.headline ?? '');
  const [since, setSince] = useState(initial?.since ? String(initial.since) : '');
  const [shopName, setShopName] = useState('Tu barbería');
  const [services, setServices] = useState<Array<{ id: string; name: string; price_cents: number; is_addon?: boolean }>>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [focus, setFocus] = useState<number>(initial?.focus ?? 50);
  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => r.json())
      .then((d) => {
        if (d?.tenant?.name) setShopName(d.tenant.name);
        setServices((d?.services ?? []).filter((x: { is_addon?: boolean }) => !x.is_addon));
        setPhotos(((d?.branding?.gallery ?? []) as Array<{ url: string }>).map((g) => g.url).filter(Boolean));
        setCover(d?.branding?.cover_url ?? null);
      })
      .catch(() => {});
  }, [tenant]);
  const sig = t.signature ?? {};
  const autoSig = [...services].sort((a, b) => b.price_cents - a.price_cents)[0];
  const main = shopName.replace(/^(barber[ií]a|barbershop|barber shop)\s+/i, '') || shopName;

  async function save(patch: Partial<SiteTheme>, msg = 'Estilo guardado') {
    const next = { ...t, ...patch };
    setT(next);
    try {
      await api('/admin/branding', { method: 'PATCH', body: { siteTheme: patch } });
      haptic.success();
      toast.success(msg);
    } catch {
      toast.error('No se pudo guardar el estilo.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="block text-[14px] font-medium">Ambiente de tu página</span>
          <span className="block text-[13px] text-mute">Colores, letras y carácter. Tu color de marca se mantiene en los botones.</span>
        </div>
        <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink">
          Ver mi página <ExternalLink size={14} strokeWidth={1.75} />
        </a>
      </div>

      <div className={`grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3 ${fontVars}`}>
        {MOOD_LIST.map((m) => {
          const on = t.mood === m.id;
          const r = resolveTheme({ mood: m.id }, accent);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => save({ mood: m.id as SiteMood }, `Ambiente ${m.label} aplicado`)}
              className={`min-w-0 overflow-hidden rounded-xl border text-left transition-shadow ${on ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-2'}`}
            >
              <div className="relative flex h-32 flex-col justify-end p-4" style={{ background: m.bg, color: m.ink }}>
                {on && (
                  <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white">
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                )}
                <span className="block truncate text-[34px] leading-none" style={{ fontFamily: m.display, fontWeight: m.displayWeight, textTransform: m.upper ? 'uppercase' : 'none', letterSpacing: m.tracking }}>
                  {main}
                </span>
                <span className="mt-3 flex items-center gap-2">
                  <span className="inline-flex h-7 items-center px-3 text-[11px] font-semibold" style={{ background: r.accent, color: r.onAccent, borderRadius: m.id === 'lujo' ? 2 : 999, textTransform: m.upper || m.id === 'lujo' ? 'uppercase' : 'none', letterSpacing: m.upper || m.id === 'lujo' ? '0.08em' : 0 }}>
                    Reservar
                  </span>
                  <span className="h-px flex-1" style={{ background: m.line }} />
                </span>
              </div>
              <div className="p-4">
                <span className="block text-[15px] font-semibold">{m.label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-mute">{m.hint}</span>
              </div>
            </button>
          );
        })}
      </div>

      <Field label="Portada">
        <div className="grid grid-cols-2 gap-2">
          {([['imagen', 'Con foto', 'Tu foto de portada a pantalla completa.', ImageIcon], ['tipografia', 'Tipográfica', 'Tu nombre en grande con fotos al lado.', Type]] as const).map(([id, label, hint, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={t.hero === id}
              onClick={() => save({ hero: id })}
              className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left ${t.hero === id ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-line-2'}`}
            >
              <Icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">{label}</span>
                <span className="block text-[12px] leading-snug text-mute">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field label="Frase de portada" hint="Opcional. Si la dejas vacía se usa tu frase principal.">
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            onBlur={() => headline.trim() !== (t.headline ?? '') && save({ headline: headline.trim() }, 'Frase guardada')}
            maxLength={80}
            className={inputCls}
            placeholder="El corte que te mereces, sin esperar"
          />
        </Field>
        <Field label="Año de apertura" hint="Opcional.">
          <input
            value={since}
            onChange={(e) => setSince(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onBlur={() => {
              const n = since ? Number(since) : null;
              if (n !== null && (n < 1900 || n > new Date().getFullYear())) return toast.error('Revisa el año.');
              if (n !== (t.since ?? null)) save({ since: n }, 'Año guardado');
            }}
            inputMode="numeric"
            className={`tnum ${inputCls}`}
            placeholder="2019"
          />
        </Field>
      </div>

      {cover && t.hero !== 'tipografia' && (
        <Field label="Encuadre de la portada" hint="Mueve el punto para que en el celular se vea lo importante de tu foto (por ejemplo, el barbero).">
          <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
            <div className="relative mx-auto aspect-[9/16] w-[120px] overflow-hidden rounded-xl border border-line bg-field" aria-label="Vista en celular">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${focus}% 50%` }} />
              <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-semibold text-white drop-shadow">Celular</span>
            </div>
            <div className="min-w-0">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-line bg-field">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${focus}% 50%` }} />
                <span className="absolute bottom-1 right-2 text-[10px] font-semibold text-white drop-shadow">Computadora</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={focus}
                onChange={(e) => setFocus(Number(e.target.value))}
                onPointerUp={() => focus !== (t.focus ?? 50) && save({ focus }, 'Encuadre guardado')}
                onKeyUp={() => focus !== (t.focus ?? 50) && save({ focus }, 'Encuadre guardado')}
                aria-label="Encuadre horizontal de la portada"
                className="mt-4 w-full accent-[#0a0a0a]"
              />
              <div className="flex justify-between text-[12px] text-mute"><span>Izquierda</span><span>Centro</span><span>Derecha</span></div>
            </div>
          </div>
        </Field>
      )}

      {services.length >= 4 && (
        <Field label="Servicio estrella" hint="Sale destacado en tu página con foto, precio y botón de reservar. Elige tu servicio insignia.">
          <select
            value={sig.serviceId ?? ''}
            onChange={(e) => save({ signature: { ...sig, serviceId: e.target.value || undefined } }, 'Servicio estrella guardado')}
            className={inputCls}
          >
            <option value="">Automático{autoSig ? ` (${autoSig.name}, el de mayor precio)` : ''}</option>
            {services.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {photos.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[13px] text-mute">Foto del servicio estrella</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {photos.map((u) => {
                  const on = (sig.image ?? '') === u;
                  return (
                    <button key={u} type="button" aria-pressed={on} aria-label="Usar esta foto" onClick={() => save({ signature: { ...sig, image: on ? undefined : u } }, on ? 'Foto automática' : 'Foto elegida')} className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg ${on ? 'ring-2 ring-ink ring-offset-2' : 'opacity-80 hover:opacity-100'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-cover" />
                      {on && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"><Check size={12} strokeWidth={2.5} /></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Field>
      )}

      <div className="flex items-center justify-between gap-6 border-y border-line py-4">
        <div className="min-w-0">
          <div className="text-[15px] font-medium">Cinta de servicios</div>
          <div className="text-[14px] text-mute">Tus servicios pasan en letras grandes debajo de la portada.</div>
        </div>
        <Switch checked={t.marquee !== false} onChange={(v) => save({ marquee: v })} label="Cinta de servicios" states={['Activo', 'Apagado']} />
      </div>
    </div>
  );
}
