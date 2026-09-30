'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LocateFixed, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

/**
 * "Cerca de mí": pide la ubicación del navegador y vuelve a buscar con lat y lng
 * (la API ordena por distancia). Si ya está activo, un toque lo quita.
 */
export function NearMeButton({ params, active }: { params: Record<string, string | undefined>; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function go(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `/search?${qs}` : '/search');
  }

  function base() {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return qs;
  }

  function locate() {
    haptic.tap();
    if (active) {
      const qs = base();
      qs.delete('lat');
      qs.delete('lng');
      go(qs);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Tu navegador no permite compartir la ubicación.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const qs = base();
        qs.set('lat', pos.coords.latitude.toFixed(4));
        qs.set('lng', pos.coords.longitude.toFixed(4));
        haptic.success();
        go(qs);
      },
      (err) => {
        setBusy(false);
        if (err.code === err.PERMISSION_DENIED) toast.error('Activa el permiso de ubicación para ver barberías cerca de ti.');
        else if (err.code === err.TIMEOUT) toast.error('Tu ubicación tardó demasiado. Intenta de nuevo.');
        else toast.error('No pudimos encontrar tu ubicación. Prueba eligiendo un distrito.');
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }

  return (
    <button
      type="button"
      onClick={locate}
      disabled={busy}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors disabled:opacity-60 ${
        active ? 'bg-ink text-white hover:bg-ink-2' : 'border border-line-2 bg-white text-ink hover:border-ink'
      }`}
    >
      {busy ? <Loader2 size={17} strokeWidth={1.75} className="animate-spin" /> : <LocateFixed size={17} strokeWidth={1.75} />}
      Cerca de mí
      {active && <X size={15} strokeWidth={1.75} aria-label="Quitar" />}
    </button>
  );
}
