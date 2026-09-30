'use client';

import { useEffect, useState } from 'react';
import { Copy, ExternalLink, CalendarClock, Scissors, Users, Clock } from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Btn, Skeleton } from './ui';
import { StatTile } from '@/components/charts';
import { tenantUrl } from '@/lib/config';
import { toast } from '@/lib/toast';

interface Overview {
  today: { citas_hoy: string; pendientes_hoy: string; ingresos_hoy: string };
  week: { ingresos_semana: string; citas_semana: string };
  upcoming: { starts_at: string; client_name: string | null; staff_name: string | null }[];
}

export function Resumen({ go }: { go: (s: string) => void }) {
  const { tenant } = useAdmin();
  const api = useApi();
  const [data, setData] = useState<Overview | null>(null);
  const [setup, setSetup] = useState<{ staff: number; services: number } | null>(null);
  const url = tenantUrl(tenant);

  useEffect(() => {
    api<Overview>('/admin/overview').then(setData).catch(() => {});
    Promise.all([api<{ staff: unknown[] }>('/admin/staff'), api<{ services: unknown[] }>('/admin/services')])
      .then(([s, v]) => setSetup({ staff: s.staff.length, services: v.services.length }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Lima' }).format(new Date()));
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <>
      <PageHead
        title={greet}
        sub={new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })}
        actions={
          <>
            <Btn variant="secondary" onClick={() => { navigator.clipboard.writeText(url); toast.success('Enlace copiado. Pégalo en WhatsApp o Instagram.'); }}>
              <Copy size={16} strokeWidth={1.75} /> Copiar enlace de reservas
            </Btn>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:bg-ink-2">
              <ExternalLink size={16} strokeWidth={1.75} /> Ver mi página
            </a>
          </>
        }
      />

      {setup && (setup.staff === 0 || setup.services === 0) && (
        <div className="mb-8 rounded-xl bg-field p-5">
          <p className="text-[16px] font-medium">Termina de configurar tu barbería</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {setup.staff === 0 && <Btn variant="secondary" onClick={() => go('equipo')}><Users size={16} strokeWidth={1.75} /> Agrega a tu equipo</Btn>}
            {setup.services === 0 && <Btn variant="secondary" onClick={() => go('servicios')}><Scissors size={16} strokeWidth={1.75} /> Carga tus servicios</Btn>}
            <Btn variant="secondary" onClick={() => go('horarios')}><Clock size={16} strokeWidth={1.75} /> Define horarios</Btn>
          </div>
        </div>
      )}

      {!data ? (
        <Skeleton rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Citas hoy" value={data.today.citas_hoy} sub={Number(data.today.pendientes_hoy) ? `${data.today.pendientes_hoy} esperando adelanto` : 'Todas confirmadas'} />
            <StatTile label="Ingresos hoy" value={soles(data.today.ingresos_hoy)} />
            <StatTile label="Citas esta semana" value={data.week.citas_semana} />
            <StatTile label="Ingresos esta semana" value={soles(data.week.ingresos_semana)} />
          </div>

          <div className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Próximas citas</h2>
              <Btn variant="ghost" onClick={() => go('agenda')}>Abrir agenda</Btn>
            </div>
            {data.upcoming.length === 0 ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-6 text-[15px] text-mute">
                <CalendarClock size={20} strokeWidth={1.5} /> No hay citas próximas. Comparte tu enlace para recibir reservas.
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {data.upcoming.map((u) => (
                  <li key={u.starts_at + u.client_name} className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-4">
                      <span className="tnum w-14 text-[17px] font-medium">
                        {new Date(u.starts_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' })}
                      </span>
                      <div>
                        <div className="text-[15px] font-medium">{u.client_name ?? 'Walk-in'}</div>
                        <div className="text-[14px] text-mute">con {u.staff_name}</div>
                      </div>
                    </div>
                    <span className="text-[14px] text-mute">
                      {new Date(u.starts_at).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', timeZone: 'America/Lima' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
