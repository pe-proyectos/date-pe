import { Gift } from 'lucide-react';
import { onColor } from '@/lib/color';

/** Vista previa de la gift card tal como la verá quien la recibe, con la marca de la barbería. */
export function GiftPreview({
  shopName, logoUrl, accent, amountCents, to, from, message, deliverOn,
}: {
  shopName: string; logoUrl: string | null; accent: string; amountCents: number;
  to: string; from: string; message: string; deliverOn: string | null;
}) {
  const ink = onColor(accent);
  const soft = ink === '#ffffff' ? 'rgb(255 255 255 / 0.72)' : 'rgb(10 10 10 / 0.62)';
  const amount = amountCents > 0 ? (amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2) : '0';
  const when = deliverOn
    ? new Date(`${deliverOn}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })
    : null;

  return (
    <figure aria-label="Vista previa de la gift card">
      <div
        className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[18px] p-5 shadow-lift sm:p-6"
        style={{ background: accent, color: ink }}
      >
        {/* Franjas del poste, sutiles, en la esquina */}
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rotate-12 rounded-[28px] opacity-[0.14]"
          style={{ background: `repeating-linear-gradient(135deg, ${ink} 0 10px, transparent 10px 22px)` }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-9 w-9 rounded-full bg-white object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold" style={{ background: ink, color: accent }}>
                {shopName.replace(/^Barber[ií]a\s+/i, '').charAt(0)}
              </span>
            )}
            <span className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em]">{shopName}</span>
            <Gift size={20} strokeWidth={1.75} className="ml-auto shrink-0" />
          </div>
          <div>
            <div className="text-[13px] font-medium" style={{ color: soft }}>Gift card</div>
            <div className="tnum text-[clamp(2.25rem,8vw,3.25rem)] font-semibold leading-none tracking-[-0.04em]">S/ {amount}</div>
          </div>
          <div className="flex items-end justify-between gap-3 text-[14px]">
            <div className="min-w-0">
              <div className="truncate" style={{ color: soft }}>Para</div>
              <div className="truncate font-medium">{to.trim() || 'Su nombre'}</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate" style={{ color: soft }}>De</div>
              <div className="truncate font-medium">{from.trim() || 'Tu nombre'}</div>
            </div>
          </div>
        </div>
      </div>
      {(message.trim() || when) && (
        <figcaption className="mt-3 rounded-xl border border-line bg-white p-4 text-[15px]">
          {message.trim() && <p className="whitespace-pre-line text-ink-2">&quot;{message.trim()}&quot;</p>}
          {when && <p className={`text-[13px] text-soft ${message.trim() ? 'mt-2' : ''}`}>Llega por correo el {when}.</p>}
        </figcaption>
      )}
    </figure>
  );
}
