'use client';

import { useState } from 'react';
import { Images } from 'lucide-react';
import { Lightbox, type LightboxImage } from '@/components/Lightbox';

const MAX = 6;

/** Fotos de trabajos y del local: grilla liviana que abre el visor a pantalla completa. */
export function GalleryGrid({ images }: { images: LightboxImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const thumbs = images.slice(0, MAX);
  const rest = images.length - thumbs.length;

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {thumbs.map((img, i) => {
          const last = i === thumbs.length - 1 && rest > 0;
          return (
            <button
              key={img.src + i}
              type="button"
              onClick={() => setOpen(i)}
              className="zoom-media relative aspect-square overflow-hidden rounded-xl bg-field"
              aria-label={last ? `Ver las ${images.length} fotos` : `Ampliar foto: ${img.alt}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={img.alt} width={400} height={400} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              {last && (
                <span className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/55 text-[15px] font-medium text-white">
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
