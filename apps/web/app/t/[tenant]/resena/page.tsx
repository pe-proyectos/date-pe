'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Star, Loader2, ArrowLeft } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';

interface Appt { id: string; starts_at: string; status: string; staff_name: string | null; service_name: string | null; reviewed: boolean }

const LABELS = ['', 'Mala', 'Regular', 'Buena', 'Muy buena', 'Excelente'];

function ResenaInner() {
  const tenant = useParams().tenant as string;
  const search = useSearchParams();
  const citaId = search.get('cita') ?? '';
  const headers = { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant };

  // El correo de reseña trae ?tel= con los 9 dígitos: el cliente solo toca "Continuar".
  const [phone, setPhone] = useState(() => (search.get('tel') ?? '').replace(/\D/g, '').slice(-9));
  const [appt, setAppt] = useState<Appt | null>(null);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/appointments/${citaId}?phone=${encodeURIComponent(phone)}`, { headers });
      if (!res.ok) return toast.error('No encontramos una cita con ese celular.');
      setAppt(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!stars) return toast.error('Elige de 1 a 5 estrellas.');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_CLIENT}/api/public/reviews`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ appointmentId: citaId, phone, stars, comment: comment.trim() || undefined }),
      });
      const d = await res.json();
      if (res.ok) return setSent(true);
      toast.error(
        d.error === 'ya_resenaste' ? 'Ya dejaste tu opinión para esta cita.' : d.error === 'aun_no_puedes_resenar' ? 'Podrás opinar después de tu cita.' : 'No pudimos guardar tu opinión.',
      );
    } finally {
      setBusy(false);
    }
  }

  const when = appt ? new Date(appt.starts_at).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }) : '';

  return (
    <main className="mx-auto max-w-lg px-5 py-12 md:py-20">
      <Toaster />
      <Link href="/" className="inline-flex items-center gap-1.5 text-[15px] text-mute hover:text-ink">
        <ArrowLeft size={17} strokeWidth={1.75} /> Volver
      </Link>

      {sent ? (
        <div className="mt-10">
          <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Gracias por tu opinión.</h1>
          <p className="mt-3 text-[17px] text-mute">La publicamos en la página de la barbería. Ayuda a otros a elegir.</p>
          <Link href="/reservar" className="mt-8 inline-block rounded-lg bg-ink px-6 py-3.5 text-[15px] font-medium text-white">Reservar otra vez</Link>
        </div>
      ) : !appt ? (
        <form onSubmit={lookup} className="mt-8">
          <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">¿Cómo te fue?</h1>
          <p className="mt-3 text-[17px] text-mute">Confirma el celular con el que reservaste para dejar tu opinión.</p>
          <label className="mt-8 block">
            <span className="mb-1.5 block text-[14px] font-medium">Celular</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="tnum w-full rounded-xl border border-line-2 px-4 py-3.5 text-[16px] outline-none focus:border-ink" placeholder="987 654 321" />
          </label>
          <button disabled={busy || phone.replace(/\D/g, '').length < 9 || !citaId} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white disabled:opacity-40">
            {busy && <Loader2 size={18} className="animate-spin" />} Continuar
          </button>
        </form>
      ) : appt.reviewed ? (
        <div className="mt-10">
          <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Ya dejaste tu opinión.</h1>
          <p className="mt-3 text-[17px] text-mute">Gracias. Puedes reservar tu próxima cita cuando quieras.</p>
          <Link href="/reservar" className="mt-8 inline-block rounded-lg bg-ink px-6 py-3.5 text-[15px] font-medium text-white">Reservar</Link>
        </div>
      ) : (
        <form onSubmit={send} className="mt-8">
          <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">¿Cómo te fue?</h1>
          <p className="mt-3 text-[17px] text-mute">
            {appt.service_name}{appt.staff_name ? ` con ${appt.staff_name}` : ''}, {when}.
          </p>
          <div className="mt-8 flex items-center gap-2" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Calificación">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} de 5`}
                onMouseEnter={() => setHover(n)}
                onClick={() => setStars(n)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star size={40} strokeWidth={1.25} className={(hover || stars) >= n ? 'fill-ink text-ink' : 'text-line-2'} />
              </button>
            ))}
            <span className="ml-3 text-[16px] font-medium">{LABELS[hover || stars]}</span>
          </div>
          <label className="mt-8 block">
            <span className="mb-1.5 block text-[14px] font-medium">Cuéntanos más (opcional)</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={800} className="w-full resize-none rounded-xl border border-line-2 px-4 py-3 text-[16px] outline-none focus:border-ink" placeholder="¿Qué tal el corte, la puntualidad, el trato?" />
          </label>
          <button disabled={busy || !stars} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3.5 text-[16px] font-medium text-white disabled:opacity-40">
            {busy && <Loader2 size={18} className="animate-spin" />} Publicar opinión
          </button>
        </form>
      )}
    </main>
  );
}

export default function ResenaPage() {
  return (
    <Suspense fallback={null}>
      <ResenaInner />
    </Suspense>
  );
}
