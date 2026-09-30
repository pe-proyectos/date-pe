'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Contact, MessageCircle, Award, Copy, Gift, Phone, Trash2, Hourglass } from 'lucide-react';
import { useApi, soles } from './api';
import { PageHead, Empty, Skeleton, Drawer, Field, inputCls, Btn } from './ui';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

interface Client {
  id: string; name: string | null; phone: string; email: string | null; loyalty_points: number;
  visitas: string; ausencias: string; gastado_cents: string; ultima_cita: string | null; proxima_cita: string | null;
  referral_code?: string | null;
}
interface Wait {
  id: string; day: string; name: string; phone: string; email: string | null; notified_at: string | null; booked: boolean;
  service_name: string | null; staff_name: string | null;
}
type Tab = 'clientes' | 'espera';

export function Clientes() {
  const api = useApi();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Client[] | null>(null);
  const [open, setOpen] = useState<Client | null>(null);
  const [points, setPoints] = useState('');
  const [tab, setTab] = useState<Tab>('clientes');
  const [wait, setWait] = useState<Wait[] | null>(null);

  const loadWait = useCallback(() => api<{ waitlist: Wait[] }>('/admin/waitlist').then((d) => setWait(d.waitlist)).catch(() => setWait([])), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'espera') loadWait(); }, [tab, loadWait]);

  async function removeWait(w: Wait) {
    if (!confirm(`¿Quitar a ${w.name} de la lista de espera?`)) return;
    setWait((p) => p?.filter((x) => x.id !== w.id) ?? null);
    try {
      await api(`/admin/waitlist/${w.id}`, { method: 'DELETE' });
      toast.success('Quitado de la lista de espera');
    } catch {
      toast.error('No se pudo quitar.');
      loadWait();
    }
  }

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
      <PageHead
        title="Clientes"
        sub={tab === 'clientes' ? 'Cada reserva crea o actualiza la ficha del cliente. Los puntos se suman al completar una cita.' : 'Quienes esperan un horario libre. Les avisamos por correo si alguien cancela ese día.'}
      />
      <div className="mb-6 flex w-full max-w-md rounded-full border border-line p-1 sm:w-auto" role="tablist" aria-label="Vista">
        {([['clientes', 'Clientes'], ['espera', 'Lista de espera']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => { haptic.tap(); setTab(id); }}
            className={`min-h-10 flex-1 rounded-full px-4 text-[14px] font-medium transition-colors sm:flex-none ${tab === id ? 'bg-ink text-white' : 'text-mute hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'espera' ? (
        <Waitlist list={wait} onRemove={removeWait} />
      ) : (
      <>
      <div className="mb-6 flex max-w-md items-center gap-2 rounded-full border border-line-2 px-4 focus-within:border-ink">
        <Search size={17} strokeWidth={1.75} className="text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o celular" className="w-full bg-transparent py-2.5 text-[15px] outline-none" />
      </div>

      {!list ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <Empty icon={Contact} title={q ? 'Sin resultados' : 'Aún no tienes clientes'} body={q ? 'Prueba con otro nombre o número.' : 'Aparecen aquí apenas alguien reserva.'} />
      ) : (
        <>
        <ul className="divide-y divide-line border-y border-line md:hidden">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { setOpen(c); setPoints(String(c.loyalty_points)); }} className="flex w-full items-center gap-3 py-3.5 text-left active:bg-field">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field text-[15px] font-semibold">{(c.name ?? '?').trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name ?? 'Sin nombre'}</span>
                  <span className="tnum block text-[13px] text-mute">
                    {c.visitas} {Number(c.visitas) === 1 ? 'visita' : 'visitas'}, {soles(c.gastado_cents)}
                    {Number(c.ausencias) > 0 && <span className="text-red">, {c.ausencias} {Number(c.ausencias) === 1 ? 'ausencia' : 'ausencias'}</span>}
                  </span>
                  <span className="block text-[13px] text-soft">
                    {c.proxima_cita ? `Próxima: ${shortDate(c.proxima_cita)}` : c.ultima_cita ? `Última: ${shortDate(c.ultima_cita)}` : 'Sin visitas aún'}
                  </span>
                </span>
                <span className="tnum shrink-0 text-right text-[13px] font-medium">{c.loyalty_points} pts</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-ink text-[13px] text-mute">
                <th className="py-3 pr-4 font-medium">Cliente</th>
                <th className="py-3 pr-4 text-right font-medium">Visitas</th>
                <th className="py-3 pr-4 text-right font-medium">Ausencias</th>
                <th className="py-3 pr-4 text-right font-medium">Gastado</th>
                <th className="py-3 pr-4 text-right font-medium">Puntos</th>
                <th className="py-3 pr-4 font-medium">Última visita</th>
                <th className="py-3 font-medium">Próxima cita</th>
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
                  <td className="py-3.5 pr-4 text-mute">{c.ultima_cita ? shortDate(c.ultima_cita, true) : 'Nunca'}</td>
                  <td className="py-3.5 text-mute">{c.proxima_cita ? shortDate(c.proxima_cita, true) : 'Sin agendar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      </>
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
              <div className="flex justify-between py-3"><dt className="text-mute">Última visita</dt><dd>{open.ultima_cita ? shortDate(open.ultima_cita, true) : 'Nunca'}</dd></div>
              <div className="flex justify-between py-3"><dt className="text-mute">Próxima cita</dt><dd>{open.proxima_cita ? shortDate(open.proxima_cita, true) : 'Sin agendar'}</dd></div>
            </dl>
            {open.referral_code && (
              <div>
                <span className="mb-1.5 block text-[14px] font-medium">Código de amigo</span>
                <div className="flex items-center gap-2">
                  <span className="flex min-h-11 flex-1 items-center gap-2 rounded-xl bg-field px-3.5 font-mono text-[16px] font-medium tracking-[0.04em]">
                    <Gift size={17} strokeWidth={1.75} className="text-mute" /> {open.referral_code}
                  </span>
                  <Btn
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => {
                      navigator.clipboard.writeText(open.referral_code ?? '').then(() => toast.success('Código copiado'), () => toast.error('No se pudo copiar.'));
                    }}
                  >
                    <Copy size={15} strokeWidth={1.75} /> Copiar
                  </Btn>
                </div>
                <span className="mt-1 block text-[13px] text-soft">Si un amigo reserva con este código, tiene descuento y este cliente suma puntos.</span>
              </div>
            )}
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

function shortDate(iso: string, year = false) {
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'America/Lima' }).replace('.', '');
}

/** Número para WhatsApp con código de país (Perú: 51) si viene sin él. */
function waNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length === 9 ? `51${d}` : d;
}

function dayTitle(date: string) {
  const t = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function waitStatus(w: Wait): [string, string] {
  if (w.booked) return ['Ya reservó', 'bg-ok-tint text-ok'];
  if (w.notified_at) {
    const hora = new Date(w.notified_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
    return [`Avisado ${hora}`, 'bg-[#e8eefb] text-[#1d3f94]'];
  }
  return ['Esperando', 'bg-field text-mute'];
}

function Waitlist({ list, onRemove }: { list: Wait[] | null; onRemove: (w: Wait) => void }) {
  if (!list) return <Skeleton />;
  if (list.length === 0) {
    return (
      <Empty
        icon={Hourglass}
        title="Nadie en lista de espera"
        body="Cuando un día está lleno, tus clientes pueden anotarse desde tu página de reservas. Si alguien cancela, les avisamos por correo y aparecen aquí."
      />
    );
  }
  const groups: [string, Wait[]][] = [];
  for (const w of list) {
    const last = groups[groups.length - 1];
    if (last && last[0] === w.day) last[1].push(w);
    else groups.push([w.day, [w]]);
  }
  return (
    <div className="space-y-6">
      {groups.map(([day, rows]) => (
        <div key={day}>
          <h3 className="mb-1 text-[14px] font-medium text-mute">{dayTitle(day)}</h3>
          <ul className="divide-y divide-line border-y border-line">
            {rows.map((w) => {
              const [label, cls] = waitStatus(w);
              const detail = [w.service_name, w.staff_name ? `con ${w.staff_name}` : 'cualquier barbero'].filter(Boolean).join(', ');
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{w.name}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${cls}`}>{label}</span>
                    </div>
                    <div className="text-[14px] text-mute">{detail}</div>
                    <div className="tnum text-[13px] text-soft">{w.phone}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`tel:${w.phone}`} className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-ink" aria-label={`Llamar a ${w.name}`}>
                      <Phone size={16} strokeWidth={1.75} />
                    </a>
                    <a href={`https://wa.me/${waNumber(w.phone)}`} target="_blank" rel="noopener noreferrer" className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-ink" aria-label={`WhatsApp a ${w.name}`}>
                      <MessageCircle size={16} strokeWidth={1.75} />
                    </a>
                    <button type="button" onClick={() => onRemove(w)} className="flex h-11 w-11 items-center justify-center rounded-full text-mute transition-colors hover:bg-red-tint hover:text-red" aria-label={`Quitar a ${w.name}`}>
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
