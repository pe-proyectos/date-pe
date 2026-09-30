'use client';

import { useEffect, useState } from 'react';
import { useApi, soles, solesShort } from './api';
import { PageHead, Skeleton } from './ui';
import { ColumnChart, BarList, StatTile } from '@/components/charts';

interface Detail {
  days: number;
  daily: { dia: string; ingresos_cents: number; citas: number }[];
  byService: { name: string; citas: number; ingresos_cents: number }[];
  byStaff: { name: string; citas: number; ingresos_cents: number; ausencias: number; commission_percent?: number | null; comision_cents?: number | null; completado_cents?: number | null; completadas?: number | null }[];
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

          <Comisiones rows={data.byStaff} days={data.days} />
        </>
      )}
    </>
  );
}

function Comisiones({ rows, days }: { rows: Detail['byStaff']; days: number }) {
  const list = rows.map((r) => ({
    name: r.name,
    citas: Number(r.completadas ?? r.citas ?? 0),
    atendido: Number(r.completado_cents ?? 0),
    pct: Number(r.commission_percent ?? 0),
    pagar: Number(r.comision_cents ?? 0),
  }));
  const total = list.reduce((a, r) => ({ citas: a.citas + r.citas, atendido: a.atendido + r.atendido, pagar: a.pagar + r.pagar }), { citas: 0, atendido: 0, pagar: 0 });

  return (
    <section className="mt-12 border-t border-line pt-10">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">Comisiones</h2>
      <p className="mt-1 text-[14px] text-mute">Calculado sobre citas completadas en el periodo (últimos {days} días). El porcentaje de cada barbero se cambia en Equipo.</p>

      {list.length === 0 ? (
        <p className="mt-4 text-[15px] text-mute">Aún no hay citas en este periodo.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line border-y border-line md:hidden">
            {list.map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-4 py-3.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="tnum block text-[13px] text-mute">
                    {r.citas} {r.citas === 1 ? 'cita' : 'citas'}, {soles(r.atendido)} atendido, {r.pct}%
                  </span>
                </span>
                <span className="tnum shrink-0 text-right text-[16px] font-medium">{soles(r.pagar)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-4 py-3.5">
              <span className="font-medium">Total a pagar</span>
              <span className="tnum text-[16px] font-semibold">{soles(total.pagar)}</span>
            </li>
          </ul>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-ink text-[13px] text-mute">
                  <th className="py-3 pr-4 font-medium">Barbero</th>
                  <th className="py-3 pr-4 text-right font-medium">Citas</th>
                  <th className="py-3 pr-4 text-right font-medium">Atendido</th>
                  <th className="py-3 pr-4 text-right font-medium">Comisión</th>
                  <th className="py-3 text-right font-medium">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.name} className="border-b border-line">
                    <td className="py-3.5 pr-4 font-medium">{r.name}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{r.citas}</td>
                    <td className="tnum py-3.5 pr-4 text-right">{soles(r.atendido)}</td>
                    <td className={`tnum py-3.5 pr-4 text-right ${r.pct ? '' : 'text-soft'}`}>{r.pct}%</td>
                    <td className="tnum py-3.5 text-right font-medium">{soles(r.pagar)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink">
                  <td className="py-3.5 pr-4 font-semibold">Total</td>
                  <td className="tnum py-3.5 pr-4 text-right">{total.citas}</td>
                  <td className="tnum py-3.5 pr-4 text-right">{soles(total.atendido)}</td>
                  <td className="py-3.5 pr-4" />
                  <td className="tnum py-3.5 text-right font-semibold">{soles(total.pagar)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
