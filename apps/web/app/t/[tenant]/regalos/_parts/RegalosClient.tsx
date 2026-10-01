'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Gift, Package, CalendarHeart, Send, Smartphone, CreditCard, Wallet, Loader2, CircleCheck, CircleAlert, Check, Clock, Scissors, Info,
} from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { onColor } from '@/lib/color';
import { soles, type TenantSite } from '@/lib/api';
import { Toaster } from '@/components/Toaster';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { GiftPreview } from './GiftPreview';
import { packageSavings, type Provider, type Shop, type ShopPackage } from './types';

type Tab = 'gift' | 'packages';
interface Buyer { name: string; email: string; phone: string }
interface Done { kind: 'gift_card' | 'package'; title: string; body: string }

const TZ = 'America/Lima';
const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
const toPhone = (v: string) => (v.trim().startsWith('+') ? v.trim().replace(/[^\d+]/g, '') : `+51${v.replace(/\D/g, '').slice(-9)}`);
const limaIso = (offsetDays: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + offsetDays * 864e5));
const longDate = (iso: string) => new Date(`${iso}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

const fld = 'w-full rounded-xl border border-line-2 bg-white px-4 py-3.5 text-[16px] outline-none transition-colors focus:border-ink';

const METHODS: Array<[Provider, string, string, typeof Smartphone]> = [
  ['mercadopago', 'Yape o Plin', 'Con MercadoPago', Smartphone],
  ['culqi', 'Tarjeta de débito o crédito', 'Con Culqi', CreditCard],
  ['paypal', 'PayPal', 'Se cobra en dólares', Wallet],
];

const ERRORS: Record<string, string> = {
  no_disponible: 'Esta opción ya no está disponible en la barbería.',
  paquete_no_encontrado: 'Ese paquete ya no está a la venta.',
};

export function RegalosClient({ tenant, site, shop }: { tenant: string; site: TenantSite; shop: Shop }) {
  const params = useSearchParams();
  const accent = site.branding?.color_primary ?? '#0a0a0a';
  const onAccent = onColor(accent);
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant }), [tenant]);
  const gc = shop.giftCards;
  const packages = shop.packages ?? [];
  const hasGift = !!gc;
  const hasPackages = packages.length > 0;
  const available = site.tenant.available !== false;

  const [tab, setTab] = useState<Tab>(hasGift ? 'gift' : 'packages');
  const [done, setDone] = useState<Done | null>(null);
  const [payResult, setPayResult] = useState<'ok' | 'error' | null>(null);

  // Datos del comprador (se recuerdan como en la reserva)
  const [buyer, setBuyer] = useState<Buyer>({ name: '', email: '', phone: '' });
  const [method, setMethod] = useState<Provider>('mercadopago');
  const [busy, setBusy] = useState(false);

  // Gift card
  const amounts = gc?.amounts ?? [];
  const [amount, setAmount] = useState<number>(amounts[1] ?? amounts[0] ?? 5000);
  const [custom, setCustom] = useState('');
  const [customOn, setCustomOn] = useState(false);
  const [to, setTo] = useState({ name: '', email: '' });
  const [message, setMessage] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [deliverOn, setDeliverOn] = useState('');

  // Paquete elegido
  const [pkg, setPkg] = useState<ShopPackage | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('datepe_cliente') ?? 'null');
      if (saved) setBuyer((b) => ({ name: saved.name ?? b.name, email: saved.email ?? b.email, phone: saved.phone ?? b.phone }));
    } catch { /* */ }
  }, []);

  // Desde "Mi cuenta": ?tipo=paquetes abre directo los paquetes
  useEffect(() => {
    if (params.get('tipo') === 'paquetes' && hasPackages) setTab('packages');
  }, [params, hasPackages]);

  // Vuelta del pago: ?pago=ok o ?pago=error
  useEffect(() => {
    const pago = params.get('pago');
    if (pago !== 'ok' && pago !== 'error') return;
    setPayResult(pago);
    if (pago === 'ok') haptic.success();
    else haptic.error();
    const next = new URLSearchParams(window.location.search);
    next.delete('pago');
    const qs = next.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [params]);

  const customCents = Math.round(Number(custom.replace(',', '.')) * 100);
  const giftCents = customOn ? customCents : amount;
  const giftOk = !!gc && Number.isFinite(giftCents) && giftCents >= gc.min && giftCents <= gc.max;
  const buyerOk = !!buyer.name.trim() && isEmail(buyer.email) && buyer.phone.replace(/\D/g, '').length >= 9;
  const toOk = !!to.name.trim() && (!to.email.trim() || isEmail(to.email));
  const minDate = limaIso(1);
  const maxDate = limaIso(365);
  const dateOk = !schedule || (!!deliverOn && deliverOn >= minDate && deliverOn <= maxDate);

  async function buy(body: Record<string, unknown>, success: Done) {
    setBusy(true);
    haptic.tap();
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/shop/buy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, provider: method, buyer: { name: buyer.name.trim(), email: buyer.email.trim(), phone: toPhone(buyer.phone) } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(ERRORS[d.error as string] ?? 'Revisa los datos e intenta de nuevo.');
        return;
      }
      try {
        localStorage.setItem('datepe_cliente', JSON.stringify({ name: buyer.name.trim(), phone: buyer.phone, email: buyer.email.trim() }));
      } catch { /* */ }
      if (d.redirectUrl) {
        window.location.href = d.redirectUrl as string;
        return;
      }
      if (d.devSimulated && d.devConfirmUrl) {
        const ok = await fetch(`${API_BASE_CLIENT}${d.devConfirmUrl}`, { method: 'POST', headers, body: '{}' }).then((r) => r.ok).catch(() => false);
        if (!ok) {
          toast.error('No pudimos confirmar el pago. Intenta de nuevo.');
          return;
        }
        setPkg(null);
        setDone(success);
        haptic.success();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      toast.error('No pudimos iniciar el pago. Intenta con otro medio.');
    } catch {
      toast.error('Sin conexión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function buyGift(e?: React.FormEvent) {
    e?.preventDefault();
    if (!giftOk) return toast.error(`Elige un monto entre ${soles(gc?.min ?? 0)} y ${soles(gc?.max ?? 0)}.`);
    if (!toOk) return toast.error('Escribe el nombre de quien recibe el regalo.');
    if (!dateOk) return toast.error('Elige una fecha de envío desde mañana.');
    if (!buyerOk) return toast.error('Completa tu nombre, correo y celular.');
    const recipientEmail = to.email.trim() || buyer.email.trim();
    const when = schedule && deliverOn ? `el ${longDate(deliverOn)}` : 'en unos minutos';
    buy(
      {
        kind: 'gift_card',
        amountCents: giftCents,
        recipient: { name: to.name.trim(), ...(to.email.trim() ? { email: to.email.trim() } : {}), ...(message.trim() ? { message: message.trim() } : {}) },
        ...(schedule && deliverOn ? { deliverAt: `${deliverOn}T09:00:00-05:00` } : {}),
      },
      {
        kind: 'gift_card',
        title: 'Tu regalo está listo.',
        body: `La gift card de ${soles(giftCents)} para ${to.name.trim()} llega a ${recipientEmail} ${when}. Te enviamos el comprobante a ${buyer.email.trim()}.`,
      },
    );
  }

  function buyPackage() {
    if (!pkg) return;
    if (!buyerOk) return toast.error('Completa tu nombre, correo y celular.');
    buy(
      { kind: 'package', packageId: pkg.id },
      {
        kind: 'package',
        title: 'Tu paquete está listo.',
        body: `${pkg.name} quedó a tu nombre con el celular ${buyer.phone.replace(/\D/g, '').slice(-9)}. Úsalo al reservar o al pagar en el local. Te enviamos el comprobante a ${buyer.email.trim()}.`,
      },
    );
  }

  const nothing = !hasGift && !hasPackages;

  return (
    <div style={{ ['--accent' as string]: accent }}>
      <Toaster />
      <header className="pt-safe sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-5 md:px-8">
          <Link href="/" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-field" aria-label={`Volver a ${site.tenant.name}`}>
            <ArrowLeft size={20} strokeWidth={1.75} />
          </Link>
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {site.branding?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.branding.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold" style={{ background: accent, color: onAccent }}>
                {site.tenant.name.replace(/^Barber[ií]a\s+/i, '').charAt(0)}
              </span>
            )}
            <span className="truncate text-[16px] font-semibold tracking-[-0.02em]">{site.tenant.name}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 pb-36 pt-8 md:px-8 md:pb-20">
        {payResult === 'ok' && !done && (
          <div className="rise-in mb-8 flex items-start gap-3 rounded-xl bg-ok-tint p-4 text-[15px] text-ok">
            <CircleCheck size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <p>
              <span className="font-medium">Pago recibido. Gracias por tu compra.</span> Te enviamos el comprobante por correo. Si es una gift card, llega a quien la recibe en la fecha que elegiste.
            </p>
          </div>
        )}
        {payResult === 'error' && (
          <div className="rise-in mb-8 flex items-start gap-3 rounded-xl bg-red-tint p-4 text-[15px] text-red-deep">
            <CircleAlert size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <p>
              <span className="font-medium">El pago no se completó.</span> No se hizo ningún cobro. Puedes intentarlo de nuevo con otro medio.
            </p>
          </div>
        )}

        {done ? (
          <section className="rise-in mx-auto max-w-lg py-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok-tint text-ok">
              <CircleCheck size={28} strokeWidth={1.75} />
            </span>
            <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{done.title}</h1>
            <p className="mt-3 text-[17px] text-mute">{done.body}</p>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => { setDone(null); setTo({ name: '', email: '' }); setMessage(''); setSchedule(false); setDeliverOn(''); }}
                className="min-h-[48px] rounded-lg border border-line px-6 text-[15px] font-medium hover:border-ink"
              >
                Hacer otro regalo
              </button>
              {available && (
                <Link href="/reservar" className="flex min-h-[48px] items-center justify-center rounded-lg px-6 text-[15px] font-medium" style={{ background: accent, color: onAccent }}>
                  Reservar una cita
                </Link>
              )}
            </div>
          </section>
        ) : (
          <>
            <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Regala un corte en {site.tenant.name}</h1>
            <p className="mt-2 max-w-[56ch] text-[17px] text-mute">
              {hasGift && hasPackages
                ? 'Una gift card que llega por correo, o un paquete de cortes a mejor precio. Se paga en línea y se usa al reservar.'
                : hasGift
                  ? 'Una gift card que llega por correo con un mensaje tuyo. Se paga en línea y se usa al reservar o en caja.'
                  : 'Paquetes de cortes a mejor precio para ti o para regalar. Se pagan en línea y se usan al reservar.'}
            </p>

            {nothing && (
              <div className="mt-10 max-w-xl rounded-xl bg-field p-6">
                <Gift size={26} strokeWidth={1.5} className="text-soft" />
                <p className="mt-4 text-[17px] font-medium tracking-[-0.02em]">Por ahora no hay regalos a la venta en línea.</p>
                <p className="mt-1 text-[15px] text-mute">
                  Pregunta en la barbería por gift cards y paquetes{site.branding?.whatsapp ? ', o escríbeles por WhatsApp' : ''}. Mientras tanto, puedes reservar tu cita.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {available && (
                    <Link href="/reservar" className="inline-flex min-h-[44px] items-center rounded-full px-5 text-[15px] font-medium" style={{ background: accent, color: onAccent }}>
                      Reservar
                    </Link>
                  )}
                  {site.branding?.whatsapp && (
                    <a
                      href={`https://wa.me/${site.branding.whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hola, quisiera comprar una gift card.')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-white px-5 text-[15px] font-medium hover:border-ink"
                    >
                      Escribir por WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )}

            {hasGift && hasPackages && (
              <div className="mt-8 inline-flex rounded-full bg-field p-1" role="tablist" aria-label="Tipo de regalo">
                {([['gift', 'Gift card', Gift], ['packages', 'Paquetes', Package]] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => { haptic.select(); setTab(id); }}
                    className={`flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[15px] font-medium transition-colors ${tab === id ? 'bg-white text-ink shadow-[0_1px_3px_rgb(10_10_10/0.12)]' : 'text-mute hover:text-ink'}`}
                  >
                    <Icon size={16} strokeWidth={1.75} /> {label}
                  </button>
                ))}
              </div>
            )}

            {/* ------------------------- Gift card ------------------------- */}
            {hasGift && tab === 'gift' && gc && (
              <div className="mt-8 grid gap-10 lg:grid-cols-12">
                <form id="gift-form" onSubmit={buyGift} className="space-y-10 lg:col-span-7" noValidate>
                  <fieldset className="min-w-0">
                    <legend className="text-[21px] font-semibold tracking-[-0.025em]">Monto</legend>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {gc.amounts.map((a) => {
                        const on = !customOn && amount === a;
                        return (
                          <button
                            key={a}
                            type="button"
                            aria-pressed={on}
                            onClick={() => { haptic.select(); setCustomOn(false); setAmount(a); }}
                            className={`tnum min-h-[48px] min-w-[84px] rounded-xl border px-4 text-[16px] font-medium transition-all ${on ? '-translate-y-0.5 border-ink bg-ink text-white shadow-lift' : 'border-line hover:border-ink'}`}
                          >
                            S/ {a / 100}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        aria-pressed={customOn}
                        onClick={() => { haptic.select(); setCustomOn(true); }}
                        className={`min-h-[48px] rounded-xl border px-4 text-[16px] font-medium transition-all ${customOn ? '-translate-y-0.5 border-ink bg-ink text-white shadow-lift' : 'border-line hover:border-ink'}`}
                      >
                        Otro monto
                      </button>
                    </div>
                    {customOn && (
                      <label className="rise-in mt-4 block max-w-xs">
                        <span className="mb-1.5 block text-[14px] font-medium">Monto en soles</span>
                        <div className="flex items-center rounded-xl border border-line-2 focus-within:border-ink">
                          <span className="tnum border-r border-line pl-4 pr-3 text-[16px] text-mute">S/</span>
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={custom}
                            onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, ''))}
                            className="tnum w-full bg-transparent px-3 py-3.5 text-[16px] outline-none"
                            placeholder={String(gc.min / 100)}
                          />
                        </div>
                        <span className={`mt-1 block text-[13px] ${custom && !giftOk ? 'text-red' : 'text-soft'}`}>
                          Entre {soles(gc.min)} y {soles(gc.max)}.
                        </span>
                      </label>
                    )}
                  </fieldset>

                  <fieldset className="space-y-4">
                    <legend className="text-[21px] font-semibold tracking-[-0.025em]">Para quién es</legend>
                    <label className="mt-4 block">
                      <span className="mb-1.5 block text-[14px] font-medium">Su nombre</span>
                      <input value={to.name} onChange={(e) => setTo({ ...to, name: e.target.value })} maxLength={80} autoComplete="off" className={fld} placeholder="Ej. Papá, Diego" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[14px] font-medium">Su correo (opcional)</span>
                      <input value={to.email} onChange={(e) => setTo({ ...to, email: e.target.value })} type="email" inputMode="email" autoComplete="off" autoCapitalize="off" className={fld} placeholder="correo@ejemplo.com" />
                      <span className={`mt-1 block text-[13px] ${to.email && !isEmail(to.email) ? 'text-red' : 'text-soft'}`}>
                        {to.email && !isEmail(to.email) ? 'Revisa el correo.' : 'Si lo dejas vacío, te la enviamos a ti para que se la entregues.'}
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 flex items-baseline justify-between text-[14px] font-medium">
                        Mensaje (opcional) <span className="tnum text-[13px] font-normal text-soft">{message.length}/300</span>
                      </span>
                      <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 300))} rows={3} className={`resize-none ${fld}`} placeholder="Feliz cumpleaños. Este corte va por mi cuenta." />
                    </label>
                  </fieldset>

                  <fieldset className="min-w-0">
                    <legend className="text-[21px] font-semibold tracking-[-0.025em]">Cuándo la recibe</legend>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {([[false, 'Ahora', 'Llega en unos minutos', Send], [true, 'En una fecha', 'Envíala el día de su cumpleaños', CalendarHeart]] as const).map(([v, label, hint, Icon]) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={schedule === v}
                          onClick={() => { haptic.select(); setSchedule(v); }}
                          className={`flex min-h-[64px] items-center gap-3 rounded-xl border p-4 text-left transition-colors ${schedule === v ? 'border-ink bg-field' : 'border-line hover:border-ink'}`}
                        >
                          <Icon size={20} strokeWidth={1.75} className="shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-[15px] font-medium">{label}</span>
                            <span className="block text-[13px] text-mute">{hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {schedule && (
                      <label className="rise-in mt-4 block max-w-xs">
                        <span className="mb-1.5 block text-[14px] font-medium">Fecha de envío</span>
                        <input type="date" min={minDate} max={maxDate} value={deliverOn} onChange={(e) => setDeliverOn(e.target.value)} className={fld} />
                        <span className="mt-1 block text-[13px] text-soft">{deliverOn ? `Sale a las 9:00 del ${longDate(deliverOn)}.` : 'Sale a las 9:00 de ese día, hora de Lima.'}</span>
                      </label>
                    )}
                  </fieldset>

                  <BuyerFields buyer={buyer} setBuyer={setBuyer} />
                  <MethodPicker method={method} setMethod={setMethod} />

                  <button
                    type="submit"
                    disabled={busy}
                    className="hidden min-h-[52px] w-full items-center justify-center gap-2 rounded-lg text-[16px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40 lg:flex"
                    style={{ background: accent, color: onAccent }}
                  >
                    {busy && <Loader2 size={18} className="animate-spin" />} Pagar {giftOk ? soles(giftCents) : ''}
                  </button>
                </form>

                <aside className="order-first lg:order-none lg:col-span-5">
                  <div className="lg:sticky lg:top-24">
                    <GiftPreview
                      shopName={site.tenant.name}
                      logoUrl={site.branding?.logo_url ?? null}
                      accent={accent}
                      amountCents={giftOk ? giftCents : customOn ? 0 : amount}
                      to={to.name}
                      from={buyer.name}
                      message={message}
                      deliverOn={schedule && deliverOn ? deliverOn : null}
                    />
                    <ul className="mt-5 hidden space-y-2 text-[14px] text-mute lg:block">
                      <li className="flex items-start gap-2"><Check size={16} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: accent }} /> Se usa al reservar en línea o al pagar en el local.</li>
                      <li className="flex items-start gap-2"><Check size={16} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: accent }} /> Si no gasta todo, el saldo queda para la próxima.</li>
                      <li className="flex items-start gap-2"><Check size={16} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: accent }} /> Llega por correo con su código y un botón para reservar.</li>
                    </ul>
                  </div>
                </aside>
              </div>
            )}

            {/* ------------------------- Paquetes ------------------------- */}
            {hasPackages && tab === 'packages' && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {packages.map((p) => {
                  const { regular, savings, covered } = packageSavings(p, shop.services);
                  return (
                    <article key={p.id} className="flex flex-col rounded-xl border border-line p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{p.name}</h2>
                        {savings > 0 && (
                          <span className="tnum shrink-0 rounded-full bg-ok-tint px-2.5 py-1 text-[12px] font-medium text-ok">Ahorras {soles(savings).replace('.00', '')}</span>
                        )}
                      </div>
                      {p.description && <p className="mt-1 text-[14px] text-mute">{p.description}</p>}
                      <div className="mt-4 flex items-baseline gap-2">
                        <span className="tnum text-[28px] font-semibold tracking-[-0.03em]">{soles(p.price_cents)}</span>
                        {savings > 0 && <span className="tnum text-[15px] text-soft line-through">{soles(regular)}</span>}
                      </div>
                      <ul className="mt-4 flex-1 space-y-2 text-[14px]">
                        <li className="flex items-start gap-2">
                          <Scissors size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mute" />
                          {p.uses} {p.uses === 1 ? 'uso' : 'usos'}{covered.length ? ` en ${covered.join(' o ').toLowerCase()}` : ''}
                        </li>
                        {p.valid_days ? (
                          <li className="flex items-start gap-2">
                            <Clock size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mute" />
                            Vale {p.valid_days >= 60 && p.valid_days % 30 === 0 ? `${p.valid_days / 30} meses` : `${p.valid_days} días`} desde la compra
                          </li>
                        ) : null}
                      </ul>
                      <button
                        type="button"
                        onClick={() => { haptic.tap(); setPkg(p); }}
                        className="mt-5 min-h-[48px] rounded-lg text-[15px] font-medium transition-opacity hover:opacity-90"
                        style={{ background: accent, color: onAccent }}
                      >
                        Comprar
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            {hasPackages && tab === 'packages' && (
              <p className="mt-6 flex items-start gap-2 text-[14px] text-mute">
                <Info size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                El paquete queda a nombre del celular con el que lo compras. Cada visita descuenta un uso.
              </p>
            )}
          </>
        )}
      </main>

      {/* Barra de pago en el teléfono */}
      {!done && hasGift && tab === 'gift' && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-line bg-white/95 px-5 pt-3 backdrop-blur-md lg:hidden">
          <div className="min-w-0">
            <div className="tnum text-[16px] font-semibold">{giftOk ? soles(giftCents) : 'Elige un monto'}</div>
            <div className="truncate text-[13px] text-mute">{to.name.trim() ? `Gift card para ${to.name.trim()}` : 'Gift card'}</div>
          </div>
          <button
            type="submit"
            form="gift-form"
            disabled={busy}
            className="flex min-h-[48px] shrink-0 items-center gap-2 rounded-lg px-6 text-[16px] font-medium disabled:opacity-40"
            style={{ background: accent, color: onAccent }}
          >
            {busy && <Loader2 size={18} className="animate-spin" />} Pagar
          </button>
        </div>
      )}

      <Sheet
        open={!!pkg}
        onClose={() => setPkg(null)}
        title={pkg ? pkg.name : 'Paquete'}
        footer={
          <button
            type="button"
            onClick={buyPackage}
            disabled={busy}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg text-[16px] font-medium disabled:opacity-40"
            style={{ background: accent, color: onAccent }}
          >
            {busy && <Loader2 size={18} className="animate-spin" />} Pagar {pkg ? soles(pkg.price_cents) : ''}
          </button>
        }
      >
        {pkg && (
          <div className="space-y-8">
            <div className="flex items-center justify-between rounded-xl bg-field p-4 text-[15px]">
              <span>{pkg.uses} {pkg.uses === 1 ? 'uso' : 'usos'}</span>
              <span className="tnum font-semibold">{soles(pkg.price_cents)}</span>
            </div>
            <BuyerFields buyer={buyer} setBuyer={setBuyer} />
            <MethodPicker method={method} setMethod={setMethod} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

function BuyerFields({ buyer, setBuyer }: { buyer: Buyer; setBuyer: (b: Buyer) => void }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-[21px] font-semibold tracking-[-0.025em]">Tus datos</legend>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[14px] font-medium">Tu nombre</span>
        <input value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} maxLength={80} autoComplete="name" className={fld} placeholder="Nombre y apellido" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-medium">Tu correo</span>
        <input value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} type="email" inputMode="email" autoComplete="email" autoCapitalize="off" className={fld} placeholder="Para enviarte el comprobante" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[14px] font-medium">Tu celular</span>
        <div className="flex items-center rounded-xl border border-line-2 focus-within:border-ink">
          <span className="tnum border-r border-line pl-4 pr-3 text-[16px] text-mute">+51</span>
          <input value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} inputMode="tel" autoComplete="tel-national" className="tnum w-full bg-transparent px-3 py-3.5 text-[16px] outline-none" placeholder="987 654 321" />
        </div>
      </label>
    </fieldset>
  );
}

function MethodPicker({ method, setMethod }: { method: Provider; setMethod: (m: Provider) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-[21px] font-semibold tracking-[-0.025em]">Cómo pagas</legend>
      <div className="mt-4 space-y-2" role="radiogroup">
        {METHODS.map(([id, label, hint, Icon]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={method === id}
            onClick={() => { haptic.select(); setMethod(id); }}
            className={`flex min-h-[60px] w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors ${method === id ? 'border-ink bg-field' : 'border-line hover:border-ink'}`}
          >
            <Icon size={20} strokeWidth={1.75} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{label}</span>
              <span className="block text-[13px] text-mute">{hint}</span>
            </span>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${method === id ? 'border-ink bg-ink' : 'border-line-2'}`} aria-hidden>
              {method === id && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
