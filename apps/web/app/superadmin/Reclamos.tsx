'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ExternalLink, AlertTriangle, Loader2, Send, X, CalendarClock, CheckCircle2 } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { Pill, fechaCorta, fechaHora, type Tone } from './ui';

interface Complaint {
  id: string;
  code: string;
  kind: 'reclamo' | 'queja';
  status: 'open' | 'answered';
  consumer_name: string;
  consumer_doc_type: string;
  consumer_doc_number: string;
  consumer_address: string | null;
  consumer_phone: string | null;
  consumer_email: string;
  is_minor: boolean;
  guardian_name: string | null;
  item_type: 'servicio' | 'producto' | string;
  item_amount_cents: number | string | null;
  item_description: string;
  detail: string;
  request: string;
  response: string | null;
  responded_at: string | null;
  due_at: string;
  created_at: string;
  location_name: string | null;
}
interface Provider {
  tradeName: string;
  legalName: string | null;
  ruc: string | null;
  address: string | null;
  email: string | null;
}

const PUBLIC_URL = 'https://date.pe/reclamaciones';
const soles = (c: number | string) => `S/ ${(Number(c) / 100).toFixed(2)}`;
const DAY = 864e5;

/** Chip del plazo: cuántos días quedan, cuánto se venció o cuándo se respondió. */
function dueOf(c: Complaint): { label: string; tone: Tone } {
  if (c.status === 'answered') return { label: c.responded_at ? `Respondido el ${fechaCorta(c.responded_at)}` : 'Respondido', tone: 'ok' };
  const diff = new Date(c.due_at).getTime() - Date.now();
  if (diff < 0) {
    const n = Math.max(1, Math.floor(-diff / DAY));
    return { label: `Vencido hace ${n} ${n === 1 ? 'día' : 'días'}`, tone: 'bad' };
  }
  if (diff < DAY) return { label: 'Vence hoy', tone: 'warn' };
  const n = Math.ceil(diff / DAY);
  return { label: `Vence en ${n} días`, tone: n <= 5 ? 'warn' : 'mute' };
}

const kindLabel = (k: Complaint['kind']) => (k === 'queja' ? 'Queja' : 'Reclamo');

/** Libro de Reclamaciones de la propia date.pe. */
export function Reclamos({ headers }: { headers: Record<string, string> }) {
  const [list, setList] = useState<Complaint[] | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/platform/complaints`, { headers });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const rows: Complaint[] = d.complaints ?? [];
      rows.sort((a, b) => (a.status === b.status ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : a.status === 'open' ? -1 : 1));
      setList(rows);
      setProvider(d.provider ?? null);
      setFailed(false);
    } catch {
      setFailed(true);
      setList((l) => l ?? []);
    }
  }, [headers]);
  useEffect(() => {
    load();
  }, [load]);

  const open = (list ?? []).filter((c) => c.status === 'open').length;
  const current = (list ?? []).find((c) => c.id === openId) ?? null;

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold tracking-[-0.03em]">
            Libro de Reclamaciones
            {open > 0 && <span className="tnum rounded-full bg-red px-2.5 py-0.5 text-[13px] font-semibold text-white">{open} por responder</span>}
          </h2>
          <p className="mt-1 text-[14px] text-mute">Reclamos y quejas dejados a date.pe. Respóndelos dentro de 15 días hábiles.</p>
        </div>
        <a href={PUBLIC_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-2 px-4 text-[14px] font-medium hover:border-ink">
          <ExternalLink size={16} strokeWidth={1.75} /> Ver la hoja pública
        </a>
      </div>

      {provider && !provider.ruc && (
        <div className="flex items-start gap-3 rounded-xl bg-[#fff4e0] p-4 text-[14px] text-[#8a5300]">
          <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <p className="min-w-0">Completa PLATFORM_LEGAL_NAME, PLATFORM_RUC y PLATFORM_ADDRESS en el .env para que la hoja muestre los datos legales de date.pe.</p>
        </div>
      )}

      {!list ? (
        <div className="h-32 animate-pulse rounded-xl bg-field" />
      ) : failed && list.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-2 p-8 text-mute">
          <AlertTriangle size={20} strokeWidth={1.5} /> No se pudieron cargar los reclamos.
          <button type="button" onClick={load} className="rounded-full border border-line px-4 py-2 text-[14px] font-medium text-ink hover:border-ink">Reintentar</button>
        </div>
      ) : list.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-8 text-mute">
          <BookOpen size={20} strokeWidth={1.5} className="shrink-0" /> Todavía no hay reclamos ni quejas. Si llega uno, aparece aquí y te llega por correo.
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {list.map((c) => {
            const due = dueOf(c);
            return (
              <li key={c.id} className="min-w-0">
                <button type="button" onClick={() => { haptic.tap(); setOpenId(c.id); }} className="w-full rounded-xl border border-line p-4 text-left transition-colors hover:border-ink">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tnum truncate text-[13px] font-medium text-soft">{c.code}</p>
                      <p className="truncate text-[16px] font-semibold">{c.consumer_name}</p>
                    </div>
                    <Pill label={kindLabel(c.kind)} tone={c.kind === 'reclamo' ? 'bad' : 'mute'} />
                  </div>
                  <p className="mt-1 line-clamp-2 break-words text-[14px] text-mute">{c.detail}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Pill label={due.label} tone={due.tone} />
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-soft">
                      <CalendarClock size={13} strokeWidth={1.75} /> {fechaCorta(c.created_at)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ComplaintSheet c={current} headers={headers} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

function ComplaintSheet({ c, headers, onClose, onChanged }: { c: Complaint | null; headers: Record<string, string>; onClose: () => void; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const id = c?.id;
  useEffect(() => {
    setText('');
    setConfirm(false);
  }, [id]);

  if (!c) return <Sheet open={false} onClose={onClose} title="Reclamo">{null}</Sheet>;

  async function send() {
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE_CLIENT}/api/platform/complaints/${c!.id}/respond`, { method: 'POST', headers, body: JSON.stringify({ response: text.trim() }) });
      if (r.ok) {
        haptic.success();
        toast.success('Respuesta enviada al consumidor');
        onChanged();
      } else if (r.status === 409) {
        toast.info('Este reclamo ya fue respondido.');
        onChanged();
      } else toast.error('No se pudo enviar la respuesta.');
    } catch {
      toast.error('No se pudo enviar la respuesta.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const due = dueOf(c);
  const valid = text.trim().length >= 10;
  const rows: Array<[string, string | null]> = [
    ['Código', c.code],
    ['Tipo', kindLabel(c.kind)],
    ['Fecha', fechaHora(c.created_at)],
    ['Plazo', fechaCorta(c.due_at)],
    ['Local', c.location_name],
    ['Nombre', c.consumer_name],
    ['Documento', `${c.consumer_doc_type} ${c.consumer_doc_number}`],
    ['Domicilio', c.consumer_address],
    ['Teléfono', c.consumer_phone],
    ['Correo', c.consumer_email],
    ['Menor de edad', c.is_minor ? `Sí, apoderado: ${c.guardian_name ?? 'no indicó'}` : 'No'],
    ['Bien contratado', c.item_type === 'producto' ? 'Producto' : 'Servicio'],
    ['Monto reclamado', c.item_amount_cents != null ? soles(c.item_amount_cents) : 'No indicó'],
    ['Descripción', c.item_description],
  ];

  return (
    <Sheet open onClose={onClose} title={`${kindLabel(c.kind)} ${c.code}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill label={due.label} tone={due.tone} />
          <span className="text-[13px] text-soft">Llegó el {fechaCorta(c.created_at)}</span>
        </div>

        <dl className="divide-y divide-line rounded-xl border border-line text-[15px]">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex items-start gap-3 px-4 py-3">
                <dt className="w-32 shrink-0 text-mute">{k}</dt>
                <dd className="min-w-0 flex-1 break-words">{v}</dd>
              </div>
            ))}
        </dl>

        <div>
          <p className="mb-1.5 text-[14px] font-medium">Detalle</p>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-field p-3 text-[15px] leading-relaxed">{c.detail}</p>
        </div>
        <div>
          <p className="mb-1.5 text-[14px] font-medium">Pedido del consumidor</p>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-field p-3 text-[15px] leading-relaxed">{c.request}</p>
        </div>

        {c.status === 'answered' ? (
          <div className="rounded-xl bg-ok-tint p-4 text-[15px] text-ok">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 size={17} strokeWidth={1.75} /> Respondido{c.responded_at ? ` el ${fechaHora(c.responded_at)}` : ''}
            </p>
            {c.response && <p className="mt-2 whitespace-pre-wrap break-words text-ink">{c.response}</p>}
          </div>
        ) : (
          <div className="rounded-xl border border-ink p-4">
            <label className="block">
              <span className="block text-[16px] font-semibold">Responder</span>
              <span className="mt-1 block text-[13px] text-mute">Se envía por correo al consumidor. Por ley tienes 15 días hábiles.</span>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setConfirm(false); }}
                rows={6}
                maxLength={5000}
                className="mt-3 w-full resize-y rounded-xl border border-line-2 px-3.5 py-3 text-[16px] outline-none focus:border-ink"
                placeholder={`Hola ${c.consumer_name.split(' ')[0]}, revisamos tu ${kindLabel(c.kind).toLowerCase()}...`}
              />
            </label>
            {!valid && text.trim().length > 0 && <p className="mt-1 text-[13px] text-soft">Escribe al menos 10 caracteres.</p>}
            {!confirm ? (
              <button type="button" disabled={!valid || busy} onClick={() => { haptic.select(); setConfirm(true); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-[15px] font-medium text-white disabled:opacity-40">
                <Send size={17} strokeWidth={1.75} /> Enviar respuesta
              </button>
            ) : (
              <div className="mt-3 rounded-xl bg-field p-4">
                <p className="text-[14px]">¿Enviar la respuesta a {c.consumer_email}? No se puede editar después.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={send} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={1.75} />} Sí, enviar
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px]">
                    <X size={15} /> Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
