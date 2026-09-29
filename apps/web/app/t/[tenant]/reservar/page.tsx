'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE_CLIENT } from '@/lib/config';

interface Service { id: string; name: string; duration_min: number; price_cents: number }
interface Staff { id: string; name: string; photo_url: string | null; bio: string | null }
interface Slot { start: string; end: string; staffId: string }
type PayProvider = 'mercadopago' | 'paypal' | 'culqi';

const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });

export default function ReservarPage() {
  const tenant = useParams().tenant as string;
  const h = { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant };

  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositPct, setDepositPct] = useState(0);

  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [client, setClient] = useState({ name: '', phone: '', email: '' });

  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/site`, { headers: h })
      .then((r) => r.json())
      .then((d) => {
        setServices(d.services ?? []);
        setStaff(d.staff ?? []);
        setRequireDeposit(d.settings?.require_deposit ?? false);
        setDepositPct(d.settings?.deposit_percent ?? 0);
      })
      .catch(() => setError('No se pudo cargar la barbería.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const loadSlots = useCallback(async () => {
    if (!service) return;
    const q = new URLSearchParams({ date, serviceId: service.id });
    if (staffId) q.set('staffId', staffId);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/availability?${q}`, { headers: h });
      const d = await res.json();
      setSlots(d.slots ?? []);
    } catch {
      setSlots([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, staffId, date, tenant]);

  useEffect(() => {
    if (service) loadSlots();
  }, [service, staffId, date, loadSlots]);

  // Disponibilidad en tiempo real
  useEffect(() => {
    const proto = API_BASE_CLIENT.startsWith('https') ? 'wss' : 'ws';
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${proto}://${API_BASE_CLIENT.replace(/^https?:\/\//, '')}/api/ws?tenant=${tenant}`);
      ws.onmessage = (ev) => {
        try {
          if (JSON.parse(ev.data).type === 'availability_changed') loadSlots();
        } catch { /* */ }
      };
    } catch { /* */ }
    return () => ws?.close();
  }, [tenant, loadSlots]);

  async function createBooking() {
    if (!service || !slot) return;
    setError('');
    const res = await fetch(`${API_BASE_CLIENT}/api/bookings`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        serviceId: service.id,
        staffId: slot.staffId,
        startsAt: slot.start,
        client: { name: client.name, phone: client.phone, email: client.email || undefined },
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error === 'slot_ocupado' ? 'Ese horario se acaba de ocupar, elige otro.' : 'No se pudo reservar.');
      if (d.error === 'slot_ocupado') loadSlots();
      return;
    }
    if (requireDeposit && depositPct > 0) {
      setAppointmentId(d.appointmentId); // pasa al paso de pago
    } else {
      setDone(true);
    }
  }

  async function pay(provider: PayProvider) {
    if (!appointmentId) return;
    setPaying(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/payments/intent`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ appointmentId, provider }),
      });
      const d = await res.json();
      if (!res.ok) { setError('No se pudo iniciar el pago.'); return; }

      if (d.noDeposit) { setDone(true); return; }
      if (d.redirectUrl) { window.location.href = d.redirectUrl; return; } // MercadoPago / PayPal
      if (d.devSimulated) {
        // Modo dev sin llaves: confirmamos la seña simulada
        await fetch(`${API_BASE_CLIENT}${d.devConfirmUrl}`, { method: 'POST', headers: h });
        setDone(true);
        return;
      }
      if (d.clientConfig) {
        // Culqi: requiere Culqi.js para tokenizar (pendiente en frontend)
        setError('Pago con tarjeta (Culqi) disponible próximamente. Usa MercadoPago o PayPal.');
      }
    } finally {
      setPaying(false);
    }
  }

  const depositAmount = service ? Math.round((service.price_cents * depositPct) / 100) : 0;

  if (done) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-3xl font-bold">¡Reserva confirmada! ✅</h1>
        {slot && (
          <p className="mt-4 text-slate-600">
            Te esperamos el{' '}
            {new Date(slot.start).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })} a las {fmtTime(slot.start)}.
          </p>
        )}
      </main>
    );
  }

  // Paso de pago
  if (appointmentId) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-bold">Asegura tu cita con una seña</h1>
        <p className="mt-2 text-slate-600">
          Paga una seña de {soles(depositAmount)} ({depositPct}%) para confirmar. El resto lo pagas en el local.
        </p>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 space-y-3">
          <button onClick={() => pay('mercadopago')} disabled={paying} className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-white disabled:opacity-50">
            Pagar con MercadoPago / Yape
          </button>
          <button onClick={() => pay('paypal')} disabled={paying} className="w-full rounded-xl bg-[#003087] py-3 font-semibold text-white disabled:opacity-50">
            Pagar con PayPal
          </button>
          <button onClick={() => pay('culqi')} disabled={paying} className="w-full rounded-xl border border-slate-300 py-3 font-semibold disabled:opacity-50">
            Pagar con tarjeta (Culqi)
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-bold">Reservar cita</h1>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <Step n={1} title="Elige un servicio">
        <div className="grid gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => { setService(s); setSlot(null); }}
              className={`flex justify-between rounded-xl border p-4 text-left ${service?.id === s.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
            >
              <span>{s.name} <span className="text-slate-400">· {s.duration_min} min</span></span>
              <span className="font-semibold">{soles(s.price_cents)}</span>
            </button>
          ))}
        </div>
      </Step>

      {service && (
        <Step n={2} title="Elige tu barbero">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setStaffId(null); setSlot(null); }} className={`rounded-xl border px-4 py-2 ${staffId === null ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
              Cualquiera disponible
            </button>
            {staff.map((b) => (
              <button key={b.id} onClick={() => { setStaffId(b.id); setSlot(null); }} className={`rounded-xl border px-4 py-2 ${staffId === b.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
                {b.name}
              </button>
            ))}
          </div>
        </Step>
      )}

      {service && (
        <Step n={3} title="Elige fecha y hora">
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setDate(e.target.value); setSlot(null); }}
            className="mb-4 rounded-xl border border-slate-300 px-3 py-2"
          />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.start + s.staffId}
                onClick={() => setSlot(s)}
                className={`rounded-lg border py-2 text-sm ${slot?.start === s.start && slot?.staffId === s.staffId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200'}`}
              >
                {fmtTime(s.start)}
              </button>
            ))}
            {slots.length === 0 && <p className="col-span-full text-sm text-slate-500">No hay horarios ese día.</p>}
          </div>
        </Step>
      )}

      {slot && (
        <Step n={4} title="Tus datos">
          <div className="space-y-3">
            <input placeholder="Nombre" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input placeholder="Celular (+51…)" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            <input placeholder="Email (opcional)" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            {/* Verificación por WhatsApp: desactivada por ahora */}
            <button
              onClick={createBooking}
              disabled={!client.name || client.phone.length < 6}
              className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-40"
            >
              {requireDeposit && depositPct > 0 ? 'Continuar al pago de seña' : 'Confirmar reserva'}
            </button>
          </div>
        </Step>
      )}
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
