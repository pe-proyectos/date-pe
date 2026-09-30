'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Copy, QrCode, Printer, Download, CalendarCheck, House, UsersRound, Gift, Star, Smartphone, Code2, ExternalLink, CircleCheck, Info, MapPin, Check,
} from 'lucide-react';
import { useApi, useAdmin } from './api';
import { PageHead, Btn, Field, inputCls, Skeleton } from './ui';
import { Sheet } from '@/components/Sheet';
import { API_BASE_CLIENT, tenantUrl } from '@/lib/config';
import { onColor } from '@/lib/color';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

type QrLib = typeof import('qrcode');
let qrLib: Promise<QrLib> | null = null;
/** Carga la librería de QR solo cuando hace falta (y una sola vez). */
function loadQr(): Promise<QrLib> {
  if (!qrLib) qrLib = import('qrcode').then((m) => ((m as unknown as { default?: QrLib }).default ?? m));
  return qrLib;
}
async function qrSvg(text: string, color = '#0a0a0a'): Promise<string> {
  const lib = await loadQr();
  return lib.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: color, light: '#ffffff' } });
}

function useQr(text: string | null) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSvg(null);
    if (text) qrSvg(text).then((s) => alive && setSvg(s)).catch(() => {});
    return () => { alive = false; };
  }, [text]);
  return svg;
}

function QrImage({ svg, className = '', label }: { svg: string | null; className?: string; label: string }) {
  if (!svg) return <div className={`animate-pulse rounded-lg bg-field ${className}`} aria-hidden />;
  // El SVG lo genera la librería a partir de nuestra propia URL
  return <div role="img" aria-label={label} className={`[&>svg]:h-full [&>svg]:w-full ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const copy = (text: string, what = 'Enlace') => {
  navigator.clipboard.writeText(text).then(() => toast.success(`${what} copiado`)).catch(() => toast.error('No se pudo copiar'));
  haptic.tap();
};
const waShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const short = (url: string) => url.replace(/^https?:\/\//, '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

interface ShopInfo { name: string; accent: string; logo: string | null; district: string | null }
interface LinkDef { id: string; title: string; body: string; url: string; share: string; icon: typeof House; off?: string }
type Purpose = 'reservas' | 'fila' | 'resenas';

export function Difusion() {
  const api = useApi();
  const { tenant } = useAdmin();
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null | undefined>(undefined);
  const [qrFor, setQrFor] = useState<LinkDef | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.tenant && setShop({ name: d.tenant.name, accent: d.branding?.color_primary ?? '#0a0a0a', logo: d.branding?.logo_url ?? null, district: d.locations?.[0]?.district ?? null }))
      .catch(() => {});
    api<{ features: Record<string, boolean>; googleReviewUrl: string | null }>('/admin/features')
      .then((d) => { setFeatures(d.features ?? {}); setReviewUrl(d.googleReviewUrl ?? null); })
      .catch(() => { setFeatures({}); setReviewUrl(null); });
  }, [tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = shop?.name ?? tenant;
  const home = tenantUrl(tenant);
  const links = useMemo<LinkDef[]>(() => [
    { id: 'home', title: 'Tu página', body: 'Servicios, equipo, fotos y opiniones. Ideal para tu bio.', url: home, share: `Conoce ${name} y reserva tu corte aquí: ${home}`, icon: House },
    { id: 'reservar', title: 'Reservar directo', body: 'Abre la reserva sin pasos previos. Para WhatsApp y anuncios.', url: tenantUrl(tenant, '/reservar'), share: `Reserva tu corte en ${name} en un minuto: ${tenantUrl(tenant, '/reservar')}`, icon: CalendarCheck },
    { id: 'fila', title: 'Fila virtual', body: 'Para quien llega sin cita: saca turno y lo avisamos.', url: tenantUrl(tenant, '/fila'), share: `Saca tu turno en ${name} sin hacer cola: ${tenantUrl(tenant, '/fila')}`, icon: UsersRound, off: features && !features.queue ? 'La fila virtual está apagada.' : undefined },
    { id: 'regalos', title: 'Regalos', body: 'Gift cards y paquetes que se pagan en línea.', url: tenantUrl(tenant, '/regalos'), share: `Regala un corte en ${name}: ${tenantUrl(tenant, '/regalos')}`, icon: Gift, off: features && !features.giftcards_online && !features.packages ? 'Las gift cards en línea y los paquetes están apagados.' : undefined },
  ], [tenant, name, home, features]);

  return (
    <>
      <PageHead title="Consigue más clientes" sub="Tus enlaces, códigos QR y afiches listos para compartir. Todo apunta a tu página de reservas." />

      {/* Enlaces */}
      <section>
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Tus enlaces</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {links.map((l) => <LinkCard key={l.id} link={l} onQr={() => { haptic.tap(); setQrFor(l); }} />)}
        </div>
      </section>

      {/* Afiches */}
      <Posters tenant={tenant} shop={shop} reviewUrl={reviewUrl ?? null} />

      {/* Redes */}
      <section className="mt-12">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Instagram y TikTok</h2>
        <p className="mt-0.5 text-[14px] text-mute">Con tu enlace en el perfil, te reservan sin escribirte primero.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Steps
            icon={Smartphone}
            title="Enlace en la bio"
            steps={[
              'Abre tu perfil y toca Editar perfil.',
              'En Enlaces, toca Agregar enlace externo.',
              `Pega ${short(home)} y ponle de título "Reserva aquí".`,
              'En TikTok es igual: Editar perfil y luego Sitio web.',
            ]}
          />
          <Steps
            icon={Star}
            title="Ideas que funcionan"
            steps={[
              'Sube el antes y después de un corte con el sticker de enlace a tu reserva.',
              'Fija una historia destacada "Reservas" con el enlace.',
              'Responde los mensajes con tu enlace directo en vez de coordinar la hora a mano.',
              'Pon el QR de reservas en el espejo y en caja.',
            ]}
          />
        </div>
        <BioText name={name} district={shop?.district ?? null} url={short(home)} />
      </section>

      {/* Google */}
      <GoogleSection tenant={tenant} reviewUrl={reviewUrl} onSaved={setReviewUrl} />

      {/* Botón para su web */}
      <EmbedSection tenant={tenant} accent={shop?.accent ?? '#0a0a0a'} />

      <QrSheet link={qrFor} name={name} onClose={() => setQrFor(null)} />
    </>
  );
}

function LinkCard({ link, onQr }: { link: LinkDef; onQr: () => void }) {
  const svg = useQr(link.url);
  const Icon = link.icon;
  return (
    <div className="flex gap-4 rounded-xl border border-line p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[15px] font-medium"><Icon size={17} strokeWidth={1.75} /> {link.title}</div>
        <p className="mt-0.5 text-[13px] text-mute">{link.body}</p>
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-2 flex min-h-[32px] items-center gap-1 truncate text-[14px] font-medium underline-offset-4 hover:underline">
          <span className="truncate">{short(link.url)}</span> <ExternalLink size={13} strokeWidth={1.75} className="shrink-0 text-mute" />
        </a>
        {link.off && (
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-mute">
            <Info size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" /> <span>{link.off} <a href="#funciones" className="font-medium text-ink underline">Actívala</a></span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => copy(link.url)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-field px-4 text-[14px] font-medium hover:bg-line">
            <Copy size={15} strokeWidth={1.75} /> Copiar
          </button>
          <a href={waShare(link.share)} target="_blank" rel="noopener noreferrer" onClick={() => haptic.tap()} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-field px-4 text-[14px] font-medium hover:bg-line">
            <WaIcon /> WhatsApp
          </a>
          <button type="button" onClick={onQr} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-field px-4 text-[14px] font-medium hover:bg-line sm:hidden">
            <QrCode size={15} strokeWidth={1.75} /> QR
          </button>
        </div>
      </div>
      <button type="button" onClick={onQr} className="hidden h-[104px] w-[104px] shrink-0 rounded-lg border border-line p-1.5 transition-colors hover:border-ink sm:block" aria-label={`Ver código QR de ${link.title}`}>
        <QrImage svg={svg} className="h-full w-full" label={`Código QR de ${link.title}`} />
      </button>
    </div>
  );
}

function QrSheet({ link, name, onClose }: { link: LinkDef | null; name: string; onClose: () => void }) {
  const svg = useQr(link?.url ?? null);
  async function download() {
    if (!link) return;
    try {
      const lib = await loadQr();
      const url = await lib.toDataURL(link.url, { width: 1200, margin: 2, errorCorrectionLevel: 'M' });
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${link.id}-${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
      a.click();
      haptic.success();
    } catch {
      toast.error('No pudimos generar la imagen.');
    }
  }
  return (
    <Sheet
      open={!!link}
      onClose={onClose}
      title={link ? `QR de ${link.title.toLowerCase()}` : 'Código QR'}
      footer={<><Btn variant="secondary" onClick={() => link && copy(link.url)}><Copy size={15} strokeWidth={1.75} /> Copiar enlace</Btn><Btn onClick={download}><Download size={16} strokeWidth={1.75} /> Descargar PNG</Btn></>}
    >
      {link && (
        <div className="flex flex-col items-center text-center">
          <div className="w-full max-w-[300px] rounded-xl border border-line p-4">
            <QrImage svg={svg} className="aspect-square w-full" label={`Código QR de ${link.title}`} />
          </div>
          <p className="mt-4 text-[15px] font-medium">{short(link.url)}</p>
          <p className="mt-1 max-w-xs text-[14px] text-mute">Apunta con la cámara del celular para probarlo. Descárgalo para tus historias, tarjetas o volantes.</p>
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------ Afiches ------------------------------
const POSTERS: Record<Purpose, { label: string; title: string; sub: string; cta: string; icon: typeof House }> = {
  reservas: { label: 'Reservas', title: 'Reserva tu corte en un minuto', sub: 'Escanea, elige a tu barbero y la hora que te queda. Sin llamadas ni esperas.', cta: 'Escanea para reservar', icon: CalendarCheck },
  fila: { label: 'Fila virtual', title: '¿Sin cita? Saca tu turno aquí', sub: 'Escanea y anótate en la fila. Te avisamos en tu celular cuando te toque.', cta: 'Escanea para sacar turno', icon: UsersRound },
  resenas: { label: 'Reseñas en Google', title: '¿Te gustó tu corte?', sub: 'Cuéntalo en Google. Tu reseña nos ayuda a que más vecinos nos encuentren.', cta: 'Escanea para dejar tu reseña', icon: Star },
};

function Posters({ tenant, shop, reviewUrl }: { tenant: string; shop: ShopInfo | null; reviewUrl: string | null }) {
  const [purpose, setPurpose] = useState<Purpose>('reservas');
  const target = purpose === 'reservas' ? tenantUrl(tenant, '/reservar') : purpose === 'fila' ? tenantUrl(tenant, '/fila') : reviewUrl;
  const svg = useQr(target);
  const p = POSTERS[purpose];
  const accent = shop?.accent ?? '#0a0a0a';
  const on = onColor(accent);
  const name = shop?.name ?? tenant;

  async function print() {
    if (!target) return;
    haptic.tap();
    const w = window.open('', '_blank');
    if (!w) return toast.error('Permite las ventanas emergentes para imprimir el afiche.');
    const qr = await qrSvg(target).catch(() => '');
    const initial = esc(name.replace(/^Barber[ií]a\s+/i, '').charAt(0));
    const logo = shop?.logo
      ? `<img src="${esc(new URL(shop.logo, tenantUrl(tenant)).toString())}" alt="" class="logo">`
      : `<span class="logo mono">${initial}</span>`;
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Afiche ${esc(p.label)} | ${esc(name)}</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #0a0a0a; font-family: Figtree, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; margin: 0 auto; display: flex; flex-direction: column; overflow: hidden; }
.band { background: ${accent}; color: ${on}; padding: 18mm 18mm 14mm; display: flex; align-items: center; gap: 6mm; }
.logo { width: 18mm; height: 18mm; border-radius: 50%; object-fit: cover; background: #fff; flex: none; }
.mono { display: flex; align-items: center; justify-content: center; background: ${on}; color: ${accent}; font-size: 9mm; font-weight: 700; }
.shop { font-size: 9mm; font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
.body { flex: 1; padding: 16mm 18mm 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
h1 { font-size: 16mm; font-weight: 700; letter-spacing: -0.04em; line-height: 1; max-width: 170mm; text-wrap: balance; }
.sub { margin-top: 6mm; font-size: 6mm; line-height: 1.35; color: #5f5f66; max-width: 150mm; text-wrap: pretty; }
.qr { margin-top: 12mm; width: 105mm; height: 105mm; padding: 5mm; border: 0.4mm solid #e6e6e9; border-radius: 6mm; }
.qr svg { width: 100%; height: 100%; display: block; }
.cta { margin-top: 8mm; display: inline-block; background: #0a0a0a; color: #fff; font-size: 6mm; font-weight: 600; padding: 4mm 9mm; border-radius: 999px; }
.foot { padding: 10mm 18mm 14mm; text-align: center; font-size: 5mm; color: #5f5f66; }
.foot b { color: #0a0a0a; font-weight: 600; }
@media screen { body { background: #f4f4f5; padding: 24px 0; } .page { background: #fff; box-shadow: 0 24px 60px -20px rgb(10 10 10 / 0.35); } }
</style></head><body><div class="page">
<div class="band">${logo}<div class="shop">${esc(name)}</div></div>
<div class="body"><h1>${esc(p.title)}</h1><p class="sub">${esc(p.sub)}</p><div class="qr">${qr}</div><span class="cta">${esc(p.cta)}</span></div>
<div class="foot">${purpose === 'resenas' ? `<b>${esc(name)}</b>` : `O entra a <b>${esc(short(target))}</b>`}</div>
</div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
    w.document.close();
  }

  return (
    <section className="mt-12">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Afiche para imprimir</h2>
      <p className="mt-0.5 text-[14px] text-mute">Un A4 con tu marca y un QR grande. Pégalo en la puerta, el espejo o la caja.</p>
      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Para qué es el afiche">
            {(Object.keys(POSTERS) as Purpose[]).map((k) => {
              const P = POSTERS[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={purpose === k}
                  onClick={() => { haptic.select(); setPurpose(k); }}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[15px] transition-colors ${purpose === k ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
                >
                  <P.icon size={16} strokeWidth={1.75} /> {P.label}
                </button>
              );
            })}
          </div>
          {purpose === 'resenas' && !reviewUrl && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-field p-4 text-[14px]">
              <Info size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span>Primero agrega tu enlace de reseñas de Google. Más abajo te explicamos cómo conseguirlo.</span>
            </p>
          )}
          <ul className="mt-5 space-y-2 text-[14px] text-mute">
            <li className="flex items-start gap-2"><Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-ink" /> Imprime en A4, a color o en blanco y negro.</li>
            <li className="flex items-start gap-2"><Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-ink" /> Prueba el QR con tu celular antes de pegarlo.</li>
            <li className="flex items-start gap-2"><Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-ink" /> Ponlo a la altura de los ojos, donde la gente espera.</li>
          </ul>
          <Btn className="mt-6" onClick={print} disabled={!target}><Printer size={16} strokeWidth={1.75} /> Imprimir afiche</Btn>
        </div>

        {/* Miniatura del afiche */}
        <div className="mx-auto w-[200px] md:w-full" aria-hidden>
          <div className="flex aspect-[210/297] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-lift">
            <div className="flex items-center gap-1.5 px-3 py-2.5" style={{ background: accent, color: on }}>
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold" style={{ background: on, color: accent }}>{name.replace(/^Barber[ií]a\s+/i, '').charAt(0)}</span>
              <span className="truncate text-[10px] font-bold tracking-[-0.02em]">{name}</span>
            </div>
            <div className="flex flex-1 flex-col items-center px-3 pt-3 text-center">
              <div className="text-[13px] font-bold leading-[1.05] tracking-[-0.03em]">{p.title}</div>
              <div className="mt-1 text-[7px] leading-snug text-mute">{p.sub}</div>
              <div className="mt-2.5 w-[62%] rounded border border-line p-1">
                {target ? <QrImage svg={svg} className="aspect-square w-full" label="" /> : <div className="aspect-square w-full bg-field" />}
              </div>
              <span className="mt-2 rounded-full bg-ink px-2 py-0.5 text-[7px] font-semibold text-white">{p.cta}</span>
            </div>
            <div className="truncate px-3 pb-2.5 text-center text-[7px] text-mute">{purpose === 'resenas' ? name : short(target ?? '')}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Steps({ icon: Icon, title, steps }: { icon: typeof House; title: string; steps: string[] }) {
  return (
    <div className="rounded-xl border border-line p-5">
      <div className="flex items-center gap-2 text-[15px] font-medium"><Icon size={17} strokeWidth={1.75} /> {title}</div>
      <ol className="mt-3 space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-[14px]">
            <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-field text-[12px] font-semibold">{i + 1}</span>
            <span className="pt-0.5 text-ink-2">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BioText({ name, district, url }: { name: string; district: string | null; url: string }) {
  const options = [
    `Cortes, fades y barba${district ? ` en ${district}` : ''}. Reserva tu hora aquí: ${url}`,
    `${name}${district ? `, ${district}` : ''}. Elige barbero y hora en un minuto: ${url}`,
    `Sin llamadas: reserva y paga el adelanto con Yape en ${url}`,
  ];
  return (
    <div className="mt-3 rounded-xl bg-field p-5">
      <div className="text-[15px] font-medium">Textos para tu bio</div>
      <ul className="mt-3 space-y-2">
        {options.map((t) => (
          <li key={t} className="flex items-center gap-3 rounded-lg bg-white p-3">
            <span className="min-w-0 flex-1 text-[14px]">{t}</span>
            <button type="button" onClick={() => copy(t, 'Texto')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-field" aria-label="Copiar texto">
              <Copy size={16} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------ Google ------------------------------
function GoogleSection({ tenant, reviewUrl, onSaved }: { tenant: string; reviewUrl: string | null | undefined; onSaved: (v: string | null) => void }) {
  const api = useApi();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const booking = tenantUrl(tenant, '/reservar');

  async function save() {
    const v = value.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(v)) return toast.error('Pega el enlace completo, empieza con https://');
    setBusy(true);
    try {
      await api('/admin/features', { method: 'PUT', body: { googleReviewUrl: v } });
      onSaved(v);
      setValue('');
      toast.success('Enlace de reseñas guardado. Ya lo ven tus clientes.');
    } catch {
      toast.error('No pudimos guardar el enlace. Revisa que esté completo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Google</h2>
      <p className="mt-0.5 text-[14px] text-mute">Quien te busca en Google Maps puede reservar sin salir de tu ficha.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line p-5">
          <div className="flex items-center gap-2 text-[15px] font-medium"><MapPin size={17} strokeWidth={1.75} /> Botón de reservar en Google</div>
          <ol className="mt-3 space-y-2.5">
            {[
              'Entra a business.google.com con la cuenta dueña de tu ficha, o busca tu barbería en Google estando conectado.',
              'Toca Editar perfil y luego la sección Contacto.',
              'En Vínculos de citas (o Enlaces para reservar), pega tu enlace:',
              'Guarda. Google lo revisa y en unos días aparece el botón Reservar en tu ficha.',
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px]">
                <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-field text-[12px] font-semibold">{i + 1}</span>
                <span className="min-w-0 pt-0.5 text-ink-2">
                  {s}
                  {i === 2 && (
                    <button type="button" onClick={() => copy(booking)} className="mt-2 flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg bg-field px-3 text-left text-[14px] font-medium hover:bg-line">
                      <span className="truncate">{short(booking)}</span> <Copy size={15} strokeWidth={1.75} className="shrink-0 text-mute" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-line p-5">
          <div className="flex items-center gap-2 text-[15px] font-medium"><Star size={17} strokeWidth={1.75} /> Reseñas en Google</div>
          {reviewUrl === undefined ? (
            <div className="mt-3"><Skeleton rows={2} /></div>
          ) : reviewUrl ? (
            <>
              <p className="mt-3 flex items-center gap-2 text-[14px] text-ok"><CircleCheck size={16} strokeWidth={1.75} /> Listo. Invitamos a cada cliente que opina a dejar su reseña en Google.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn variant="secondary" onClick={() => copy(reviewUrl)}><Copy size={15} strokeWidth={1.75} /> Copiar enlace</Btn>
                <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[14px] font-medium hover:bg-field">Probar <ExternalLink size={15} strokeWidth={1.75} /></a>
              </div>
              <p className="mt-3 text-[13px] text-soft">Para cambiarlo, pega uno nuevo:</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-[14px] text-mute">Aún no tienes tu enlace de reseñas. Con él, invitamos a cada cliente que opina a dejar también su reseña en Google, y lo usas en el afiche.</p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] text-ink-2">
                <li>En tu Perfil de Empresa de Google, toca Pedir reseñas (o Conseguir más reseñas).</li>
                <li>Copia el enlace que aparece y pégalo aquí.</li>
              </ol>
            </>
          )}
          {reviewUrl !== undefined && (
            <div className="mt-3 flex gap-2">
              <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputCls} placeholder="https://g.page/r/..." aria-label="Enlace de reseñas de Google" />
              <Btn onClick={save} busy={busy} disabled={!value.trim()}>Guardar</Btn>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------ Botón para su web ------------------------------
function EmbedSection({ tenant, accent }: { tenant: string; accent: string }) {
  const [label, setLabel] = useState('Reservar cita');
  const url = tenantUrl(tenant, '/reservar');
  const fg = onColor(accent);
  const snippet = `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;background:${accent};color:${fg};font:600 16px/1 system-ui,-apple-system,'Segoe UI',sans-serif;padding:14px 24px;border-radius:999px;text-decoration:none">${esc(label)}</a>`;
  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]"><Code2 size={18} strokeWidth={1.75} /> Botón para tu propia web</h2>
      <p className="mt-0.5 text-[14px] text-mute">Si tienes página web o blog, pega este código donde quieras el botón. Funciona en WordPress, Wix y cualquier HTML.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <Field label="Texto del botón">
            <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} className={inputCls} />
          </Field>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-field p-4 font-mono text-[13px] leading-relaxed text-ink-2">{snippet}</pre>
          <Btn className="mt-3" onClick={() => copy(snippet, 'Código')}><Copy size={15} strokeWidth={1.75} /> Copiar código</Btn>
        </div>
        <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-line-2 p-6">
          <span className="mb-3 text-[12px] text-soft">Así se ve</span>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: accent, color: fg, font: "600 16px/1 system-ui,-apple-system,'Segoe UI',sans-serif", padding: '14px 24px', borderRadius: 999, textDecoration: 'none' }}>
            {label || 'Reservar cita'}
          </a>
        </div>
      </div>
    </section>
  );
}

function WaIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="text-[#25D366]">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99 0-1.42.75-2.12 1.01-2.41.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.33.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}
