import { Fraunces, Anton, Cormorant_Garamond, DM_Serif_Display, Inter_Tight } from 'next/font/google';

// Tipografías de titulares por ambiente. Sin precarga: el navegador descarga solo la
// que usa la página de cada barbería.
export const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'], display: 'swap', preload: false, variable: '--f-fraunces' });
export const anton = Anton({ subsets: ['latin'], weight: '400', display: 'swap', preload: false, variable: '--f-anton' });
export const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], style: ['normal', 'italic'], display: 'swap', preload: false, variable: '--f-cormorant' });
export const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], display: 'swap', preload: false, variable: '--f-dmserif' });
export const interTight = Inter_Tight({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap', preload: false, variable: '--f-intertight' });

export const fontVars = [fraunces, anton, cormorant, dmSerif, interTight].map((f) => f.variable).join(' ');
