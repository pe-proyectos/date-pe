'use client';

import { useEffect, useState } from 'react';
import { BellRing, Check, Loader2 } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';
import { pushSupported, subscribePush } from '@/lib/push';
import { useInstall, openInstall } from '@/lib/install';
import { toast } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

/**
 * "Avísame en este celular": recordatorio antes de la cita, pedido de reseña y aviso para
 * volver. Se vincula con el enlace de la cita (manageToken) o con la cuenta (accountToken).
 */
export function NotifyMe({ tenant, manageToken, accountToken, className = '' }: { tenant: string; manageToken?: string | null; accountToken?: string | null; className?: string }) {
  const st = useInstall();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<'idle' | 'busy' | 'on' | 'denied'>('idle');
  const flag = `datepe_push_${tenant}`;

  useEffect(() => {
    fetch(`${API_BASE_CLIENT}/api/public/push/key`, { headers: { 'X-Tenant-Slug': tenant } })
      .then((r) => r.json())
      .then((d) => setKey(d.key ?? null))
      .catch(() => setKey(null));
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'denied') setState('denied');
      else if (Notification.permission === 'granted' && localStorage.getItem(flag)) setState('on');
    }
  }, [tenant, flag]);

  // Sin llaves de push, sin cita/cuenta o navegador sin soporte (salvo iPhone: ahí se explica cómo instalar)
  if (!key || (!manageToken && !accountToken) || !st.ready) return null;
  const iosNeedsInstall = st.ios && !st.standalone;
  if (!iosNeedsInstall && !pushSupported()) return null;

  async function enable() {
    haptic.tap();
    if (iosNeedsInstall) return openInstall('push');
    setState('busy');
    try {
      const sub = await subscribePush(key!);
      if (!sub) {
        setState(Notification.permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      const r = await fetch(`${API_BASE_CLIENT}/api/public/push/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenant, ...(accountToken ? { Authorization: `Bearer ${accountToken}` } : {}) },
        body: JSON.stringify({ manageToken: manageToken ?? undefined, subscription: sub }),
      });
      if (!r.ok) throw new Error();
      localStorage.setItem(flag, '1');
      setState('on');
      haptic.success();
      toast.success('Listo, te avisaremos en este celular.');
    } catch {
      setState('idle');
      toast.error('No pudimos activar los avisos. Intenta de nuevo.');
    }
  }

  if (state === 'on') {
    return (
      <p className={`s-surface s-radius flex min-h-[56px] items-center gap-3 px-4 text-[15px] ${className}`}>
        <Check size={18} strokeWidth={2} className="shrink-0" /> Avisos activados en este celular
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className={`s-mute s-line s-radius flex items-start gap-3 border p-4 text-[14px] leading-snug ${className}`}>
        <BellRing size={18} strokeWidth={1.6} className="mt-0.5 shrink-0" /> Bloqueaste los avisos para esta página. Puedes activarlos desde los ajustes del navegador.
      </p>
    );
  }
  return (
    <button type="button" onClick={enable} disabled={state === 'busy'} className={`s-surface s-radius flex min-h-[64px] w-full items-center gap-4 px-4 text-left transition-transform active:scale-[0.99] ${className}`}>
      {state === 'busy' ? <Loader2 size={20} className="shrink-0 animate-spin" /> : <BellRing size={20} strokeWidth={1.6} className="shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">Avísame en este celular</span>
        <span className="s-mute block text-[14px]">Te recordamos tu cita antes de la hora.</span>
      </span>
    </button>
  );
}
