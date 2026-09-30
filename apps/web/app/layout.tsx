import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://date.pe'),
  title: {
    default: 'date.pe | Reserva tu barbería en Lima en un minuto',
    template: '%s | date.pe',
  },
  description:
    'Encuentra barberías en tu distrito, elige barbero y hora, y confirma tu cita pagando el adelanto con Yape. Sin llamar y sin instalar nada.',
  keywords: ['barbería', 'reservar barbería', 'barbero', 'corte de cabello', 'fade', 'barba', 'Lima', 'Perú', 'Yape'],
  openGraph: {
    title: 'date.pe | Reserva tu barbería en Lima en un minuto',
    description: 'Elige barbero y hora, paga el adelanto con Yape y listo.',
    url: 'https://date.pe',
    siteName: 'date.pe',
    locale: 'es_PE',
    type: 'website',
    images: [{ url: '/img/og.jpg', width: 1200, height: 630, alt: 'date.pe, reservas de barbería en Lima' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'date.pe | Reserva tu barbería en Lima',
    description: 'Elige barbero y hora, paga el adelanto con Yape y listo.',
    images: ['/img/og.jpg'],
  },
  alternates: { canonical: 'https://date.pe' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
