"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { Logout, Shield } from "./icons";

export default function UserMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const roleLabel: Record<string, string> = { super_admin: "Super Admin", financeiro: "Financeiro", eventos: "Eventos", rh: "RH", operador: "Operador", demo: "Demonstração" };
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-white/5">
        <span className="grid size-10 place-items-center rounded-full border border-gold/50 bg-gradient-to-br from-panel2 to-[#0b1426] text-sm font-medium text-gold-soft">{initials}</span>
        <span className="hidden text-left text-xs leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium">{name}</span>
          <span className="text-slate-300">{roleLabel[role] ?? role}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-slate-300 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <Link href="/utilizadores" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5"><Shield className="size-4 text-gold" />Utilizadores</Link>
          <form action={signOut}><button className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-sm hover:bg-white/5"><Logout className="size-4 text-gold" />Terminar sessão</button></form>
        </div>
      )}
    </div>
  );
}
