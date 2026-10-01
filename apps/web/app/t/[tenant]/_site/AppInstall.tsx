'use client';

import { useEffect, useState } from 'react';
import { Share, SquarePlus, X, Smartphone } from 'lucide-react';
import { useInstall, promptInstall, registerSW } from '@/lib/install';
import { haptic } from '@/lib/haptics';
import { SiteSheet } from './SiteSheet';

const DAY = 86_400_000;

/**
 * Invita a instalar la página como app en el celular. Aparece desde la segunda visita
 * (o después de reservar), nunca dentro de Instagram o Facebook, y si el cliente dice
 * "ahora no" vuelve recién en tres semanas. auto=false: solo atiende pedidos explícitos.
 */
export function AppInstall({ slug, shop, logo, auto = true }: { slug: string; shop: string; logo: string | null; auto?: boolean }) {
  const st = useInstall();
  const [card, setCard] = useState(false);
  const [steps, setSteps] = useState<null | 'app' | 'push'>(null);
  const noKey = `datepe_install_no_${slug}`;

  useEffect(() => {
    const t = setTimeout(registerSW, 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!auto || !st.ready || st.standalone || st.inApp || !(st.canPrompt || st.ios)) return;
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    let visits = Number(localStorage.getItem(`datepe_visits_${slug}`) ?? 0);
    if (!sessionStorage.getItem('datepe_s')) {
      sessionStorage.setItem('datepe_s', '1');
      localStorage.setItem(`datepe_visits_${slug}`, String(++visits));
    }
    const booked = !!localStorage.getItem(`datepe_booked_${slug}`);
    const no = Number(localStorage.getItem(noKey) ?? 0);
    if ((visits < 2 && !booked) || Date.now() - no < 21 * DAY || localStorage.getItem('datepe_installed')) return;
    const t = setTimeout(() => setCard(true), 6000);
    return () => clearTimeout(t);
  }, [auto, st, slug, noKey]);

  useEffect(() => {
    const on = (e: Event) => {
      const reason = (e as CustomEvent).detail === 'push' ? 'push' : 'app';
      if (st.canPrompt && reason === 'app') void promptInstall();
      else setSteps(reason);
    };
    window.addEventListener('datepe:install', on);
    return () => window.removeEventListener('datepe:install', on);
  }, [st.canPrompt]);

  const later = () => {
    localStorage.setItem(noKey, String(Date.now()));
    setCard(false);
  };
  const install = async () => {
    haptic.tap();
    if (st.canPrompt) {
      setCard(false);
      if (!(await promptInstall())) localStorage.setItem(noKey, String(Date.now()));
    } else {
      setCard(false);
      setSteps('app');
    }
  };

  return (
    <>
      {card && (
        <div
          role="dialog"
          aria-label={`Instalar ${shop}`}
          className="s-bg s-line s-sheet-up fixed inset-x-3 z-[45] flex items-center gap-3 rounded-[22px] border p-3 pr-2 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:hidden"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-[14px] object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}><Smartphone size={22} strokeWidth={1.6} /></span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-snug">Ten {shop} en tu celular</span>
            <span className="s-mute block text-[13px] leading-snug">Reserva en dos toques y recibe tus recordatorios.</span>
          </span>
          <button type="button" onClick={install} className="min-h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
            Instalar
          </button>
          <button type="button" onClick={later} aria-label="Ahora no" className="s-mute flex h-10 w-9 shrink-0 items-center justify-center">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
      )}

      <SiteSheet open={!!steps} onClose={() => setSteps(null)} title={steps === 'push' ? 'Avisos en tu iPhone' : 'Instalar la app'}>
        <p className="s-display text-[30px] leading-[1.05]">{shop}, <em>a un toque</em></p>
        <p className="s-mute mt-2 text-[16px] leading-relaxed">
          {steps === 'push'
            ? 'En iPhone los avisos llegan cuando agregas la página a tu pantalla de inicio. Toma 10 segundos.'
            : 'Agrégala a tu pantalla de inicio y ábrela como una app, sin descargar nada.'}
        </p>
        <ol className="mt-6 space-y-3">
          {[
            { icon: Share, text: <>Toca el botón <b>Compartir</b> de tu navegador, abajo o arriba de la pantalla.</> },
            { icon: SquarePlus, text: <>Elige <b>Agregar a inicio</b> y toca <b>Agregar</b>.</> },
            { icon: Smartphone, text: <>Abre <b>{shop}</b> desde tu pantalla de inicio{steps === 'push' ? ' y vuelve a tocar "Avísame en este celular"' : ''}.</> },
          ].map((s, i) => (
            <li key={i} className="s-surface s-radius flex items-center gap-4 p-4">
              <span className="tnum s-mute w-4 shrink-0 text-[15px] font-semibold">{i + 1}</span>
              <s.icon size={22} strokeWidth={1.6} className="shrink-0" />
              <span className="text-[15px] leading-snug">{s.text}</span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setSteps(null)} className="s-btn mt-6 w-full">Entendido</button>
      </SiteSheet>
    </>
  );
}
