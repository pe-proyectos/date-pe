'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenText, Copy, ExternalLink, TriangleAlert, Printer, ChevronRight, Mail, MapPin, Plus } from 'lucide-react';
import { useAdmin, useApi, soles } from './api';
import { PageHead, Btn, Drawer, Empty, Skeleton, inputCls } from './ui';
import { tenantUrl, BASE_DOMAIN } from '@/lib/config';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

interface Complaint {
  id: string; code: string; kind: 'reclamo' | 'queja'; status: 'open' | 'answered';
  consumer_name: string; consumer_doc_type: string; consumer_doc_number: string; consumer_address: string | null;
  consumer_phone: string | null; consumer_email: string | null; is_minor: boolean; guardian_name: string | null;
  item_type: 'servicio' | 'producto' | string; item_amount_cents: number | null; item_description: string | null;
  detail: string; request: string | null; response: string | null; responded_at: string | null; due_at: string; created_at: string;
  location_name: string | null;
}
interface Provider { tradeName: string; legalName: string; ruc: string | null; address: string | null }
interface Data { complaints: Complaint[]; provider: Provider; open: number }

const QUICK = [
  'Lamentamos lo ocurrido.',
  'Revisamos tu caso con el equipo.',
  'Hemos devuelto el adelanto.',
  'Te ofrecemos un servicio sin costo en tu próxima visita.',
  'Tomamos medidas para que no vuelva a pasar.',
  'Gracias por avisarnos.',
];

const DAY = 86400000;
const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);

function dueChip(c: Complaint): [string, string] {
  if (c.status === 'answered') return ['Respondido', 'bg-ok-tint text-ok'];
  const d = daysLeft(c.due_at);
  if (d < 0) return [`Vencido hace ${-d} ${-d === 1 ? 'día' : 'días'}`, 'bg-red-tint text-red-deep'];
  if (d === 0) return ['Vence hoy', 'bg-red-tint text-red-deep'];
  return [`Vence en ${d} ${d === 1 ? 'día' : 'días'}`, d <= 5 ? 'bg-[#fff4e0] text-[#8a5300]' : 'bg-field text-mute'];
}

const fmtDate = (iso: string, time = false) =>
  new Date(iso).toLocaleString('es-PE', {
    day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}), timeZone: 'America/Lima',
  }).replace('.', '');

const kindLabel = (k: Complaint['kind']) => (k === 'queja' ? 'Queja' : 'Reclamo');

export function Reclamos() {
  const { tenant } = useAdmin();
  const api = useApi();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(false);
    api<Data>('/admin/complaints').then(setData).catch(() => setError(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    if (!data) return [];
    // Abiertos primero y por vencimiento; luego los respondidos, del más reciente al más antiguo
    return [...data.complaints].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      if (a.status === 'open') return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data]);
  const current = list.find((c) => c.id === openId) ?? null;

  const publicUrl = tenantUrl(tenant, '/reclamaciones');
  const shownUrl = `${tenant}.${BASE_DOMAIN}/reclamaciones`;

  function onAnswered(id: string, response: string) {
    setData((d) => d && {
      ...d,
      open: Math.max(0, d.open - 1),
      complaints: d.complaints.map((c) => (c.id === id ? { ...c, status: 'answered', response, responded_at: new Date().toISOString() } : c)),
    });
  }

  return (
    <>
      <PageHead title="Libro de Reclamaciones" sub="Lo exige la ley. Tus clientes lo encuentran en tu página y tienes 15 días hábiles para responder." />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {/* Enlace público */}
        <div className="rounded-2xl border border-line p-5">
          <p className="text-[14px] font-medium text-mute">Tu libro virtual</p>
          <p className="mt-1 break-all text-[17px] font-semibold tracking-[-0.02em]">{shownUrl}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn
              variant="secondary"
              className="min-h-11"
              onClick={() => { navigator.clipboard.writeText(publicUrl).then(() => toast.success('Enlace copiado'), () => toast.error('No se pudo copiar.')); }}
            >
              <Copy size={15} strokeWidth={1.75} /> Copiar enlace
            </Btn>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium hover:border-ink">
              <ExternalLink size={15} strokeWidth={1.75} /> Abrir
            </a>
          </div>
          <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-[14px] text-mute">
            <Printer size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>Pon también un aviso impreso que diga &quot;Libro de Reclamaciones&quot; en el mostrador. INDECOPI pide que esté a la vista de tus clientes.</span>
          </p>
        </div>

        {data && !data.provider.ruc && (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-[#fff4e0] p-5 text-[#8a5300] sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[15px]">
              <TriangleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span>Completa tu razón social y RUC en Ajustes, Datos legales. Aparecen en cada hoja.</span>
            </p>
            <a href="#ajustes?legales" className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink-2">
              Ir a Ajustes <ChevronRight size={15} strokeWidth={2} />
            </a>
          </div>
        )}
      </div>

      <div className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Hojas recibidas</h2>
          {data && data.open > 0 && <span className="tnum text-[14px] text-mute">{data.open} por responder</span>}
        </div>
        {error ? (
          <Empty icon={BookOpenText} title="No se pudo cargar" body="Revisa tu conexión e intenta de nuevo." action={<Btn variant="secondary" onClick={load}>Reintentar</Btn>} />
        ) : !data ? (
          <Skeleton />
        ) : list.length === 0 ? (
          <Empty icon={BookOpenText} title="Aún no tienes reclamos. Qué bien." body="Cuando un cliente registre un reclamo o una queja, te avisamos por correo y aparece aquí." />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {list.map((c) => {
              const [chip, cls] = dueChip(c);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => { haptic.tap(); setOpenId(c.id); }} className="flex w-full items-center gap-3 py-4 text-left active:bg-field md:hover:bg-field/60">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="tnum font-mono text-[13px] text-mute">{c.code}</span>
                        <span className="rounded-full bg-field px-2 py-0.5 text-[12px] font-medium">{kindLabel(c.kind)}</span>
                      </span>
                      <span className={`mt-1 block truncate text-[16px] ${c.status === 'open' ? 'font-medium' : ''}`}>{c.consumer_name}</span>
                      <span className="block truncate text-[13px] text-soft">
                        {fmtDate(c.created_at)}{c.location_name ? `, ${c.location_name}` : ''}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${cls}`}>{chip}</span>
                    <ChevronRight size={16} strokeWidth={1.75} className="hidden shrink-0 text-soft sm:block" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ComplaintSheet c={current} onClose={() => setOpenId(null)} onAnswered={onAnswered} />
    </>
  );
}

function ComplaintSheet({ c, onClose, onAnswered }: { c: Complaint | null; onClose: () => void; onAnswered: (id: string, response: string) => void }) {
  const api = useApi();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setText(''); }, [c?.id]);

  const trimmed = text.trim();

  function insert(p: string) {
    haptic.tap();
    setText((t) => (t.trim() ? `${t.trimEnd()} ${p}` : p));
  }

  async function send() {
    if (!c || trimmed.length < 10) return;
    if (!confirm(`¿Enviar la respuesta a ${c.consumer_name}? Le llegará por correo y ya no podrás cambiarla.`)) return;
    setBusy(true);
    try {
      await api(`/admin/complaints/${c.id}/respond`, { method: 'POST', body: { response: trimmed } });
      toast.success('Respuesta enviada');
      onAnswered(c.id, trimmed);
    } catch (e) {
      if ((e as Error).message === 'ya_respondido') {
        toast.info('Esta hoja ya fue respondida.');
        onAnswered(c.id, trimmed);
      } else toast.error('No se pudo enviar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const open = c?.status === 'open';
  const chip = c ? dueChip(c) : null;

  return (
    <Drawer
      open={!!c}
      onClose={onClose}
      title={c ? `${kindLabel(c.kind)} ${c.code}` : 'Hoja'}
      footer={open ? (
        <><Btn variant="ghost" onClick={onClose}>Cerrar</Btn><Btn onClick={send} busy={busy} disabled={trimmed.length < 10}>Enviar respuesta</Btn></>
      ) : <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>}
    >
      {c && chip && (
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${chip[1]}`}>{chip[0]}</span>
            <span className="text-[14px] text-mute">Recibido el {fmtDate(c.created_at, true)}</span>
          </div>
          <p className="text-[14px] text-soft">
            {c.kind === 'queja' ? 'Queja: malestar con la atención, sin relación directa con el servicio.' : 'Reclamo: no está conforme con el servicio o producto.'}
            {open && ` Plazo para responder: ${fmtDate(c.due_at)}.`}
          </p>

          <Block title="Consumidor">
            <Row label="Nombre" value={c.consumer_name} />
            <Row label={c.consumer_doc_type} value={c.consumer_doc_number} mono />
            {c.consumer_address && <Row label="Dirección" value={c.consumer_address} />}
            {c.consumer_phone && <Row label="Teléfono" value={c.consumer_phone} mono href={`tel:${c.consumer_phone}`} />}
            {c.consumer_email && <Row label="Correo" value={c.consumer_email} href={`mailto:${c.consumer_email}`} />}
            {c.is_minor && <Row label="Menor de edad" value={c.guardian_name ? `Sí. Apoderado: ${c.guardian_name}` : 'Sí'} />}
          </Block>

          <Block title="Bien contratado">
            <Row label="Tipo" value={c.item_type === 'producto' ? 'Producto' : 'Servicio'} />
            {c.item_amount_cents != null && <Row label="Monto" value={soles(c.item_amount_cents)} mono />}
            {c.item_description && <Row label="Descripción" value={c.item_description} />}
            {c.location_name && <Row label="Sede" value={c.location_name} icon={MapPin} />}
          </Block>

          <div>
            <h3 className="mb-1.5 text-[15px] font-semibold">Detalle</h3>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.detail}</p>
          </div>
          {c.request && (
            <div>
              <h3 className="mb-1.5 text-[15px] font-semibold">Qué pide</h3>
              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.request}</p>
            </div>
          )}

          {c.status === 'answered' ? (
            <div className="rounded-xl bg-field p-4">
              <h3 className="text-[15px] font-semibold">Tu respuesta</h3>
              {c.responded_at && <p className="text-[13px] text-mute">Enviada el {fmtDate(c.responded_at, true)}</p>}
              <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.response}</p>
            </div>
          ) : (
            <div className="border-t border-line pt-6">
              <label htmlFor="reclamo-respuesta" className="mb-1.5 block text-[15px] font-semibold">Tu respuesta</label>
              <p className="mb-3 text-[14px] text-mute">
                Explica qué pasó y qué harás para solucionarlo. Se envía al correo del cliente y queda guardada en la hoja.
                {!c.consumer_email && ' Este cliente no dejó correo: comunícate también por teléfono.'}
              </p>
              <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
                {QUICK.map((p) => (
                  <button key={p} type="button" onClick={() => insert(p)} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-field px-3.5 text-[14px] hover:bg-line">
                    <Plus size={14} strokeWidth={2} className="text-mute" /> {p}
                  </button>
                ))}
              </div>
              <textarea
                id="reclamo-respuesta"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={5000}
                className={`resize-y ${inputCls}`}
                placeholder={`Hola ${c.consumer_name.split(' ')[0]}, gracias por escribirnos.`}
              />
              <p className="mt-1 flex justify-between gap-3 text-[13px] text-soft">
                <span className="flex items-center gap-1.5"><Mail size={13} strokeWidth={1.75} /> {c.consumer_email ?? 'Sin correo'}</span>
                <span className="tnum">{trimmed.length < 10 ? `Mínimo 10 caracteres` : `${trimmed.length} caracteres`}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[15px] font-semibold">{title}</h3>
      <dl className="divide-y divide-line border-y border-line text-[15px]">{children}</dl>
    </section>
  );
}

function Row({ label, value, mono, href, icon: Icon }: { label: string; value: string; mono?: boolean; href?: string; icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-4 py-3">
      <dt className="flex items-center gap-1.5 text-mute">{Icon && <Icon size={14} strokeWidth={1.75} />}{label}</dt>
      <dd className={`min-w-0 break-words text-right ${mono ? 'tnum' : ''}`}>
        {href ? <a href={href} className="underline-offset-4 hover:underline">{value}</a> : value}
      </dd>
    </div>
  );
}
