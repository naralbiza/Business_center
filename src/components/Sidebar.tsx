"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import * as I from "./icons";

const groups = [
  { title: "", items: [{ href: "/", label: "Dashboard", icon: I.Home }] },
  { title: "Gestão", items: [
    { href: "/escritorios", label: "Escritórios", icon: I.Building },
    { href: "/contratos", label: "Contratos", icon: I.File },
    { href: "/pagamentos", label: "Pagamentos", icon: I.Wallet },
    { href: "/dividas", label: "Faturas e Dívidas", icon: I.Coins },
    { href: "/impostos", label: "Impostos", icon: I.Receipt },
    { href: "/documentos", label: "Documentos", icon: I.Folder },
  ] },
  { title: "Eventos e Espaços", items: [
    { href: "/eventos", label: "Eventos", icon: I.Heart },
    { href: "/agenda", label: "Agenda", icon: I.Calendar },
    { href: "/restaurante", label: "Restaurante", icon: I.Utensils },
    { href: "/reservas", label: "Reservas", icon: I.Bookmark },
  ] },
  { title: "Operações", items: [
    { href: "/operacoes", label: "Operações", icon: I.Gear },
  ] },
  { title: "Recursos Humanos", items: [
    { href: "/rh", label: "Recursos Humanos", icon: I.Users },
  ] },
  { title: "Relatórios", items: [
    { href: "/relatorios", label: "Relatórios & Analytics", icon: I.Chart },
  ] },
  { title: "Administração", items: [
    { href: "/utilizadores", label: "Utilizadores e Permissões", icon: I.Shield },
    { href: "/notificacoes", label: "Notificações", icon: I.Bell },
    { href: "/configuracoes", label: "Definições", icon: I.Gear },
  ] },
];

// Rota → módulo de permissões; sem entrada = sempre visível
const MODULE_OF: Record<string, string> = {
  "/": "dashboard", "/escritorios": "escritorios", "/contratos": "contratos", "/pagamentos": "financeiro", "/dividas": "financeiro",
  "/impostos": "financeiro", "/documentos": "financeiro", "/eventos": "eventos", "/agenda": "eventos", "/reservas": "eventos",
  "/restaurante": "restaurante", "/operacoes": "operacoes", "/rh": "rh", "/relatorios": "relatorios", "/utilizadores": "administracao",
};

export default function Sidebar({ unread = 0, perms }: { unread?: number; perms?: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Páginas que redirecionam (salão, permissões, analytics) não ficam ativas por si; "/" só no início.
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label="Menu" className="fixed left-3 top-3 z-40 rounded-md border border-line bg-panel p-2 md:hidden">
        {open ? <I.Close /> : <I.Menu />}
      </button>
      <aside className={`${open ? "block" : "hidden"} fixed inset-y-0 left-0 z-30 w-[236px] shrink-0 overflow-y-auto border-r border-white/[0.06] bg-[#010d17] px-[10px] pb-6 pt-14 md:sticky md:top-0 md:block md:h-screen md:pt-4`}>
        <Link href="/" className="mb-4 block px-3 pt-1" onClick={() => setOpen(false)}><Image src="/logo.png" alt="Business Center Esperança" width={205} height={68} priority className="h-auto w-[205px]" /></Link>
        <nav className="space-y-3.5">
          {groups.map((g) => ({ ...g, items: g.items.filter((it) => { const m = MODULE_OF[it.href]; return !perms || !m || (perms[m] ?? 0) >= 1; }) })).filter((g) => g.items.length > 0).map((g) => (
            <div key={g.title || "main"}>
              {g.title && <div className="mb-1 px-3 text-[11px] uppercase tracking-[0.1em] text-slate-400">{g.title}</div>}
              <div className="space-y-px">
                {g.items.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13px] transition-colors ${active(href)
                      ? "border border-gold/60 bg-gradient-to-r from-[#5a4a2a] via-[#3d3321] to-[#2a2518] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border border-transparent text-slate-200 hover:bg-white/[0.05]"}`}>
                    <Icon className={`size-[17px] shrink-0 ${active(href) ? "text-gold-soft" : "text-slate-300"}`} />{label}
                    {href === "/notificacoes" && unread > 0 && <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-bad px-1.5 text-[11px] font-semibold leading-5 text-white">{unread}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
