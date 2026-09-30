'use client';

import { useEffect, useState } from 'react';
import { Search, Contact, MessageCircle, Award } from 'lucide-react';
import { useApi, soles } from './api';
import { PageHead, Empty, Skeleton, Drawer, Field, inputCls, Btn } from './ui';
import { toast } from '@/lib/toast';

interface Client {
  id: string; name: string | null; phone: string; email: string | null; loyalty_points: number;
  visitas: string; ausencias: string; gastado_cents: string; ultima_cita: string | null;
}

export function Clientes() {
  const api = useApi();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Client[] | null>(null);
  const [open, setOpen] = useState<Client | null>(null);
  const [points, setPoints] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ clients: Client[] }>(`/admin/clients?q=${encodeURIComponent(q)}`).then((d) => setList(d.clients)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function savePoints() {
    if (!open) return;
    try {
      await api(`/admin/clients/${open.id}`, { method: 'PATCH', body: { loyaltyPoints: Number(points) || 0 } });
      toast.success('Puntos actualizados');
      setList((p) => p?.map((c) => (c.id === open.id ? { ...c, loyalty_points: Number(points) || 0 } : c)) ?? null);
      setOpen(null);
    } catch {
      toast.error('No se pudo guardar.');
    }
  }

  return (
    <>
      <PageHead title="Clientes" sub="Cada reserva crea o actualiza la ficha del cliente. Los puntos se suman al completar una cita." />
      <div className="mb-6 flex max-w-md items-center gap-2 rounded-full border border-line-2 px-4 focus-within:border-ink">
        <Search size={17} strokeWidth={1.75} className="text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o celular" className="w-full bg-transparent py-2.5 text-[15px] outline-none" />
      </div>

      {!list ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <Empty icon={Contact} title={q ? 'Sin resultados' : 'Aún no tienes clientes'} body={q ? 'Prueba con otro nombre o número.' : 'Aparecen aquí apenas alguien reserva.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-ink text-[13px] text-mute">
                <th className="py-3 pr-4 font-medium">Cliente</th>
                <th className="py-3 pr-4 text-right font-medium">Visitas</th>
                <th className="py-3 pr-4 text-right font-medium">Ausencias</th>
                <th className="py-3 pr-4 text-right font-medium">Gastado</th>
                <th className="py-3 pr-4 text-right font-medium">Puntos</th>
                <th className="py-3 font-medium">Última cita</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} onClick={() => { setOpen(c); setPoints(String(c.loyalty_points)); }} className="cursor-pointer border-b border-line hover:bg-field/60">
                  <td className="py-3.5 pr-4">
                    <div className="font-medium">{c.name ?? 'Sin nombre'}</div>
                    <div className="tnum text-[13px] text-mute">{c.phone}</div>
                  </td>
                  <td className="tnum py-3.5 pr-4 text-right">{c.visitas}</td>
                  <td className={`tnum py-3.5 pr-4 text-right ${Number(c.ausencias) > 0 ? 'text-red' : ''}`}>{c.ausencias}</td>
                  <td className="tnum py-3.5 pr-4 text-right">{soles(c.gastado_cents)}</td>
                  <td className="tnum py-3.5 pr-4 text-right">{c.loyalty_points}</td>
                  <td className="py-3.5 text-mute">
                    {c.ultima_cita ? new Date(c.ultima_cita).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Nunca'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name ?? 'Cliente'} footer={<><Btn variant="ghost" onClick={() => setOpen(null)}>Cerrar</Btn><Btn onClick={savePoints}>Guardar puntos</Btn></>}>
        {open && (
          <div className="space-y-6">
            <div className="flex gap-2">
              <a href={`https://wa.me/${open.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-[14px] font-medium hover:border-ink">
                <MessageCircle size={15} strokeWidth={1.75} /> Escribir por WhatsApp
              </a>
            </div>
            <dl className="divide-y divide-line border-y border-line text-[15px]">
              <div className="flex justify-between py-3"><dt className="text-mute">Celular</dt><dd className="tnum">{open.phone}</dd></div>
              {open.email && <div className="flex justify-between py-3"><dt className="text-mute">Correo</dt><dd>{open.email}</dd></div>}
              <div className="flex justify-between py-3"><dt className="text-mute">Visitas</dt><dd className="tnum">{open.visitas}</dd></div>
              <div className="flex justify-between py-3"><dt className="text-mute">Gastado</dt><dd className="tnum">{soles(open.gastado_cents)}</dd></div>
            </dl>
            <Field label="Puntos de lealtad" hint="Puedes ajustarlos si el cliente canjeó un premio.">
              <div className="flex items-center gap-2">
                <Award size={18} strokeWidth={1.75} className="text-mute" />
                <input inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))} className={`tnum ${inputCls}`} />
              </div>
            </Field>
          </div>
        )}
      </Drawer>
    </>
  );
}
