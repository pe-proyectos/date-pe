'use client';

import { useState } from 'react';
import { Images } from 'lucide-react';
import { Lightbox, type LightboxImage } from './Lightbox';

/** Portada de la barbería que abre el visor con todas sus fotos. */
export function TenantGallery({ cover, images, accent }: { cover: LightboxImage | null; images: LightboxImage[]; accent: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const all = [...(cover ? [cover] : []), ...images];

  return (
    <>
      <div className="relative mt-6 overflow-hidden rounded-xl bg-field">
        {cover ? (
          <button type="button" onClick={() => setOpen(0)} className="group block w-full" aria-label="Ver fotos de la barbería">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.src} alt={cover.alt} fetchPriority="high" className="aspect-[16/10] w-full object-cover transition-transform duration-700 group-hover:scale-[1.02] md:aspect-[21/9]" />
          </button>
        ) : (
          <div className="aspect-[21/9] w-full" style={{ background: accent }} />
        )}
        {all.length > 1 && (
          <button
            type="button"
            onClick={() => setOpen(0)}
            className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[14px] font-medium shadow-lift"
          >
            <Images size={16} strokeWidth={1.75} /> Ver {all.length} fotos
          </button>
        )}
      </div>
      <Lightbox images={all} index={open} onClose={() => setOpen(null)} />
    </>
  );
}
