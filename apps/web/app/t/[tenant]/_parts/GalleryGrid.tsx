'use client';

import { useState } from 'react';
import { Images } from 'lucide-react';
import { Lightbox, type LightboxImage } from '@/components/Lightbox';

/**
 * Trabajos y local en mosaico: la primera foto manda, las demás la acompañan.
 * Se adapta de 1 a 7 fotos sin huecos; el visor abre a pantalla completa.
 */
export function GalleryGrid({ images }: { images: LightboxImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const max = images.length >= 7 ? 7 : images.length >= 5 ? 5 : images.length >= 3 ? 3 : images.length;
  const thumbs = images.slice(0, max);
  const rest = images.length - thumbs.length;
  const layout =
    thumbs.length >= 5
      ? 'grid-cols-2 md:grid-cols-4 md:grid-rows-2'
      : thumbs.length === 3
        ? 'grid-cols-2 md:grid-cols-3 md:grid-rows-2'
        : thumbs.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-1';

  return (
    <>
      <div className={`mt-10 grid auto-rows-[160px] gap-2 sm:auto-rows-[220px] md:gap-3 ${layout}`}>
        {thumbs.map((img, i) => {
          const last = i === thumbs.length - 1 && rest > 0;
          const hero = i === 0 && thumbs.length >= 3;
          return (
            <button
              key={img.src + i}
              type="button"
              onClick={() => setOpen(i)}
              className={`s-img-zoom s-radius s-surface group relative overflow-hidden ${hero ? 'col-span-2 row-span-2' : ''} ${thumbs.length === 1 ? 'row-span-2' : ''}`}
              aria-label={last ? `Ver las ${images.length} fotos` : `Ampliar foto: ${img.alt}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={img.alt} width={hero ? 900 : 480} height={hero ? 900 : 480} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              {!last && img.alt && !/^Foto \d/.test(img.alt) && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-left text-[14px] font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {img.alt}
                </span>
              )}
              {last && (
                <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/55 text-[16px] font-semibold text-white">
                  <Images size={18} strokeWidth={1.75} /> +{rest + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Lightbox images={images} index={open} onClose={() => setOpen(null)} />
    </>
  );
}
