import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'date.pe — Reserva tu barbería en Perú',
    template: '%s · date.pe',
  },
  description:
    'Encuentra y reserva las mejores barberías de Lima y Perú. Elige barbero, horario y paga tu seña con Yape.',
  metadataBase: new URL('https://date.pe'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
