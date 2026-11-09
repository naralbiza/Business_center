// Marca: skyline dourado + nome. Usada na sidebar e nos ecrãs de autenticação.
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
      <path d="M6 52V30h9v22M18 52V16h11v36M32 52V4l13 4v44M48 52V24h9v28M3 52h58" />
      <path d="M22 22v3M22 30v3M22 38v3M37 14v3M37 22v3M37 30v3M37 38v3" strokeWidth="1.6" />
    </svg>
  );
}

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark className={`${compact ? "w-10" : "w-12"} shrink-0 text-gold`} />
      <span className="leading-none">
        <span className="block text-[9px] tracking-[0.32em] text-slate-200">BUSINESS CENTER</span>
        <span className="mt-1 block font-serif text-[22px] tracking-[0.04em] text-white">ESPERANÇA</span>
        <span className="mt-1 block text-[7px] tracking-[0.36em] text-gold/80">CENTRO EMPRESARIAL</span>
      </span>
    </span>
  );
}
