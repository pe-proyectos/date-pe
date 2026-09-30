import Link from 'next/link';

/** Poste de barbero: la marca de date.pe. Las franjas giran en hover o con `live`. */
export function PoleMark({ size = 28, live = false, className = '' }: { size?: number; live?: boolean; className?: string }) {
  const stripes = [];
  for (let y = -24; y < 64; y += 16) {
    stripes.push(<path key={`r${y}`} d={`M4 ${y + 6} L16 ${y} L16 ${y + 4} L4 ${y + 10} Z`} fill="#D91023" />);
    stripes.push(<path key={`b${y}`} d={`M4 ${y + 14} L16 ${y + 8} L16 ${y + 12} L4 ${y + 18} Z`} fill="#1D3F94" />);
  }
  return (
    <svg
      width={size * 0.5}
      height={size}
      viewBox="0 0 20 40"
      fill="none"
      aria-hidden
      className={`${live ? 'pole-live' : ''} ${className}`}
    >
      <defs>
        <clipPath id="pole-body">
          <rect x="4" y="6" width="12" height="28" rx="6" />
        </clipPath>
      </defs>
      <rect x="4" y="6" width="12" height="28" rx="6" fill="#fff" />
      <g clipPath="url(#pole-body)">
        <g className="pole-stripes">{stripes}</g>
      </g>
      <rect x="4" y="6" width="12" height="28" rx="6" stroke="#0A0A0A" strokeWidth="1.5" />
      <rect x="5" y="1.5" width="10" height="4.5" rx="2.25" fill="#0A0A0A" />
      <rect x="5" y="34" width="10" height="4.5" rx="2.25" fill="#0A0A0A" />
    </svg>
  );
}

export function Logo({ className = '', inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2 ${className}`} aria-label="date.pe, inicio">
      <PoleMark size={28} />
      <span className={`text-[19px] font-semibold tracking-[-0.035em] ${inverted ? 'text-white' : 'text-ink'}`}>
        date.pe
      </span>
    </Link>
  );
}
