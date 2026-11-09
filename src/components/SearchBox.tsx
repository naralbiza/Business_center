"use client";
import { useEffect, useRef } from "react";
import { Search } from "./icons";

// Pesquisa global. Atalho ⌘K / Ctrl+K foca o campo.
export default function SearchBox() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form action="/pesquisa" className="min-w-0 flex-1"><div className="relative w-full max-w-[670px]">
      <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
      <input ref={ref} name="q" placeholder="Pesquisar empresas, escritórios, contratos, eventos…"
        className="h-11 w-full rounded-xl border border-white/15 bg-[#07121b]/70 pl-10 pr-16 text-sm outline-none backdrop-blur placeholder:text-slate-300 focus:border-gold" />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300 md:block">⌘ K</kbd>
    </div></form>
  );
}
