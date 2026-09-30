'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarCheck, ListOrdered, Tv, BellRing, MessageCircle, Wallet, HandCoins, Package, Layers, Gift, BadgeCheck, Award, Megaphone, Camera,
  Receipt, Users, Star, ChevronDown, ImagePlus, Trash2, Plus, X, ExternalLink, Copy, RefreshCw, Loader2, ArrowUp, ArrowDown, Info,
} from 'lucide-react';
import { useAdmin, useApi } from './api';
import { PageHead, Btn, Switch, Field, inputCls, Skeleton, Segmented, usePanel, type Features } from './ui';
import { uploadImage } from '@/lib/upload';
import { tenantUrl } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

/* ------------------------------------ Tipos ------------------------------------ */

interface Promo { title: string; text?: string; image?: string }
interface TvCfg {
  theme: 'dark' | 'light' | 'brand'; layout: 'split' | 'queue' | 'minimal';
  showQueue: boolean; showAppointments: boolean; showQr: boolean; showClock: boolean; showPromos: boolean;
  announceVoice: boolean; chime: boolean; message: string; promos: Promo[]; backgroundUrl: string; scale: number;
}
interface QueueCfg { maxWaiting: number; askPhone: boolean; allowStaffChoice: boolean; noShowMinutes: number; fallbackMinutes: number; earlyMinutes: number; welcome: string; closedMessage: string }
interface PosCfg { tipPresets: number[]; methods: string[]; requireSession: boolean; askReceipt: boolean }
interface MktCfg { birthdayEnabled: boolean; birthdayDiscountPercent: number; winbackEnabled: boolean; winbackDays: number; winbackDiscountPercent: number; membershipRenewReminder: boolean }
interface Cfg {
  features: Features; tv: TvCfg; queue: QueueCfg; pos: PosCfg; marketing: MktCfg;
  googleReviewUrl: string | null; whatsappReady: boolean; pushReady: boolean;
}
type ConfigKey = 'tv' | 'queue' | 'pos' | 'marketing';
type Icon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
interface Item { key: string; title: string; benefit: string; icon: Icon; config?: ConfigKey | 'whatsapp' }

const CATALOG: { title: string; items: Item[] }[] = [
  {
    title: 'Reservas y atención',
    items: [
      { key: 'booking', title: 'Reservas online', benefit: 'Tus clientes reservan solos desde tu página, las 24 horas.', icon: CalendarCheck },
      { key: 'queue', title: 'Fila virtual', benefit: 'Sin cita, se anotan con el QR y esperan desde su celular.', icon: ListOrdered, config: 'queue' },
      { key: 'tv', title: 'Pantalla de TV', benefit: 'Muestra la fila, las citas y tus promociones en el local.', icon: Tv, config: 'tv' },
      { key: 'push', title: 'Notificaciones', benefit: 'Avisos al celular del equipo y al cliente cuando le toca.', icon: BellRing },
      { key: 'whatsapp', title: 'WhatsApp', benefit: 'Recordatorios y avisos de turno por WhatsApp.', icon: MessageCircle, config: 'whatsapp' },
    ],
  },
  {
    title: 'Cobros y ventas',
    items: [
      { key: 'pos', title: 'Caja', benefit: 'Cobra citas, turnos y productos, y cuadra la caja al cerrar.', icon: Wallet, config: 'pos' },
      { key: 'tips', title: 'Propinas', benefit: 'Sugiere propina al cobrar y la suma a cada barbero.', icon: HandCoins },
      { key: 'products', title: 'Productos', benefit: 'Vende ceras y shampoo con control de stock.', icon: Package },
      { key: 'packages', title: 'Paquetes', benefit: 'Cortes prepagados que el cliente va usando.', icon: Layers },
      { key: 'giftcards_online', title: 'Gift cards online', benefit: 'Se compran desde tu página para regalar.', icon: Gift },
      { key: 'memberships_sale', title: 'Membresías', benefit: 'Un pago al mes con descuento, clientes que vuelven.', icon: BadgeCheck },
    ],
  },
  {
    title: 'Clientes y fidelización',
    items: [
      { key: 'rewards', title: 'Premios por puntos', benefit: 'Canjean sus puntos por cortes o descuentos.', icon: Award },
      { key: 'marketing', title: 'Marketing automático', benefit: 'Saludos de cumpleaños e invitaciones a volver, solos.', icon: Megaphone, config: 'marketing' },
      { key: 'client_photos', title: 'Fotos de cortes', benefit: 'La foto de cada corte queda en la ficha del cliente.', icon: Camera },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { key: 'expenses', title: 'Gastos', benefit: 'Registra gastos y mira tu utilidad real.', icon: Receipt },
      { key: 'payroll', title: 'Pagos al equipo', benefit: 'Comisiones, propinas y adelantos de cada barbero.', icon: Users },
    ],
  },
];

const ERR = 'No se pudo guardar. Intenta de nuevo.';

/* ---------------------------------- Pantalla ---------------------------------- */

/** Centro de mando: prende o apaga cada función y ajusta cómo se comporta. */
export function Funciones() {
  const api = useApi();
  const { setFeatures } = usePanel();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [tvKey, setTvKey] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    api<Cfg>('/admin/features').then(setCfg).catch(() => toast.error('No pudimos cargar tus funciones.'));
    api<{ tvKey: string }>('/admin/queue').then((d) => setTvKey(d.tvKey)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(item: Item, v: boolean) {
    if (!cfg) return;
    haptic.select();
    const prev = cfg.features;
    const next = { ...prev, [item.key]: v };
    setCfg({ ...cfg, features: next });
    setFeatures({ [item.key]: v });
    try {
      await api('/admin/features', { method: 'PUT', body: { features: { [item.key]: v } } });
      toast.success(v ? `${item.title}: activado` : `${item.title}: apagado`);
    } catch {
      setCfg((c) => (c ? { ...c, features: prev } : c));
      setFeatures({ [item.key]: !v });
      toast.error(ERR);
    }
  }

  /** Guarda la configuración de una tarjeta con interfaz optimista. */
  const saveConfig = useCallback(async <K extends ConfigKey>(key: K, value: Cfg[K], ok: string) => {
    let prev: Cfg[K] | undefined;
    setCfg((c) => {
      if (!c) return c;
      prev = c[key];
      return { ...c, [key]: value };
    });
    try {
      await api('/admin/features', { method: 'PUT', body: { [key]: value } });
      toast.success(ok);
      if (key === 'tv') setNonce((n) => n + 1);
      return true;
    } catch {
      setCfg((c) => (c && prev !== undefined ? { ...c, [key]: prev } : c));
      toast.error(ERR);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveReview(url: string) {
    try {
      await api('/admin/features', { method: 'PUT', body: { googleReviewUrl: url } });
      setCfg((c) => (c ? { ...c, googleReviewUrl: url || null } : c));
      toast.success(url ? 'Enlace de reseñas guardado' : 'Enlace de reseñas quitado');
      return true;
    } catch {
      toast.error('Revisa el enlace: debe empezar con https://');
      return false;
    }
  }

  async function rotateKey() {
    if (!confirm('¿Cambiar el enlace de la TV? La pantalla actual dejará de funcionar hasta que abras el nuevo enlace.')) return;
    try {
      const d = await api<{ tvKey?: string; key?: string }>('/admin/tv/rotate-key', { method: 'POST', body: {} });
      const k = d.tvKey ?? d.key ?? null;
      if (k) setTvKey(k);
      else api<{ tvKey: string }>('/admin/queue').then((q) => setTvKey(q.tvKey)).catch(() => {});
      toast.success('Enlace de la TV renovado');
    } catch {
      toast.error('No se pudo renovar el enlace.');
    }
  }

  const expand = (k: string) => { haptic.tap(); setOpen((o) => (o === k ? null : k)); };

  if (!cfg) return (<><PageHead title="Funciones" /><Skeleton rows={6} /></>);
  const on = (k: string) => cfg.features[k] !== false;

  return (
    <>
      <PageHead title="Funciones" sub="Prende solo lo que usas. Lo que apagues desaparece del panel y de tu página." />
      <div className="space-y-10">
        {CATALOG.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">{g.title}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {g.items.map((item) => {
                const isWa = item.key === 'whatsapp';
                const disabled = (isWa && !cfg.whatsappReady) || (item.key === 'push' && !cfg.pushReady);
                const badge = isWa ? (cfg.whatsappReady ? ['Conectado', 'bg-ok-tint text-ok'] : ['Próximamente', 'bg-field text-mute']) : item.key === 'push' && !cfg.pushReady ? ['No disponible', 'bg-field text-mute'] : null;
                return (
                  <FeatureCard
                    key={item.key}
                    item={item}
                    checked={on(item.key) && !disabled}
                    disabled={disabled}
                    badge={badge as [string, string] | null}
                    open={open === item.key}
                    onExpand={item.config ? () => expand(item.key) : undefined}
                    onToggle={(v) => toggle(item, v)}
                  >
                    {item.config === 'tv' && <TvEditor value={cfg.tv} tvKey={tvKey} nonce={nonce} onSave={(v) => saveConfig('tv', v, 'Pantalla de TV actualizada')} onRotate={rotateKey} />}
                    {item.config === 'queue' && <QueueEditor value={cfg.queue} onSave={(v) => saveConfig('queue', v, 'Fila virtual actualizada')} />}
                    {item.config === 'pos' && <PosEditor value={cfg.pos} onSave={(v) => saveConfig('pos', v, 'Caja actualizada')} />}
                    {item.config === 'marketing' && <MarketingEditor value={cfg.marketing} onSave={(v) => saveConfig('marketing', v, 'Marketing actualizado')} />}
                    {item.config === 'whatsapp' && (
                      <p className="flex items-start gap-2.5 rounded-xl bg-field p-4 text-[14px] text-mute">
                        <Info size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" />
                        {cfg.whatsappReady
                          ? 'WhatsApp está conectado. Los recordatorios y avisos de turno también salen por WhatsApp cuando el cliente dejó su celular.'
                          : 'Estamos terminando la conexión con WhatsApp. Mientras tanto, los avisos salen por correo y notificaciones.'}
                      </p>
                    )}
                  </FeatureCard>
                );
              })}
              {g.title === 'Clientes y fidelización' && (
                <FeatureCard
                  item={{ key: 'google', title: 'Reseñas en Google', benefit: 'Tras una buena visita, invitamos al cliente a dejarte 5 estrellas en Google.', icon: Star }}
                  badge={cfg.googleReviewUrl ? ['Conectado', 'bg-ok-tint text-ok'] : ['Sin enlace', 'bg-field text-mute']}
                  open={open === 'google'}
                  onExpand={() => expand('google')}
                >
                  <GoogleEditor value={cfg.googleReviewUrl ?? ''} onSave={saveReview} />
                </FeatureCard>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* -------------------------------- Piezas comunes -------------------------------- */

function FeatureCard({ item, checked, disabled, badge, open, onExpand, onToggle, children }: {
  item: Item; checked?: boolean; disabled?: boolean; badge?: [string, string] | null; open: boolean;
  onExpand?: () => void; onToggle?: (v: boolean) => void; children?: React.ReactNode;
}) {
  const Icon = item.icon;
  return (
    <div className={`rounded-xl border transition-colors ${open ? 'border-ink lg:col-span-2' : 'border-line'}`}>
      <div className="flex items-start gap-4 p-4 md:p-5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${checked || !onToggle ? 'bg-ink text-white' : 'bg-field text-mute'}`}>
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-medium">{item.title}</p>
            {badge && <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium ${badge[1]}`}>{badge[0]}</span>}
          </div>
          <p className="mt-0.5 text-[14px] text-mute">{item.benefit}</p>
          {onExpand && (
            <button type="button" onClick={onExpand} aria-expanded={open} className="-ml-2 mt-1.5 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[14px] font-medium hover:bg-field">
              {open ? 'Cerrar' : 'Configurar'} <ChevronDown size={16} strokeWidth={1.75} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {onToggle && (
          <div className={`pt-1 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
            <Switch checked={!!checked} onChange={onToggle} label={item.title} />
          </div>
        )}
      </div>
      {open && children && <div className="fade-in border-t border-line p-4 md:p-5">{children}</div>}
    </div>
  );
}

/** Borrador local de una configuración: se compara con lo guardado para saber si hay cambios. */
function useDraft<T>(value: T) {
  const [draft, setDraft] = useState<T>(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  return [draft, setDraft, dirty, () => setDraft(value)] as const;
}

function SaveRow({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => Promise<boolean>; onReset: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <Btn onClick={async () => { setBusy(true); await onSave(); setBusy(false); }} busy={busy} disabled={!dirty}>Guardar cambios</Btn>
      {dirty && <Btn variant="ghost" onClick={onReset}>Descartar</Btn>}
      {!dirty && <span className="text-[13px] text-soft">Todo guardado</span>}
    </div>
  );
}

function ToggleLine({ title, body, checked, onChange }: { title: string; body?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{title}</p>
        {body && <p className="text-[14px] text-mute">{body}</p>}
      </div>
      <Switch checked={checked} onChange={(v) => { haptic.select(); onChange(v); }} label={title} />
    </div>
  );
}

function NumberInput({ label, hint, value, onChange, min = 0, max = 999, suffix }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center rounded-xl border border-line-2 bg-white pr-3.5 focus-within:border-ink">
        <input
          inputMode="numeric"
          value={String(value)}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value.replace(/\D/g, '')) || 0)))}
          className="tnum w-full min-w-0 bg-transparent px-3.5 py-2.5 text-[16px] outline-none md:text-[15px]"
        />
        {suffix && <span className="shrink-0 text-[14px] text-mute">{suffix}</span>}
      </div>
    </Field>
  );
}

function useUploadHeaders() {
  const { tenant, token } = useAdmin();
  return { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant, Authorization: `Bearer ${token}` };
}

/* ------------------------------------ TV ------------------------------------ */

const TV_BLOCKS: [keyof TvCfg, string][] = [
  ['showQueue', 'Fila'], ['showAppointments', 'Citas del día'], ['showQr', 'QR para anotarse'], ['showClock', 'Reloj'], ['showPromos', 'Promociones'],
];

function TvEditor({ value, tvKey, nonce, onSave, onRotate }: { value: TvCfg; tvKey: string | null; nonce: number; onSave: (v: TvCfg) => Promise<boolean>; onRotate: () => void }) {
  const { tenant } = useAdmin();
  const headers = useUploadHeaders();
  const [d, setD, dirty, reset] = useDraft(value);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<'bg' | number>('bg');
  const tvUrl = tvKey ? tenantUrl(tenant, `/tv?k=${tvKey}`) : null;

  async function onFile(file: File) {
    const t = target.current;
    setUploading(String(t));
    try {
      const url = await uploadImage(file, 'tv', headers);
      if (t === 'bg') setD((p) => ({ ...p, backgroundUrl: url }));
      else setD((p) => ({ ...p, promos: p.promos.map((x, i) => (i === t ? { ...x, image: url } : x)) }));
    } catch {
      toast.error('No se pudo subir la imagen.');
    } finally {
      setUploading(null);
    }
  }
  const pick = (t: 'bg' | number) => { target.current = t; fileRef.current?.click(); };
  const setPromo = (i: number, p: Partial<Promo>) => setD((x) => ({ ...x, promos: x.promos.map((y, j) => (j === i ? { ...y, ...p } : y)) }));
  const movePromo = (i: number, dir: -1 | 1) => setD((x) => {
    const arr = [...x.promos];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return x;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...x, promos: arr };
  });

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      {/* Vista previa en vivo */}
      <div className="xl:order-2">
        <div className="xl:sticky xl:top-10">
          <p className="mb-2 text-[14px] font-medium">Vista previa</p>
          {tvUrl ? <TvPreview src={`${tvUrl}&preview=1`} nonce={nonce} /> : <div className="aspect-video animate-pulse rounded-xl bg-field" />}
          <p className="mt-2 text-[13px] text-soft">{dirty ? 'Guarda para ver tus cambios en la vista previa y en la TV.' : 'Así se ve ahora en la TV del local.'}</p>
          {tvUrl && (
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={tvUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink"><ExternalLink size={15} strokeWidth={1.75} /> Abrir en la TV</a>
              <Btn variant="secondary" className="min-h-11" onClick={() => navigator.clipboard.writeText(tvUrl).then(() => toast.success('Enlace de la TV copiado'), () => toast.error('No se pudo copiar.'))}><Copy size={15} strokeWidth={1.75} /> Copiar enlace</Btn>
              <Btn variant="ghost" className="min-h-11" onClick={onRotate}><RefreshCw size={15} strokeWidth={1.75} /> Renovar enlace</Btn>
            </div>
          )}
          <p className="mt-2 text-[13px] text-soft">Abre el enlace en el navegador del Smart TV o de un TV box. Guárdalo en favoritos.</p>
        </div>
      </div>

      <div className="min-w-0 space-y-6 xl:order-1">
        <div>
          <p className="mb-2 text-[14px] font-medium">Estilo</p>
          <Segmented value={d.theme} onChange={(v) => setD({ ...d, theme: v })} label="Estilo" options={[['dark', 'Oscuro'], ['light', 'Claro'], ['brand', 'Tu color']]} />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-medium">Distribución</p>
          <Segmented value={d.layout} onChange={(v) => setD({ ...d, layout: v })} label="Distribución" options={[['split', 'Tablero'], ['minimal', 'Número grande']]} />
        </div>
        <div>
          <p className="mb-2 text-[14px] font-medium">Qué mostrar</p>
          <div className="flex flex-wrap gap-2">
            {TV_BLOCKS.map(([k, label]) => {
              const on = !!d[k];
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => { haptic.select(); setD({ ...d, [k]: !on }); }} className={`min-h-11 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="divide-y divide-line border-y border-line">
          <ToggleLine title="Anunciar con voz" body='"Turno 12, Luis, con Carlos."' checked={d.announceVoice} onChange={(v) => setD({ ...d, announceVoice: v })} />
          <ToggleLine title="Sonido al llamar" body="Un timbre suave antes de cada llamado." checked={d.chime} onChange={(v) => setD({ ...d, chime: v })} />
        </div>
        <Field label="Mensaje que corre abajo" hint="Una promo, el wifi o tu Instagram. Déjalo vacío para no mostrarlo.">
          <input value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} maxLength={160} className={inputCls} placeholder="Martes y miércoles: corte + barba a S/ 35" />
        </Field>

        <div>
          <p className="mb-2 text-[14px] font-medium">Promociones en pantalla</p>
          {d.promos.length === 0 && <p className="mb-3 text-[14px] text-mute">Se muestran por turnos en la TV. Agrega tu primera promo.</p>}
          <ul className="space-y-3">
            {d.promos.map((p, i) => (
              <li key={i} className="rounded-xl border border-line p-3">
                <div className="flex gap-3">
                  <button type="button" onClick={() => pick(i)} className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-2 bg-field hover:border-ink" aria-label="Imagen de la promoción">
                    {uploading === String(i) ? <Loader2 size={18} className="animate-spin text-mute" /> : p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-full w-full object-cover" />
                    ) : <ImagePlus size={20} strokeWidth={1.5} className="text-mute" />}
                  </button>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input value={p.title} onChange={(e) => setPromo(i, { title: e.target.value })} maxLength={60} className={inputCls} placeholder="Título" aria-label="Título" />
                    <input value={p.text ?? ''} onChange={(e) => setPromo(i, { text: e.target.value })} maxLength={120} className={inputCls} placeholder="Detalle (opcional)" aria-label="Detalle" />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <IconBtn label="Subir" onClick={() => movePromo(i, -1)} disabled={i === 0}><ArrowUp size={16} strokeWidth={1.75} /></IconBtn>
                  <IconBtn label="Bajar" onClick={() => movePromo(i, 1)} disabled={i === d.promos.length - 1}><ArrowDown size={16} strokeWidth={1.75} /></IconBtn>
                  {p.image && <Btn variant="ghost" onClick={() => setPromo(i, { image: undefined })}>Quitar imagen</Btn>}
                  <span className="flex-1" />
                  <IconBtn label="Eliminar promoción" danger onClick={() => setD({ ...d, promos: d.promos.filter((_, j) => j !== i) })}><Trash2 size={16} strokeWidth={1.75} /></IconBtn>
                </div>
              </li>
            ))}
          </ul>
          {d.promos.length < 8 && (
            <Btn variant="secondary" className="mt-3" onClick={() => setD({ ...d, promos: [...d.promos, { title: '', text: '' }] })}><Plus size={16} strokeWidth={2} /> Agregar promoción</Btn>
          )}
        </div>

        <div>
          <p className="mb-2 text-[14px] font-medium">Fondo</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => pick('bg')} className="flex aspect-video w-40 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-2 bg-field hover:border-ink" aria-label="Imagen de fondo">
              {uploading === 'bg' ? <Loader2 size={18} className="animate-spin text-mute" /> : d.backgroundUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.backgroundUrl} alt="" className="h-full w-full object-cover" />
              ) : <span className="flex items-center gap-1.5 text-[13px] text-mute"><ImagePlus size={16} strokeWidth={1.5} /> Subir foto</span>}
            </button>
            {d.backgroundUrl && <Btn variant="ghost" onClick={() => setD({ ...d, backgroundUrl: '' })}>Quitar fondo</Btn>}
          </div>
        </div>

        <Field label={`Tamaño del texto: ${Math.round(d.scale * 100)}%`} hint="Súbelo si la TV está lejos de los sillones.">
          <input type="range" min={0.8} max={1.5} step={0.05} value={d.scale} onChange={(e) => setD({ ...d, scale: Number(e.target.value) })} className="w-full accent-[#0a0a0a]" />
        </Field>

        <SaveRow dirty={dirty} onReset={reset} onSave={() => onSave({ ...d, promos: d.promos.filter((p) => p.title.trim()).map((p) => ({ ...p, title: p.title.trim(), text: p.text?.trim() || undefined })) })} />
      </div>
    </div>
  );
}

/** La pantalla real, reducida al ancho disponible. */
function TvPreview({ src, nonce }: { src: string; nonce: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = w / 1920;
  return (
    <div ref={box} className="relative aspect-video overflow-hidden rounded-xl border border-line bg-ink">
      {w > 0 && (
        <iframe
          key={nonce}
          src={src}
          title="Vista previa de la TV"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: 1920, height: 1080, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${danger ? 'text-mute hover:bg-red-tint hover:text-red' : 'hover:bg-field'}`}>
      {children}
    </button>
  );
}

/* ------------------------------------ Fila ------------------------------------ */

function QueueEditor({ value, onSave }: { value: QueueCfg; onSave: (v: QueueCfg) => Promise<boolean> }) {
  const [d, setD, dirty, reset] = useDraft(value);
  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInput label="Máximo en espera" hint="Al llenarse, la fila se cierra sola." value={d.maxWaiting} min={1} max={200} onChange={(v) => setD({ ...d, maxWaiting: v })} suffix="personas" />
        <NumberInput label="Abrir antes de la hora" hint="Minutos antes de que abras el local." value={d.earlyMinutes} max={240} onChange={(v) => setD({ ...d, earlyMinutes: v })} suffix="min" />
      </div>
      <div className="divide-y divide-line border-y border-line">
        <ToggleLine title="Pedir celular" body="Para avisarle cuando le toque, aunque no tenga la página abierta." checked={d.askPhone} onChange={(v) => setD({ ...d, askPhone: v })} />
        <ToggleLine title="Elegir barbero" body="El cliente puede esperar a un barbero en especial." checked={d.allowStaffChoice} onChange={(v) => setD({ ...d, allowStaffChoice: v })} />
      </div>
      <Field label="Mensaje de bienvenida" hint="Aparece al anotarse en la fila.">
        <input value={d.welcome} onChange={(e) => setD({ ...d, welcome: e.target.value })} maxLength={160} className={inputCls} placeholder="Hay café y wifi mientras esperas." />
      </Field>
      <Field label="Mensaje con la fila cerrada">
        <input value={d.closedMessage} onChange={(e) => setD({ ...d, closedMessage: e.target.value })} maxLength={160} className={inputCls} />
      </Field>
      <SaveRow dirty={dirty} onReset={reset} onSave={() => onSave(d)} />
    </div>
  );
}

/* ----------------------------------- Música ----------------------------------- */

const TIP_OPTIONS = [0, 5, 10, 15, 20, 25];
const METHODS: [string, string][] = [['cash', 'Efectivo'], ['yape', 'Yape'], ['plin', 'Plin'], ['card', 'Tarjeta'], ['transfer', 'Transferencia']];

function PosEditor({ value, onSave }: { value: PosCfg; onSave: (v: PosCfg) => Promise<boolean> }) {
  const [d, setD, dirty, reset] = useDraft(value);
  const toggleTip = (t: number) => setD({ ...d, tipPresets: d.tipPresets.includes(t) ? d.tipPresets.filter((x) => x !== t) : [...d.tipPresets, t].sort((a, b) => a - b) });
  const toggleMethod = (m: string) => {
    if (d.methods.includes(m) && d.methods.length === 1) return toast.info('Deja al menos un medio de pago.');
    setD({ ...d, methods: d.methods.includes(m) ? d.methods.filter((x) => x !== m) : [...d.methods, m] });
  };
  const chip = (on: boolean) => `tnum min-h-11 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`;
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <p className="mb-2 text-[14px] font-medium">Propinas sugeridas</p>
        <div className="flex flex-wrap gap-2">
          {TIP_OPTIONS.map((t) => (
            <button key={t} type="button" aria-pressed={d.tipPresets.includes(t)} onClick={() => { haptic.select(); toggleTip(t); }} className={chip(d.tipPresets.includes(t))}>
              {t === 0 ? 'Sin propina' : `${t}%`}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[14px] font-medium">Medios de pago que aceptas</p>
        <div className="flex flex-wrap gap-2">
          {METHODS.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={d.methods.includes(m)} onClick={() => { haptic.select(); toggleMethod(m); }} className={chip(d.methods.includes(m))}>{label}</button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-line border-y border-line">
        <ToggleLine title="Abrir caja para cobrar" body="Pide el monto inicial al empezar el día y cuadra al cerrar." checked={d.requireSession} onChange={(v) => setD({ ...d, requireSession: v })} />
        <ToggleLine title="Recordar el comprobante" body="Al cobrar, pregunta si adjuntas la boleta o factura que emitiste." checked={d.askReceipt} onChange={(v) => setD({ ...d, askReceipt: v })} />
      </div>
      <SaveRow dirty={dirty} onReset={reset} onSave={() => onSave(d)} />
    </div>
  );
}

/* ---------------------------------- Marketing ---------------------------------- */

function MarketingEditor({ value, onSave }: { value: MktCfg; onSave: (v: MktCfg) => Promise<boolean> }) {
  const [d, setD, dirty, reset] = useDraft(value);
  return (
    <div className="max-w-2xl">
      <div className="divide-y divide-line border-y border-line">
        <div className="py-1">
          <ToggleLine title="Saludo de cumpleaños" body="Un correo con descuento en su semana de cumpleaños." checked={d.birthdayEnabled} onChange={(v) => setD({ ...d, birthdayEnabled: v })} />
          {d.birthdayEnabled && (
            <div className="grid gap-4 pb-4 sm:grid-cols-2">
              <NumberInput label="Descuento" value={d.birthdayDiscountPercent} max={100} onChange={(v) => setD({ ...d, birthdayDiscountPercent: v })} suffix="%" />
            </div>
          )}
        </div>
        <div className="py-1">
          <ToggleLine title="Invitar a volver" body="Si un cliente deja de venir, le escribimos con un descuento." checked={d.winbackEnabled} onChange={(v) => setD({ ...d, winbackEnabled: v })} />
          {d.winbackEnabled && (
            <div className="grid gap-4 pb-4 sm:grid-cols-2">
              <NumberInput label="Después de" value={d.winbackDays} min={7} max={365} onChange={(v) => setD({ ...d, winbackDays: v })} suffix="días sin venir" />
              <NumberInput label="Descuento" value={d.winbackDiscountPercent} max={100} onChange={(v) => setD({ ...d, winbackDiscountPercent: v })} suffix="%" />
            </div>
          )}
        </div>
        <ToggleLine title="Recordar renovar la membresía" body="Aviso unos días antes de que venza." checked={d.membershipRenewReminder} onChange={(v) => setD({ ...d, membershipRenewReminder: v })} />
      </div>
      <p className="mt-3 text-[13px] text-soft">Solo escribimos a clientes que aceptaron recibir novedades.</p>
      <SaveRow dirty={dirty} onReset={reset} onSave={() => onSave(d)} />
    </div>
  );
}

/* ----------------------------------- Google ----------------------------------- */

function GoogleEditor({ value, onSave }: { value: string; onSave: (v: string) => Promise<boolean> }) {
  const [d, setD, dirty, reset] = useDraft(value);
  const clean = d.trim();
  const valid = !clean || /^https:\/\/\S+$/.test(clean);
  return (
    <div className="max-w-2xl space-y-4">
      <Field label="Enlace para dejar reseña" hint={valid ? undefined : 'El enlace debe empezar con https://'}>
        <input type="url" inputMode="url" value={d} onChange={(e) => setD(e.target.value)} autoCapitalize="none" spellCheck={false} className={inputCls} placeholder="https://g.page/r/..." />
      </Field>
      <div className="rounded-xl bg-field p-4 text-[14px] text-mute">
        <p className="font-medium text-ink">Cómo conseguir tu enlace</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Busca tu barbería en Google desde la cuenta con la que administras tu Perfil de Empresa.</li>
          <li>Toca Pedir reseñas (o Conseguir más reseñas).</li>
          <li>Copia el enlace que aparece y pégalo aquí.</li>
        </ol>
        {clean && valid && (
          <a href={clean} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-medium text-ink underline underline-offset-4">Probar enlace <ExternalLink size={14} strokeWidth={1.75} /></a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <SaveInline disabled={!dirty || !valid} onSave={() => onSave(clean)} />
        {dirty && <Btn variant="ghost" onClick={reset}>Descartar</Btn>}
      </div>
    </div>
  );
}

function SaveInline({ disabled, onSave }: { disabled: boolean; onSave: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  return <Btn onClick={async () => { setBusy(true); await onSave(); setBusy(false); }} busy={busy} disabled={disabled}>Guardar enlace</Btn>;
}
