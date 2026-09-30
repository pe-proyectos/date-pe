'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, publicApi, type Song } from '../_lib/queue';

// Tipos mínimos del YouTube IFrame Player API
interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  stopVideo(): void;
  playVideo(): void;
  mute(): void;
  unMute(): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width?: number | string;
      height?: number | string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytPromise: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      ytPromise = null;
      reject(new Error('youtube_no_carga'));
    };
    document.head.appendChild(s);
  });
  return ytPromise;
}

const ENDED = 0;

/**
 * Reproductor de música de la TV. Pide la siguiente canción al empezar, al terminar,
 * al fallar y cuando no suena nada pero hay pedidos. Arranca en silencio (los navegadores
 * bloquean el sonido automático) y se activa cuando alguien toca la pantalla.
 */
export function useTvMusic({
  tenant,
  tvKey,
  enabled,
  nowPlaying,
  upNext,
  volume,
  soundOn,
  duck,
  onChanged,
}: {
  tenant: string;
  tvKey: string;
  enabled: boolean;
  nowPlaying: Song | null;
  upNext: Song[];
  volume: number;
  soundOn: boolean;
  /** Baja el volumen mientras se anuncia un turno. */
  duck: boolean;
  onChanged: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const currentId = useRef<string | null>(null);
  const nowRef = useRef(nowPlaying);
  nowRef.current = nowPlaying;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [keyError, setKeyError] = useState(false);
  const lastAdvance = useRef(0);
  const finished = useRef(new Set<string>());
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  const advance = useCallback(
    async (finishedId?: string, failed?: boolean) => {
      if (!tvKey) return;
      if (finishedId) {
        if (finished.current.has(finishedId)) return;
        finished.current.add(finishedId);
      }
      lastAdvance.current = Date.now();
      try {
        await publicApi(tenant, '/public/music/tv/advance', { method: 'POST', body: { key: tvKey, ...(finishedId ? { finishedId } : {}), ...(failed ? { failed: true } : {}) } });
        setKeyError(false);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'llave_invalida') setKeyError(true);
      }
      changedRef.current();
    },
    [tenant, tvKey],
  );

  const volRef = useRef(volume);
  volRef.current = volume;
  const duckRef = useRef(duck);
  duckRef.current = duck;

  const applyVolume = useCallback(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try {
      if (soundRef.current) {
        p.unMute();
        p.setVolume(Math.round(Math.max(0, Math.min(100, duckRef.current ? volRef.current * 0.2 : volRef.current))));
      } else p.mute();
    } catch {
      /* */
    }
  }, []);

  const loadCurrent = useCallback(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    const song = nowRef.current;
    if (!song) {
      if (currentId.current) {
        currentId.current = null;
        try {
          p.stopVideo();
        } catch {
          /* */
        }
      }
      return;
    }
    if (currentId.current === song.id) return;
    currentId.current = song.id;
    // Si la TV se recargó a mitad de canción, sigue desde donde iba
    let startSeconds = 0;
    if (song.started_at) {
      const elapsed = (Date.now() - new Date(song.started_at).getTime()) / 1000;
      const dur = song.duration_s ?? 0;
      if (elapsed > 5 && (!dur || elapsed < dur - 5) && elapsed < 15 * 60) startSeconds = Math.floor(elapsed);
    }
    try {
      p.loadVideoById({ videoId: song.video_id, startSeconds });
      applyVolume();
    } catch {
      /* */
    }
  }, [applyVolume]);

  // Crea el reproductor cuando la música está activa
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadYouTube()
      .then((YT) => {
        if (!alive || !hostRef.current) return;
        const el = document.createElement('div');
        hostRef.current.appendChild(el);
        playerRef.current = new YT.Player(el, {
          width: 320,
          height: 180,
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, mute: 1, fs: 0, iv_load_policy: 3 },
          events: {
            onReady: () => {
              readyRef.current = true;
              applyVolume();
              loadCurrent();
            },
            onStateChange: (e) => {
              if (e.data === ENDED && currentId.current) advance(currentId.current);
            },
            onError: () => {
              if (currentId.current) advance(currentId.current, true);
            },
          },
        });
      })
      .catch(() => {});
    // Al abrir la pantalla: si no suena nada, que empiece la siguiente
    advance();
    return () => {
      alive = false;
      readyRef.current = false;
      currentId.current = null;
      try {
        playerRef.current?.destroy();
      } catch {
        /* */
      }
      playerRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Cambió la canción actual
  useEffect(() => {
    if (enabled) loadCurrent();
  }, [enabled, nowPlaying?.id, loadCurrent]);

  // No suena nada pero hay pedidos: pide la siguiente (con freno para no insistir)
  useEffect(() => {
    if (!enabled || nowPlaying || upNext.length === 0) return;
    const wait = Math.max(0, 4000 - (Date.now() - lastAdvance.current));
    const t = setTimeout(() => advance(), wait);
    return () => clearTimeout(t);
  }, [enabled, nowPlaying, upNext.length, advance]);

  useEffect(() => {
    applyVolume();
  }, [soundOn, volume, duck, applyVolume]);

  // Barra de progreso
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current || !currentId.current) return setProgress((s) => (s.current || s.duration ? { current: 0, duration: 0 } : s));
      try {
        setProgress({ current: p.getCurrentTime() || 0, duration: p.getDuration() || 0 });
      } catch {
        /* */
      }
    }, 1000);
    return () => clearInterval(t);
  }, [enabled]);

  return { hostRef, progress, keyError };
}
