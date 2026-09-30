'use client';

import { useEffect, useState } from 'react';
import { useApi, soles, solesShort } from './api';
import { PageHead, Skeleton } from './ui';
import { ColumnChart, BarList, StatTile } from '@/components/charts';

interface Detail {
  days: number;
  daily: { dia: string; ingresos_cents: number; citas: number }[];
  byService: { name: string; citas: number; ingresos_cents: number }[];
  byStaff: { name: string; citas: number; ingresos_cents: number; ausencias: number }[];
  totals: { citas: number; ausencias: number; canceladas: number; ingresos_cents: number; descuentos_cents: number };
}

const dayLabel = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const dayLong = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

export function Reportes() {
  const api = useApi();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Detail | null>(null);

  useEffect(() => {
    setData(null);
    api<Detail>(`/admin/reports/detail?days=${days}`).then(setData).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const t = data?.totals;
  const attended = t ? t.citas : 0;
  const noShowRate = t && attended + t.ausencias > 0 ? Math.round((t.ausencias / (attended + t.ausencias)) * 100) : 0;
  const ticket = t && attended ? t.ingresos_cents / attended : 0;

  return (
    <>
      <PageHead
        title="Reportes"
        sub="Ingresos y citas confirmadas o completadas."
        actions={
          <div className="flex rounded-full border border-line p-1" role="radiogroup" aria-label="Periodo">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={`rounded-full px-4 py-1.5 text-[14px] transition-colors ${days === d ? 'bg-ink text-white' : 'text-mute hover:text-ink'}`}>
                {d} días
              </button>
            ))}
          </div>
        }
      />

      {!data || !t ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Ingresos" value={soles(t.ingresos_cents)} sub={t.descuentos_cents ? `${soles(t.descuentos_cents)} en descuentos` : undefined} />
            <StatTile label="Citas" value={String(attended)} sub={`${t.canceladas} canceladas`} />
            <StatTile label="Ticket promedio" value={soles(ticket)} />
            <StatTile label="Ausencias" value={`${noShowRate}%`} sub={`${t.ausencias} de ${attended + t.ausencias} citas`} />
          </div>

          <div className="mt-10 grid gap-10 xl:grid-cols-2">
            <ColumnChart
              title="Ingresos por día"
              data={data.daily.map((d) => ({ label: dayLabel(d.dia), value: d.ingresos_cents, detail: dayLong(d.dia) }))}
              format={(v) => solesShort(v)}
            />
            <ColumnChart
              title="Citas por día"
              data={data.daily.map((d) => ({ label: dayLabel(d.dia), value: d.citas, detail: dayLong(d.dia) }))}
              format={(v) => String(Math.round(v))}
              integer
            />
          </div>

          <div className="mt-12 grid gap-10 border-t border-line pt-10 lg:grid-cols-2">
            <BarList
              title="Ingresos por servicio"
              data={data.byService.map((s) => ({ label: s.name, value: s.ingresos_cents, detail: `${s.citas} citas` }))}
              format={(v) => soles(v)}
            />
            <BarList
              title="Ingresos por barbero"
              data={data.byStaff.map((s) => ({ label: s.name, value: s.ingresos_cents, detail: `${s.citas} citas, ${s.ausencias} ausencias` }))}
              format={(v) => soles(v)}
            />
          </div>
        </>
      )}
    </>
  );
}
