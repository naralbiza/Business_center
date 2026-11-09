import type { ReactNode } from "react";
import Link from "next/link";

export const Card = ({ title, children, href, className = "" }: { title?: string; children: ReactNode; href?: string; className?: string }) => (
  <section className={`a-up overflow-x-auto rounded-2xl border border-white/[0.09] bg-gradient-to-b from-[#0e1c28]/90 to-[#07121a]/90 p-5 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.9),0_1px_0_0_rgba(255,255,255,0.04)_inset] transition duration-300 hover:-translate-y-0.5 hover:border-gold/30 ${className}`}>
    {title && (
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg">{title}</h2>
        {href && <Link href={href} className="text-xs text-gold hover:text-gold-soft">Ver todos →</Link>}
      </div>
    )}
    {children}
  </section>
);

const tones: Record<string, string> = {
  ocupado: "bg-ok/20 text-ok", ativo: "bg-ok/20 text-ok", confirmada: "bg-ok/20 text-ok", livre: "bg-slate-500/25 text-slate-200",
  a_terminar: "bg-warn/20 text-warn", manutencao: "bg-bad/20 text-bad", expirado: "bg-bad/20 text-bad",
  reservado: "bg-warn/20 text-warn", bloqueado: "bg-bad/20 text-bad", cancelado: "bg-slate-500/20 text-slate-300",
};
export const Badge = ({ value }: { value: string }) => (
  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[value] ?? "bg-slate-500/20 text-slate-300"}`}>{value.replace("_", " ")}</span>
);

export const Progress = ({ pct }: { pct: number }) => (
  <div className="h-2 w-full rounded bg-panel2"><div className="h-2 rounded bg-gold" style={{ width: `${Math.min(100, pct)}%` }} /></div>
);

export const inputCls = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-500 focus:border-gold";
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block space-y-1.5"><span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</span>{children}</label>
);
export const Submit = ({ children }: { children: ReactNode }) => (
  <button className="btn-gold rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:brightness-105 active:scale-[0.98]">{children}</button>
);

export const PageHeader = ({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) => (
  <div className="space-y-1">
    {back && <Link href={back} className="text-xs text-slate-400 transition-colors hover:text-gold">← Voltar</Link>}
    <h1 className="text-3xl">{title}</h1>
    {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
  </div>
);
export const FormError = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-red-300 sm:col-span-2">{children}</p>
);
