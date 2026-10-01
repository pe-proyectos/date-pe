'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Eye, MousePointerClick, CalendarCheck, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Skeleton, Segmented } from './ui';
import { ColumnChart, BarList } from '@/components/charts';
import { tenantUrl } from '@/lib/config';

interface Data {
  days: number;
  totals: { views: number; visitors: number; book_clicks: number; book_starts: number; bookings: number; booked_cents: number };
  previous: { visitors: number; bookings: number };
  daily: Array<{ day: string; visitors: number; bookings: number }>;
  sources: Array<{ source: string; visitors: number }>;
  pages: Array<{ path: string; staff_name: string | null; views: number }>;
  services: Array<{ name: string; n: number }>;
  staff: Array<{ name: string; n: number }>;
}

const SOURCE: Record<string, string> = { directo: 'Directo o link guardado', instagram: 'Instagram', facebook: 'Facebook', google: 'Google', whatsapp: 'WhatsApp', tiktok: 'TikTok', 'date.pe': 'Buscador de date.pe', otros: 'Otros sitios' };
const PAGE: Record<string, string> = { '/': 'Inicio', '/servicios': 'Servicios', '/equipo': 'Equipo', '/trabajos': 'Trabajos', '/opiniones': 'Opiniones', '/visitanos': 'Visítanos' };
const pageLabel = (p: string, staff: string | null) => PAGE[p] ?? (p.startsWith('/equipo/') ? `Perfil de ${staff ?? 'barbero'}` : p);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Delta({ now, before }: { now: number; before: number }) {
  // Sin datos del periodo anterior no hay con qué comparar
  if (!before) return null;
  const d = Math.round(((now - before) / before) * 100);
  const up = d >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-medium ${up ? 'text-ok' : 'text-red-deep'}`}>
      {up ? <TrendingUp size={14} strokeWidth={2} /> : <TrendingDown size={14} strokeWidth={2} />} {up ? '+' : ''}{d}% vs. periodo anterior
    </span>
  );
}

/** Cuánta gente ve la página de la barbería, de dónde llega y cuántos terminan reservando. */
export function Visitas() {
  const { tenant } = useAdmin();
  const api = useApi();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    setD(null);
    api<Data>(`/admin/analytics?days=${days}`).then(setD).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const t = d?.totals;
  const funnel = t
    ? [
        { label: 'Vieron tu página', value: t.visitors, icon: Eye },
        { label: 'Tocaron Reservar', value: t.book_clicks, icon: MousePointerClick },
        { label: 'Empezaron a reservar', value: t.book_starts, icon: Users },
        { label: 'Reservaron', value: t.bookings, icon: CalendarCheck },
      ]
    : [];

  return (
    <>
      <PageHead
        title="Tu página"
        sub="Quiénes la visitan, de dónde llegan y cuántos terminan reservando. Sin cookies ni datos personales."
        actions={
          <a href={tenantUrl(tenant)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink">
            Ver mi página <ExternalLink size={15} strokeWidth={1.75} />
          </a>
        }
      />
      <div className="mb-6">
        <Segmented value={days} onChange={setDays} options={[['7', '7 días'], ['30', '30 días'], ['90', '90 días']] as const} label="Periodo" />
      </div>

      {!d || !t ? (
        <Skeleton rows={5} />
      ) : (
        <div className="space-y-10">
          <section aria-label="Embudo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {funnel.map((f, i) => (
              <div key={f.label} className="rounded-xl border border-line p-4">
                <f.icon size={18} strokeWidth={1.75} className="text-mute" />
                <p className="tnum mt-3 text-[30px] font-semibold leading-none tracking-[-0.03em]">{f.value}</p>
                <p className="mt-1.5 text-[14px] text-mute">{f.label}</p>
                {i > 0 && funnel[0].value > 0 && <p className="tnum mt-1 text-[13px] font-medium">{pct(f.value, funnel[0].value)}% de las visitas</p>}
              </div>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-field p-5">
              <p className="text-[14px] text-mute">Personas que vieron tu página</p>
              <p className="tnum mt-1 text-[26px] font-semibold tracking-[-0.03em]">{t.visitors}</p>
              <Delta now={t.visitors} before={d.previous.visitors} />
            </div>
            <div className="rounded-xl bg-field p-5">
              <p className="text-[14px] text-mute">Reservas en línea</p>
              <p className="tnum mt-1 text-[26px] font-semibold tracking-[-0.03em]">{t.bookings} <span className="text-[15px] font-normal text-mute">por {soles(t.booked_cents)}</span></p>
              <Delta now={t.bookings} before={d.previous.bookings} />
            </div>
          </section>

          <section className="rounded-xl border border-line p-5">
            <ColumnChart title="Personas por día" integer data={d.daily.map((x) => ({ label: x.day.slice(5).split('-').reverse().join('/'), value: x.visitors, detail: `${x.bookings} ${x.bookings === 1 ? 'reserva' : 'reservas'}` }))} format={(v) => String(Math.round(v))} />
          </section>

          <section className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-xl border border-line p-5">
              <BarList title="De dónde llegan" data={d.sources.map((s) => ({ label: SOURCE[s.source] ?? s.source, value: s.visitors }))} format={(v) => `${v}`} empty="Aún no hay visitas en este periodo. Comparte tu link en Instagram y WhatsApp." />
            </div>
            <div className="rounded-xl border border-line p-5">
              <BarList title="Secciones más vistas" data={d.pages.map((p) => ({ label: pageLabel(p.path, p.staff_name), value: p.views }))} format={(v) => `${v}`} />
            </div>
            <div className="rounded-xl border border-line p-5">
              <BarList title="Servicios más reservados" data={d.services.map((s) => ({ label: s.name, value: s.n }))} format={(v) => `${v}`} />
            </div>
            <div className="rounded-xl border border-line p-5">
              <BarList title="Barberos más pedidos" data={d.staff.map((s) => ({ label: s.name, value: s.n }))} format={(v) => `${v}`} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
