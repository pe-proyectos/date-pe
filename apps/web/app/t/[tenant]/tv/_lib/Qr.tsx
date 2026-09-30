'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** SVG del código QR (nítido a cualquier tamaño). */
export async function qrSvg(text: string, dark = '#0a0a0a', light = '#ffffff', margin = 1) {
  return QRCode.toString(text, { type: 'svg', margin, errorCorrectionLevel: 'M', color: { dark, light } });
}

/** Código QR generado en el navegador. Ocupa todo el ancho de su contenedor. */
export function Qr({ value, dark = '#0a0a0a', light = '#ffffff', className = '', label }: { value: string; dark?: string; light?: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!value) return;
    let alive = true;
    qrSvg(value, dark, light)
      .then((s) => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, dark, light]);
  return (
    <div
      role="img"
      aria-label={label ?? `Código QR para ${value}`}
      className={`aspect-square [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={{ background: light }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
