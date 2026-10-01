import type { SiteMood, SiteTheme } from '@/lib/api';

// Ambientes de la página pública. Cada uno define paleta, tipografía de titulares y
// carácter (mayúsculas, radios, textura). El color de la marca se usa para acentos y
// el botón de reservar, siempre con contraste verificado contra el fondo.
export interface Mood {
  id: SiteMood;
  label: string;
  hint: string;
  dark: boolean;
  bg: string;
  surface: string;
  ink: string;
  mute: string;
  line: string;
  display: string; // font-family de titulares
  displayWeight: number;
  upper: boolean; // titulares en mayúsculas
  tracking: string; // letter-spacing de titulares
  italic: boolean; // acento en cursiva en la frase grande
  radius: string;
  leader: boolean; // puntos guía entre servicio y precio (carta de barbería)
}

export const MOODS: Record<SiteMood, Mood> = {
  clasica: {
    id: 'clasica', label: 'Clásica', hint: 'Cálida, con serifas. La barbería de siempre, bien cuidada.',
    dark: false, bg: '#f4ede3', surface: '#fbf7f1', ink: '#1f1a15', mute: '#6e6358', line: 'rgba(31,26,21,0.14)',
    display: 'var(--f-fraunces), Georgia, serif', displayWeight: 600, upper: false, tracking: '-0.025em', italic: true, radius: '14px', leader: true,
  },
  urbana: {
    id: 'urbana', label: 'Urbana', hint: 'Negro profundo y letras grandes. Fades, diseños y calle.',
    dark: true, bg: '#0b0b0b', surface: '#151515', ink: '#f3f1ec', mute: '#9b978f', line: 'rgba(255,255,255,0.12)',
    display: 'var(--f-anton), Impact, sans-serif', displayWeight: 400, upper: true, tracking: '0.005em', italic: false, radius: '6px', leader: false,
  },
  minimal: {
    id: 'minimal', label: 'Minimal', hint: 'Blanco, aire y precisión. Moderna y tranquila.',
    dark: false, bg: '#ffffff', surface: '#f5f5f4', ink: '#0a0a0a', mute: '#6b6b6b', line: 'rgba(0,0,0,0.10)',
    display: 'var(--f-intertight), system-ui, sans-serif', displayWeight: 600, upper: false, tracking: '-0.045em', italic: false, radius: '20px', leader: false,
  },
  lujo: {
    id: 'lujo', label: 'Lujo', hint: 'Oscura y serena, con serifas finas. Experiencia premium.',
    dark: true, bg: '#0f1210', surface: '#171b18', ink: '#eee6d6', mute: '#a39a89', line: 'rgba(238,230,214,0.14)',
    display: 'var(--f-cormorant), Georgia, serif', displayWeight: 500, upper: false, tracking: '-0.01em', italic: true, radius: '2px', leader: true,
  },
  vintage: {
    id: 'vintage', label: 'Vintage', hint: 'Papel, tinta y carta de precios. Tradición de barrio.',
    dark: false, bg: '#ece0c8', surface: '#f4ead7', ink: '#2b1d14', mute: '#77604c', line: 'rgba(43,29,20,0.22)',
    display: 'var(--f-dmserif), Georgia, serif', displayWeight: 400, upper: true, tracking: '0.02em', italic: true, radius: '4px', leader: true,
  },
};

export const MOOD_LIST = Object.values(MOODS);

/** Colores del mapa por ambiente: el mapa se pinta con la paleta de la página. */
export interface MapPalette { land: string; water: string; park: string; building: string; road: string; roadMajor: string; casing: string; label: string; halo: string }
export const MAP_PALETTES: Record<SiteMood, MapPalette> = {
  clasica: { land: '#efe6d8', water: '#c9d6cf', park: '#dfe3cc', building: '#e6dac7', road: '#fbf7f1', roadMajor: '#ffffff', casing: '#e2d5c1', label: '#6e6358', halo: '#f4ede3' },
  urbana: { land: '#141414', water: '#0b0b0b', park: '#181a18', building: '#1c1c1c', road: '#262626', roadMajor: '#333333', casing: '#1b1b1b', label: '#8a867f', halo: '#0b0b0b' },
  minimal: { land: '#f4f4f3', water: '#dfe5ea', park: '#e8ede6', building: '#ebebea', road: '#ffffff', roadMajor: '#ffffff', casing: '#e2e2e1', label: '#7a7a7a', halo: '#ffffff' },
  lujo: { land: '#161a17', water: '#0e1210', park: '#1a201b', building: '#1d221e', road: '#262c27', roadMajor: '#323a33', casing: '#1a1f1b', label: '#9d9483', halo: '#0f1210' },
  vintage: { land: '#e6d8bc', water: '#c3c7b4', park: '#d7d2b1', building: '#dccca9', road: '#f3e9d4', roadMajor: '#f7efdc', casing: '#d3c19c', label: '#77604c', halo: '#ece0c8' },
};

function lum(hex: string) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export function resolveTheme(t: SiteTheme | null | undefined, accentRaw: string | null | undefined) {
  const mood = MOODS[t?.mood ?? 'clasica'] ?? MOODS.clasica;
  const accent = /^#[0-9a-f]{3,8}$/i.test(accentRaw ?? '') ? (accentRaw as string) : mood.ink;
  const onAccent = lum(accent) > 0.45 ? '#0a0a0a' : '#ffffff';
  // El acento como texto solo si se lee sobre el fondo; si no, la tinta del ambiente
  const accentText = contrast(accent, mood.bg) >= 3 ? accent : mood.ink;
  return {
    mood,
    accent,
    onAccent,
    accentText,
    hero: t?.hero ?? 'imagen',
    headline: t?.headline?.trim() || null,
    marquee: t?.marquee !== false,
    since: t?.since ?? null,
    focus: typeof t?.focus === 'number' ? Math.min(100, Math.max(0, t.focus)) : 50,
  };
}

/** Variables CSS del ambiente para el contenedor de la página. */
export function themeVars(r: ReturnType<typeof resolveTheme>): Record<string, string> {
  const m = r.mood;
  return {
    '--s-bg': m.bg,
    '--s-surface': m.surface,
    '--s-ink': m.ink,
    '--s-mute': m.mute,
    '--s-line': m.line,
    '--s-display': m.display,
    '--s-display-weight': String(m.displayWeight),
    '--s-display-case': m.upper ? 'uppercase' : 'none',
    '--s-display-tracking': m.tracking,
    '--s-radius': m.radius,
    '--accent': r.accent,
    '--on-accent': r.onAccent,
    '--accent-text': r.accentText,
  };
}

/**
 * Páginas de flujo (reservar, fila, turno, regalos) usan los colores base del sistema
 * (ink, field, line...). Aquí se reemplazan por los del ambiente para que conserven la
 * identidad de la barbería sin reescribirlas.
 */
export function flowVars(r: ReturnType<typeof resolveTheme>): Record<string, string> {
  const m = r.mood;
  return {
    ...themeVars(r),
    '--color-ink': m.ink,
    '--color-ink-2': m.ink,
    '--color-mute': m.mute,
    '--color-soft': m.mute,
    '--color-line': m.line,
    '--color-line-2': m.dark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.22)',
    '--color-field': m.surface,
    '--color-canvas': m.bg,
    '--color-white': m.bg,
  };
}
