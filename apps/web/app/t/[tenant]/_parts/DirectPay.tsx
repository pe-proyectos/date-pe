'use client';

import { useEffect, useState } from 'react';
import { Copy, Check, ImagePlus, ShieldCheck, RefreshCw } from 'lucide-react';
import { soles } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { toast } from '@/lib/toast';

export interface PayInfo { pay_phone?: string | null; pay_holder?: string | null; pay_qr_url?: string | null; pay_apps?: string[] | null }

const APP_LABEL: Record<string, string> = { yape: 'Yape', plin: 'Plin' };

/**
 * Pago directo a la barbería: el cliente yapea o plinea al número de la barbería y sube la
 * captura. date.pe no recibe dinero; la barbería revisa la captura y confirma.
 */
export function DirectPay({
  info, amountCents, shop, file, onFile, app, onApp, title = 'Paga el adelanto',
}: {
  info: PayInfo; amountCents: number; shop: string; file: File | null; onFile: (f: File | null) => void; app: string; onApp: (a: string) => void; title?: string;
}) {
  const apps = (info.pay_apps?.length ? info.pay_apps : ['yape']).filter((a) => APP_LABEL[a]);
  const phone = (info.pay_phone ?? '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.pay_phone ?? '');
      haptic.tap();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.info(`El número es ${phone}`);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[15px] font-medium">{title}</p>
        <p className="tnum mt-1 text-[32px] font-semibold leading-none tracking-[-0.03em]">{soles(amountCents)}</p>
      </div>

      {apps.length > 1 && (
        <div className="flex gap-2" role="radiogroup" aria-label="App de pago">
          {apps.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={app === a} onClick={() => { haptic.select(); onApp(a); }} className={`min-h-11 rounded-full px-5 text-[15px] font-medium transition-colors ${app === a ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}>
              {APP_LABEL[a]}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 rounded-2xl border border-line p-4">
        {info.pay_qr_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.pay_qr_url} alt={`QR de ${APP_LABEL[app] ?? 'pago'}`} className="h-28 w-28 shrink-0 rounded-xl border border-line bg-white object-contain p-1" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-mute">{APP_LABEL[app] ?? 'Yape'} al número</p>
          <div className="flex items-center gap-2">
            <span className="tnum text-[24px] font-semibold tracking-[-0.02em]">{phone}</span>
            <button type="button" onClick={copy} aria-label="Copiar número" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-field">
              {copied ? <Check size={18} strokeWidth={2} /> : <Copy size={18} strokeWidth={1.75} />}
            </button>
          </div>
          {info.pay_holder && <p className="text-[14px] text-mute">A nombre de <span className="font-medium text-ink">{info.pay_holder}</span></p>}
        </div>
      </div>

      <ol className="space-y-1.5 text-[15px] text-mute">
        <li><span className="font-semibold text-ink">1.</span> Paga {soles(amountCents)} desde tu app de {APP_LABEL[app] ?? 'Yape'}.</li>
        <li><span className="font-semibold text-ink">2.</span> Toma una captura de la pantalla de pago.</li>
        <li><span className="font-semibold text-ink">3.</span> Súbela aquí.</li>
      </ol>

      {preview ? (
        <div className="flex items-center gap-4 rounded-2xl bg-field p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Tu captura" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[15px] font-medium text-ok"><Check size={16} strokeWidth={2.2} /> Captura lista</p>
            <label className="mt-1 inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-[14px] font-medium underline underline-offset-4">
              <RefreshCw size={14} strokeWidth={1.75} /> Cambiar
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
      ) : (
        <label className="flex min-h-[64px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-2 px-4 text-[16px] font-medium transition-colors hover:border-ink">
          <ImagePlus size={20} strokeWidth={1.75} /> Subir captura del pago
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </label>
      )}

      <p className="flex items-start gap-2 text-[13px] text-soft">
        <ShieldCheck size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        El pago va directo a {shop}. Cuando lo revisen, te confirmamos por correo.
      </p>
    </div>
  );
}
