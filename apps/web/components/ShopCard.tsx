import { Star } from 'lucide-react';
import { soles, type SearchResult } from '@/lib/api';
import { tenantUrl } from '@/lib/config';

export function ShopCard({ r }: { r: SearchResult }) {
  return (
    <a href={tenantUrl(r.slug)} className="group block">
      <div className="zoom-media relative aspect-[4/3] rounded-xl bg-field">
        {r.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.cover_url} alt={r.name} loading="lazy" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-xl">
            <span className="text-5xl font-semibold tracking-[-0.04em] text-line-2">{r.name.charAt(0)}</span>
          </div>
        )}
        {r.is_demo && (
          <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink">Demo</span>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-medium tracking-[-0.02em]">{r.name}</h3>
          <p className="truncate text-[15px] text-mute">{r.district ?? r.location_name}</p>
        </div>
        {r.rating && (
          <span className="tnum flex shrink-0 items-center gap-1 text-[15px]">
            <Star size={14} strokeWidth={0} className="fill-ink" /> {Number(r.rating).toFixed(1)}
          </span>
        )}
      </div>
      <p className="tnum mt-1 text-[15px]">
        <span className="font-medium">Desde {soles(r.desde_cents)}</span>
        <span className="text-mute"> {Number(r.barberos) === 1 ? '1 barbero' : `${r.barberos} barberos`}</span>
      </p>
    </a>
  );
}
