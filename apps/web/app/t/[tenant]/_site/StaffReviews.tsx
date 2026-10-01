'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';

interface Review { stars: number; comment: string; reply: string | null; created_at: string; staff_id: string | null; staff_name: string | null; client_name: string | null }
interface Board { total: number; avg: number | null; distribution: Record<string, number>; reviews: Review[] }
interface StaffOpt { id: string; name: string }

const PAGE = 12;

/**
 * Opiniones con resumen (promedio y barras por estrellas), filtro por barbero y "Ver más".
 * Sirve para la página de opiniones y para el perfil de cada barbero.
 */
export function ReviewsBoard({ tenant, staff = [], fixedStaff, tz, compact = false }: { tenant: string; staff?: StaffOpt[]; fixedStaff?: string; tz: string; compact?: boolean }) {
  const [who, setWho] = useState<string | null>(fixedStaff ?? null);
  const [data, setData] = useState<Board | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async (offset: number) => {
    const q = new URLSearchParams({ limit: String(compact ? 4 : PAGE), offset: String(offset) });
    if (who) q.set('staffId', who);
    const r = await fetch(`${API_BASE_CLIENT}/api/public/reviews?${q}`, { headers: { 'X-Tenant-Slug': tenant } });
    return (await r.json()) as Board;
  }, [tenant, who, compact]);

  useEffect(() => {
    let alive = true;
    setData(null);
    load(0).then((d) => alive && setData(d)).catch(() => {});
    return () => { alive = false; };
  }, [load]);

  async function loadMore() {
    if (!data) return;
    setMore(true);
    try {
      const next = await load(data.reviews.length);
      setData({ ...data, reviews: [...data.reviews, ...next.reviews] });
    } finally {
      setMore(false);
    }
  }

  const max = data ? Math.max(1, ...Object.values(data.distribution)) : 1;
  return (
    <div>
      {!compact && staff.length > 1 && (
        <div className="s-no-scrollbar -mx-5 mb-10 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
          <button type="button" aria-pressed={who === null} onClick={() => setWho(null)} className="s-chip shrink-0">Todos</button>
          {staff.map((s) => <button key={s.id} type="button" aria-pressed={who === s.id} onClick={() => setWho(s.id)} className="s-chip shrink-0">{s.name}</button>)}
        </div>
      )}

      {!data ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="s-surface s-radius h-40 animate-pulse" />)}</div>
      ) : data.total === 0 ? (
        <p className="s-mute text-[16px]">Aún no hay opiniones publicadas.</p>
      ) : (
        <div className={compact ? '' : 'grid gap-12 lg:grid-cols-12'}>
          {!compact && (
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <p className="s-display tnum text-[96px] leading-none">{data.avg?.toFixed(1)}</p>
                <div className="mt-3 flex gap-1" style={{ color: 'var(--accent-text)' }} aria-label={`${data.avg} de 5`}>
                  {Array.from({ length: 5 }, (_, k) => <Star key={k} size={20} strokeWidth={0} className={k < Math.round(data.avg ?? 0) ? 'fill-current' : 'fill-current opacity-20'} />)}
                </div>
                <p className="s-mute mt-3 text-[15px]">{data.total} {data.total === 1 ? 'opinión verificada' : 'opiniones verificadas'}. Solo opinan clientes que reservaron y vinieron.</p>
                <ul className="mt-8 space-y-2.5">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <li key={n} className="flex items-center gap-3 text-[14px]">
                      <span className="tnum w-3">{n}</span>
                      <Star size={13} strokeWidth={0} className="fill-current" />
                      <span className="s-surface h-2 flex-1 overflow-hidden rounded-full">
                        <span className="block h-full rounded-full" style={{ width: `${(data.distribution[n] / max) * 100}%`, background: 'var(--accent-text)' }} />
                      </span>
                      <span className="tnum s-mute w-6 text-right">{data.distribution[n]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
          <div className={compact ? '' : 'lg:col-span-8'}>
            <div className={`grid gap-4 ${compact ? 'md:grid-cols-2' : ''}`}>
              {data.reviews.map((r, i) => (
                <figure key={i} className="s-surface s-radius p-6 md:p-8">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-0.5" aria-label={`${r.stars} de 5`}>
                      {Array.from({ length: 5 }, (_, k) => <Star key={k} size={15} strokeWidth={0} className={k < r.stars ? 'fill-current' : 'fill-current opacity-20'} />)}
                    </div>
                    <span className="s-mute text-[13px]">{new Date(r.created_at).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: tz })}</span>
                  </div>
                  <blockquote className={`mt-4 leading-relaxed ${compact ? 'text-[16px]' : 'text-[18px]'}`}>{r.comment}</blockquote>
                  <figcaption className="s-mute mt-5 text-[14px]">
                    <span className="s-ink font-semibold">{r.client_name ?? 'Cliente'}</span>
                    {r.staff_name && !fixedStaff ? `, con ${r.staff_name}` : ''}
                  </figcaption>
                  {r.reply && <p className="s-line s-mute mt-4 border-l-2 pl-3 text-[14px]"><span className="s-ink font-semibold">Respuesta de la casa.</span> {r.reply}</p>}
                </figure>
              ))}
            </div>
            {!compact && data.reviews.length < data.total && (
              <button type="button" onClick={loadMore} disabled={more} className="s-btn-ghost mt-8">
                {more && <Loader2 size={16} className="animate-spin" />} Ver más opiniones
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
