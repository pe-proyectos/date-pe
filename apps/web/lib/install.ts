'use client';

import { useEffect, useState } from 'react';

/**
 * Instalar la página de la barbería como app. Chrome y Android avisan con
 * "beforeinstallprompt" (se captura apenas carga la página, ver INSTALL_CAPTURE);
 * en iPhone no hay aviso: se explica cómo agregarla desde Compartir.
 */
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global {
  interface Window { __bip?: BIP | null }
}

/** Script en línea: guarda el aviso de instalación aunque llegue antes que React. */
export const INSTALL_CAPTURE = `addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;dispatchEvent(new Event('datepe:bip'))});addEventListener('appinstalled',function(){window.__bip=null;try{localStorage.setItem('datepe_installed','1')}catch(e){}dispatchEvent(new Event('datepe:bip'))});`;

export interface InstallState { ready: boolean; standalone: boolean; ios: boolean; inApp: boolean; canPrompt: boolean }

export function detect(): InstallState {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat|Line\//i.test(ua);
  return { ready: true, standalone, ios, inApp, canPrompt: !!window.__bip };
}

export function useInstall(): InstallState {
  const [s, setS] = useState<InstallState>({ ready: false, standalone: false, ios: false, inApp: false, canPrompt: false });
  useEffect(() => {
    const up = () => setS(detect());
    up();
    window.addEventListener('datepe:bip', up);
    return () => window.removeEventListener('datepe:bip', up);
  }, []);
  return s;
}

/** Muestra el aviso nativo de Chrome. true si el cliente aceptó. */
export async function promptInstall(): Promise<boolean> {
  const e = window.__bip;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  window.__bip = null;
  window.dispatchEvent(new Event('datepe:bip'));
  return outcome === 'accepted';
}

/** Pide abrir el flujo de instalación (tarjeta o pasos de iPhone) desde cualquier parte. */
export function openInstall(reason: 'app' | 'push' = 'app') {
  window.dispatchEvent(new CustomEvent('datepe:install', { detail: reason }));
}

export function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
