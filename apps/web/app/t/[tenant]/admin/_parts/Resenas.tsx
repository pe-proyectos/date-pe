'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, MessageSquareQuote } from 'lucide-react';
import { useApi } from './api';
import { PageHead, Btn, Switch, Empty, Skeleton, inputCls } from './ui';
import { toast } from '@/lib/toast';

interface Review { id: string; stars: number; comment: string | null; reply: string | null; is_published: boolean; created_at: string; staff_name: string | null; client_name: string | null }

export function Resenas() {
  const api = useApi();
  const [list, setList] = useState<Review[] | null>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const load = useCallback(() => api<{ reviews: Review[] }>('/admin/reviews').then((d) => setList(d.reviews)).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const avg = list && list.length ? list.reduce((a, r) => a + r.stars, 0) / list.length : 0;

  async function saveReply(id: string) {
    try {
      await api(`/admin/reviews/${id}`, { method: 'PATCH', body: { reply: text.trim() } });
      toast.success('Respuesta publicada');
      setReplying(null);
      load();
    } catch {
      toast.error('No se pudo guardar.');
    }
  }

  return (
    <>
      <PageHead
        title="Reseñas"
        sub="Solo pueden opinar clientes que tuvieron una cita. Para pedir una, abre la cita completada en la agenda y copia el enlace."
      />
      {!list ? <Skeleton /> : list.length === 0 ? (
        <Empty icon={MessageSquareQuote} title="Aún no tienes reseñas" body="Después de cada cita completada, envía el enlace de reseña al cliente por WhatsApp." />
      ) : (
        <>
          <div className="mb-8 flex items-baseline gap-3">
            <span className="text-[40px] font-semibold leading-none tracking-[-0.04em]">{avg.toFixed(1)}</span>
            <span className="text-[15px] text-mute">promedio de {list.length} {list.length === 1 ? 'reseña' : 'reseñas'}</span>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {list.map((r) => (
              <li key={r.id} className={`py-5 ${r.is_published ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-0.5" aria-label={`${r.stars} de 5`}>
                    {Array.from({ length: 5 }, (_, k) => <Star key={k} size={14} strokeWidth={0} className={k < r.stars ? 'fill-ink' : 'fill-line-2'} />)}
                  </div>
                  <span className="text-[15px] font-medium">{r.client_name ?? 'Cliente'}</span>
                  <span className="text-[14px] text-mute">
                    {r.staff_name ? `con ${r.staff_name}, ` : ''}{new Date(r.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[13px] text-mute">{r.is_published ? 'Publicada' : 'Oculta'}</span>
                    <Switch checked={r.is_published} onChange={async (v) => { await api(`/admin/reviews/${r.id}`, { method: 'PATCH', body: { isPublished: v } }); load(); }} label="Reseña" states={['Publicada', 'Oculta']} />
                  </div>
                </div>
                {r.comment && <p className="mt-2 max-w-[70ch] text-[15px] leading-relaxed">{r.comment}</p>}
                {r.reply && replying !== r.id && <p className="mt-3 border-l border-line-2 pl-3 text-[14px] text-mute">Tu respuesta: {r.reply}</p>}
                {replying === r.id ? (
                  <div className="mt-3 flex max-w-xl flex-col gap-2">
                    <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} className={`resize-none ${inputCls}`} placeholder="Gracias por venir, te esperamos pronto." />
                    <div className="flex gap-2"><Btn onClick={() => saveReply(r.id)} disabled={!text.trim()}>Publicar respuesta</Btn><Btn variant="ghost" onClick={() => setReplying(null)}>Cancelar</Btn></div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setReplying(r.id); setText(r.reply ?? ''); }} className="-ml-1 mt-1 inline-flex min-h-11 items-center px-1 text-[14px] font-medium underline underline-offset-4">
                    {r.reply ? 'Editar respuesta' : 'Responder'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
