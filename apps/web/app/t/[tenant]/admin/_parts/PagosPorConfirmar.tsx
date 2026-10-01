'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X, Loader2, ReceiptText, CalendarClock, Gift, Package } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { useAdmin, useApi, soles } from './api';

interface Pending {
  id: string; amount_cents: number; method: string; purpose: string; created_at: string; appointment_id: string | null;
  client_name: string | null; client_phone: string | null; starts_at: string | null; staff_name: string | null; services: string | null; detail: string | null;
}

const REASONS = ['No me llegó el pago', 'El monto está incompleto', 'La captura no es válida'];
const when = (iso: string) => new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });

/** Captura del pago: se pide con la sesión del panel, nunca es un enlace público. */
function useReceipt(id: string | null) {
  const { tenant, token } = useAdmin();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let u: string | null = null;
    let alive = true;
    fetch(`${API_BASE_CLIENT}/api/admin/payments/${id}/receipt`, { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': tenant } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } })
      .catch(() => {});
    return () => { alive = false; if (u) URL.revokeObjectURL(u); setUrl(null); };
  }, [id, tenant, token]);
  return url;
}

function Thumb({ id }: { id: string }) {
  const url = useReceipt(id);
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" />
    : <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-white"><ReceiptText size={18} strokeWidth={1.6} className="text-soft" /></span>;
}

/**
 * Adelantos y compras que el cliente pagó por Yape o Plin directo a la barbería. Aquí se mira
 * la captura y se confirma (la cita queda confirmada o se activa la compra) o se rechaza.
 */
export function PagosPorConfirmar() {
  const api = useApi();
  const [items, setItems] = useState<Pending[] | null>(null);
  const [open, setOpen] = useState<Pending | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const big = useReceipt(open?.id ?? null);

  const load = useCallback(() => {
    api<{ payments: Pending[] }>('/admin/payments/pending').then((d) => setItems(d.payments)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function act(p: Pending, kind: 'confirm' | 'reject', reason?: string) {
    setBusy(true);
    try {
      await api(`/admin/payments/${p.id}/${kind}`, { method: 'POST', body: kind === 'reject' ? { reason } : {} });
      haptic.success();
      toast.success(kind === 'confirm'
        ? p.purpose === 'deposit' ? `Listo. La cita de ${p.client_name ?? 'tu cliente'} quedó confirmada y le avisamos.` : 'Pago confirmado. La compra ya está activa.'
        : 'Pago rechazado. Le avisamos al cliente y el horario quedó libre.');
      setItems((prev) => prev?.filter((x) => x.id !== p.id) ?? null);
      setOpen(null);
    } catch {
      toast.error('No se pudo guardar. Intenta de nuevo.');
      load();
    } finally {
      setBusy(false);
      setRejecting(false);
    }
  }

  if (!items?.length) return null;

  const label = (p: Pending) =>
    p.purpose === 'deposit'
      ? `${p.services ?? 'Reserva'}${p.staff_name ? ` con ${p.staff_name}` : ''}${p.starts_at ? `, ${when(p.starts_at)}` : ''}`
      : p.detail ?? (p.purpose === 'package' ? 'Paquete' : 'Gift card');
  const Icon = (p: Pending) => (p.purpose === 'deposit' ? CalendarClock : p.purpose === 'package' ? Package : Gift);

  return (
    <section className="mb-8 rounded-2xl border border-ink p-4 sm:p-5" aria-label="Pagos por confirmar">
      <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
        <ReceiptText size={19} strokeWidth={1.75} /> {items.length === 1 ? '1 pago por confirmar' : `${items.length} pagos por confirmar`}
      </h2>
      <p className="mt-1 text-[14px] text-mute">Revisa en tu app de Yape o Plin que te haya llegado y confírmalo.</p>
      <ul className="mt-4 space-y-2">
        {items.map((p) => {
          const I = Icon(p);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => { haptic.tap(); setRejecting(false); setOpen(p); }} className="flex w-full items-center gap-3 rounded-xl bg-field p-3 text-left transition-colors hover:bg-line">
                <Thumb id={p.id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-semibold">{p.client_name ?? 'Cliente'}</span>
                    <span className="tnum shrink-0 text-[16px] font-semibold">{soles(p.amount_cents)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-mute"><I size={14} strokeWidth={1.75} className="shrink-0" /> <span className="truncate">{label(p)}</span></span>
                  <span className="mt-0.5 block text-[13px] text-soft">{p.method === 'plin' ? 'Plin' : 'Yape'}, enviado {when(p.created_at)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title="Revisar pago"
        footer={open && !rejecting ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button type="button" onClick={() => setRejecting(true)} disabled={busy} className="flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-line px-5 text-[15px] font-medium hover:border-ink">
              <X size={17} strokeWidth={1.75} /> Rechazar
            </button>
            <button type="button" onClick={() => act(open, 'confirm')} disabled={busy} className="flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-ink px-5 text-[16px] font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={18} strokeWidth={2} />} Me llegó {soles(open.amount_cents)}
            </button>
          </div>
        ) : undefined}
      >
        {open && (
          <div className="space-y-4">
            <div>
              <p className="text-[22px] font-semibold tracking-[-0.02em]">{open.client_name ?? 'Cliente'}, <span className="tnum">{soles(open.amount_cents)}</span></p>
              <p className="text-[15px] text-mute">{label(open)}</p>
              {open.client_phone && <p className="tnum text-[14px] text-soft">{open.client_phone}</p>}
            </div>
            <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl bg-field">
              {big
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={big} alt="Captura del pago" className="max-h-[60dvh] w-auto object-contain" />
                : <Loader2 className="animate-spin text-soft" />}
            </div>
            {rejecting && (
              <div className="rounded-2xl border border-line p-4">
                <p className="text-[15px] font-semibold">¿Por qué lo rechazas?</p>
                <p className="mt-1 text-[13px] text-mute">Le avisamos al cliente por correo{open.purpose === 'deposit' ? ' y el horario queda libre' : ''}.</p>
                <div className="mt-3 flex flex-col gap-2">
                  {REASONS.map((r) => (
                    <button key={r} type="button" disabled={busy} onClick={() => act(open, 'reject', r)} className="min-h-11 rounded-xl bg-field px-4 text-left text-[15px] hover:bg-line disabled:opacity-50">{r}</button>
                  ))}
                  <button type="button" onClick={() => setRejecting(false)} className="min-h-11 text-[14px] text-mute underline underline-offset-4">Volver</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
}
