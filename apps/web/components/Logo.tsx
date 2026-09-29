export function LogoIcon({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="dp-g" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#dp-g)" />
      {/* calendario */}
      <rect x="12.5" y="15" width="23" height="20" rx="4.5" stroke="white" strokeWidth="2.6" />
      <path d="M18 11.5V16M30 11.5V16" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      {/* corte / razor diagonal */}
      <path d="M16.5 32.5 L31.5 18" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <circle cx="31.7" cy="18" r="2.6" fill="#22D3EE" />
    </svg>
  );
}

export function Logo({ size = 32, dark = false, className = '' }: { size?: number; dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoIcon size={size} />
      <span
        className="font-display text-xl font-bold tracking-tight"
        style={{ color: dark ? '#fff' : 'var(--color-ink)' }}
      >
        date<span className="text-gradient">.pe</span>
      </span>
    </span>
  );
}
