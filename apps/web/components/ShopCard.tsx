import { soles, type SearchResult } from '@/lib/api';
import { tenantUrl } from '@/lib/config';

export function ShopCard({ r }: { r: SearchResult }) {
  return (
    <a href={tenantUrl(r.slug)} className="glass card-hover block overflow-hidden rounded-3xl">
      <div className="relative h-36 bg-gradient-to-br from-indigo-500/20 via-violet-500/20 to-fuchsia-500/20">
        {r.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.cover_url} alt={r.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-display text-2xl font-bold text-white/70">{r.name.charAt(0)}</span>
          </div>
        )}
        {r.rating && (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-amber-600 shadow">
            ★ {r.rating}
          </span>
        )}
      </div>
      <div className="p-5">
        <h3 className="text-lg font-bold">{r.name}</h3>
        <p className="text-sm text-slate-500">{r.location_name} · {r.district}</p>
        {r.tagline && <p className="mt-1 line-clamp-1 text-sm text-slate-600">{r.tagline}</p>}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold">Desde {soles(r.desde_cents)}</span>
          <span className="rounded-lg bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{r.barberos} barberos</span>
        </div>
      </div>
    </a>
  );
}
