'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Receipt, Sparkles, CircleCheck } from 'lucide-react';
import { useApi, soles } from './api';
import { PageHead, Btn, Empty, Skeleton } from './ui';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

export interface Billing {
  status: 'trial' | 'active' | 'suspended' | 'cancelled';
  isDemo: boolean;
  trialEndsAt: string | null;
  paidUntil: string | null;
  activeUntil: string | null;
  daysLeft: number | null;
  monthlyPriceCents: number;
  needsPayment: boolean;
  suspended: boolean;
}
interface Invoice { id: string; amount_cents: number; months: number; status: string; provider: string | null; paid_at: string | null; period_start: string | null; period_end: string | null; created_at: string }
type Provider = 'mercadopago' | 'paypal' | 'culqi';

/** Evento que avisa a la barra del panel que el estado del plan cambió. */
export const BILLING_EVENT = 'datepe:billing';

const MONTHS = [1, 3, 6, 12] as const;
const PROVIDERS: { id: Provider; name: string; body: string }[] = [
  { id: 'mercadopago', name: 'MercadoPago', body: 'Tarjeta, Yape o saldo de MercadoPago' },
  { id: 'paypal', name: 'PayPal', body: 'Tarjeta internacional o cuenta PayPal' },
  { id: 'culqi', name: 'Culqi', body: 'Tarjeta de débito o crédito' },
];
const PROVIDER_NAME: Record<string, string> = { mercadopago: 'MercadoPago', paypal: 'PayPal', culqi: 'Culqi', manual: 'Pago manual' };

export const fechaLima = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', ...opts });

export const diasTexto = (n: number) => (n === 1 ? '1 día' : `${n} días`);

function statusOf(b: Billing): [string, string] {
  if (b.suspended || b.status === 'cancelled') return ['En pausa', 'bg-red-tint text-red-deep'];
  if (b.status === 'trial') return ['En prueba', 'bg-[#e8eefb] text-[#1d3f94]'];
  return ['Activo', 'bg-ok-tint text-ok'];
}

export function Facturacion() {
  const api = useApi();
  const [data, setData] = useState<{ billing: Billing | null; invoices: Invoice[] } | null>(null);
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(1);
  const [provider, setProvider] = useState<Provider>('mercadopago');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ billing: Billing | null; invoices: Invoice[] }>('/admin/billing').then(setData).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    window.addEventListener(BILLING_EVENT, load);
    return () => window.removeEventListener(BILLING_EVENT, load);
  }, [load]);

  async function pay() {
    haptic.tap();
    setBusy(true);
    try {
      const r = await api<{ redirectUrl?: string; devSimulated: boolean; devConfirmUrl?: string }>('/admin/billing/checkout', { method: 'POST', body: { provider, months } });
      if (r.redirectUrl) {
        window.location.href = r.redirectUrl;
        return;
      }
      if (r.devSimulated && r.devConfirmUrl) {
        // Con sesión: el API solo deja confirmar el cobro de esta barbería
        await api(r.devConfirmUrl.replace(/^\/api/, ''), { method: 'POST', body: {} });
        toast.success('Pago de prueba registrado. Tu plan está al día.');
        await load();
        window.dispatchEvent(new Event(BILLING_EVENT));
      } else {
        toast.error('Este medio de pago no está disponible por ahora. Elige otro.');
      }
    } catch {
      toast.error('No pudimos iniciar el pago. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const b = data?.billing ?? null;
  const price = b?.monthlyPriceCents ?? 5000;

  return (
    <>
      <PageHead title="Facturación" sub="Tu plan de date.pe y el historial de tus pagos." />
      {!data ? <Skeleton rows={3} /> : (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            {/* Plan */}
            <section className="rounded-xl border border-line p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[15px] font-medium">Plan date.pe</p>
                  <p className="tnum mt-1 text-[32px] font-semibold leading-none tracking-[-0.035em]">
                    {soles(price).replace('.00', '')} <span className="text-[15px] font-normal tracking-normal text-mute">al mes</span>
                  </p>
                </div>
                {b && <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${statusOf(b)[1]}`}>{statusOf(b)[0]}</span>}
              </div>
              <p className="mt-3 text-[15px] text-mute">Todo incluido: página de reservas, agenda, recordatorios, cobro del adelanto, clientes, promociones y reportes.</p>
              {b && (
                <div className="mt-5 border-t border-line pt-4 text-[15px]">
                  {b.isDemo ? (
                    <p className="text-mute">Barbería de demostración, sin fecha de vencimiento.</p>
                  ) : b.suspended ? (
                    <p className="text-red-deep">Tu página de reservas está en pausa. Paga para reactivarla al instante.</p>
                  ) : b.activeUntil ? (
                    <p>
                      Activa hasta el <span className="font-medium">{fechaLima(b.activeUntil)}</span>
                      {b.daysLeft !== null && <span className="text-mute">, {b.daysLeft > 0 ? `quedan ${diasTexto(b.daysLeft)}` : 'vence hoy'}</span>}
                    </p>
                  ) : (
                    <p className="text-mute">Aún no tienes pagos registrados.</p>
                  )}
                </div>
              )}
            </section>

            {b?.isDemo ? (
              <div className="flex gap-3 rounded-xl bg-field p-5">
                <Sparkles size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-mute" />
                <p className="text-[15px] text-mute">Esta es una barbería de demostración, así que no paga el plan. Las barberías reales pagan aquí con MercadoPago, PayPal o Culqi.</p>
              </div>
            ) : (
              <section className="rounded-xl border border-line p-5 md:p-6">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Pagar tu plan</h2>
                <p className="mt-1 text-[14px] text-mute">Se suma a tu fecha actual, no pierdes los días que te quedan.</p>

                <p className="mb-2 mt-5 text-[14px] font-medium">Meses</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Meses a pagar">
                  {MONTHS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={months === m}
                      onClick={() => { haptic.select(); setMonths(m); }}
                      className={`flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors ${months === m ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink'}`}
                    >
                      <span className="text-[15px] font-medium">{m === 1 ? '1 mes' : `${m} meses`}</span>
                      <span className={`tnum text-[13px] ${months === m ? 'text-white/75' : 'text-mute'}`}>{soles(price * m)}</span>
                    </button>
                  ))}
                </div>

                <p className="mb-2 mt-6 text-[14px] font-medium">Medio de pago</p>
                <div className="space-y-2" role="radiogroup" aria-label="Medio de pago">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={provider === p.id}
                      onClick={() => { haptic.select(); setProvider(p.id); }}
                      className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${provider === p.id ? 'border-ink bg-field' : 'border-line hover:border-ink'}`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${provider === p.id ? 'border-ink' : 'border-line-2'}`} aria-hidden>
                        {provider === p.id && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium">{p.name}</span>
                        <span className="block text-[13px] text-mute">{p.body}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <Btn onClick={pay} busy={busy} className="mt-6 w-full py-3.5 text-[16px]">
                  <CreditCard size={18} strokeWidth={1.75} /> Pagar {soles(price * months)}
                </Btn>
              </section>
            )}
          </div>

          {/* Historial */}
          <section className="lg:col-span-5">
            <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">Historial de pagos</h2>
            {data.invoices.length === 0 ? (
              <Empty icon={Receipt} title="Sin pagos todavía" body="Aquí verás cada pago de tu plan con su fecha y medio de pago." />
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {data.invoices.map((i) => {
                  const paid = i.status === 'paid';
                  return (
                    <li key={i.id} className="flex items-center gap-3 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium">{fechaLima(i.paid_at ?? i.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        <p className="text-[13px] text-mute">
                          {i.months === 1 ? '1 mes' : `${i.months} meses`}{i.provider ? `, ${PROVIDER_NAME[i.provider] ?? i.provider}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum text-[15px] font-medium">{soles(i.amount_cents)}</p>
                        {paid ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ok"><CircleCheck size={13} strokeWidth={2} /> Pagado</span>
                        ) : (
                          <span className="text-[12px] text-soft">Pendiente</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
