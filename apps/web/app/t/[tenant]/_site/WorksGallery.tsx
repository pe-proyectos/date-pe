'use client';

import { useState } from 'react';
import { Lightbox } from '@/components/Lightbox';

interface Photo { src: string; alt: string; staffId: string | null }

/** Todos los trabajos en columnas tipo revista, con pie de foto y filtro por barbero. */
export function WorksGallery({ photos, staff }: { photos: Photo[]; staff: Array<{ id: string; name: string }> }) {
  const [who, setWho] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const withWork = staff.filter((s) => photos.some((p) => p.staffId === s.id));
  const list = who ? photos.filter((p) => p.staffId === who) : photos;
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? null;

  return (
    <div>
      {withWork.length > 1 && (
        <div className="s-no-scrollbar -mx-5 mb-10 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
          <button type="button" aria-pressed={who === null} onClick={() => setWho(null)} className="s-chip shrink-0">Todos</button>
          {withWork.map((s) => <button key={s.id} type="button" aria-pressed={who === s.id} onClick={() => setWho(s.id)} className="s-chip shrink-0">{s.name}</button>)}
        </div>
      )}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {list.map((p, i) => (
          <figure key={p.src + i} className="mb-4 break-inside-avoid">
            <button type="button" onClick={() => setOpen(i)} className="s-img-zoom s-radius s-surface group relative block w-full overflow-hidden" aria-label={`Ampliar: ${p.alt}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={p.alt} loading={i < 3 ? 'eager' : 'lazy'} decoding="async" className="w-full object-cover" style={{ aspectRatio: i % 3 === 1 ? '4 / 5' : i % 3 === 2 ? '1 / 1' : '4 / 5' }} />
            </button>
            <figcaption className="mt-3 flex items-baseline justify-between gap-3 text-[15px]">
              <span>{p.alt}</span>
              {nameOf(p.staffId) && <span className="s-mute shrink-0 text-[13px]">{nameOf(p.staffId)}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
      <Lightbox images={list} index={open} onClose={() => setOpen(null)} />
    </div>
  );
}
