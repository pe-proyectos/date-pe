import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'date.pe — Reserva tu barbería en Perú',
    template: '%s · date.pe',
  },
  description:
    'La forma más fácil de reservar en las mejores barberías de Lima y Perú. Elige tu barbero, tu horario y paga tu seña con Yape en segundos.',
  keywords: ['barbería', 'reservas', 'barbero', 'corte de cabello', 'Lima', 'Perú', 'Yape', 'citas'],
  metadataBase: new URL('https://date.pe'),
  openGraph: {
    title: 'date.pe — Reserva tu barbería en Perú',
    description: 'Reserva en las mejores barberías del Perú. Elige barbero, horario y paga tu seña con Yape.',
    url: 'https://date.pe',
    siteName: 'date.pe',
    locale: 'es_PE',
    type: 'website',
    images: [{ url: '/brand/og.png', width: 1376, height: 768, alt: 'date.pe — Reserva tu barbería en Perú' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'date.pe — Reserva tu barbería en Perú',
    description: 'Reserva en las mejores barberías del Perú. Paga tu seña con Yape.',
    images: ['/brand/og.png'],
  },
  alternates: { canonical: 'https://date.pe' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
