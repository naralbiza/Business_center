"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ContractDisplay, ContractVM } from "@/lib/contractsBoard";
import { datePt, kz } from "@/lib/format";
import * as I from "@/components/icons";

const STATE: Record<ContractDisplay, { label: string; solid: string }> = {
  ativo: { label: "Activo", solid: "bg-[#16a34a] text-white" },
  a_terminar: { label: "A terminar", solid: "bg-[#d99a1f] text-[#1a1305]" },
  em_atraso: { label: "Em Atraso", solid: "bg-[#e5484d] text-white" },
  expirado: { label: "Terminado", solid: "bg-[#3b4a66] text-white" },
  cancelado: { label: "Cancelado", solid: "bg-[#4b5563] text-white" },
};
const TABS = [
  { key: "todos", label: "Todos", test: () => true },
  { key: "activos", label: "Activos", test: (c: ContractVM) => c.status === "ativo" || c.status === "a_terminar" },
  { key: "termino", label: "Próximos do Término", test: (c: ContractVM) => c.status === "a_terminar" },
  { key: "atraso", label: "Em Atraso", test: (c: ContractVM) => c.display === "em_atraso" },
  { key: "terminados", label: "Terminados", test: (c: ContractVM) => c.status === "expirado" },
  { key: "cancelados", label: "Cancelados", test: (c: ContractVM) => c.status === "cancelado" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
type SortKey = "number" | "company" | "office" | "end" | "state" | "due";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const initials = (n: string) => n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const dueText = (d: number | null) => (d === null ? "" : d < 0 ? `(${d} dias)` : `(${d} dias)`);

function pagesFor(total: number, cur: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total, total - 1, cur - 1, cur, cur + 1]);
  const arr = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
}

export default function ContractsBoard({ contracts, buildings, monthStart }: { contracts: ContractVM[]; buildings: { id: string; name: string }[]; monthStart: string }) {
  const [tab, setTab] = useState<TabKey>("todos");
  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState("todos");
  const [state, setState] = useState("todos");
  const [endBy, setEndBy] = useState("");
  const [more, setMore] = useState(false);
  const [minRent, setMinRent] = useState("");
  const [endFrom, setEndFrom] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "number", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(contracts[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuId(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const total = contracts.length;
  const count = (k: TabKey) => contracts.filter(TABS.find((t) => t.key === k)!.test).length;
  const active = count("activos"), ending = count("termino"), late = count("atraso"), done = count("terminados");
  const before = contracts.filter((c) => c.created_at < monthStart).length;
  const growth = before ? Math.round(((total - before) / before) * 100) : null;

  const q = norm(query.trim());
  const filtered = useMemo(() => {
    const tabTest = TABS.find((t) => t.key === tab)!.test;
    const list = contracts.filter((c) =>
      tabTest(c) &&
      (building === "todos" || c.office?.building_id === building) &&
      (state === "todos" || c.display === state) &&
      (!endBy || c.end_date <= endBy) &&
      (!endFrom || c.end_date >= endFrom) &&
      (!minRent || c.monthly >= Number(minRent)) &&
      (!q || [c.number, c.company?.name, c.company?.nif, c.office?.number].some((v) => v && norm(String(v)).includes(q))));
    const val = (c: ContractVM): string | number => {
      switch (sort.key) {
        case "number": return c.number;
        case "company": return c.company?.name ?? "";
        case "office": return c.office?.number ?? "";
        case "end": return c.end_date;
        case "state": return STATE[c.display].label;
        default: return c.next_due_date ?? "9999";
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt", { numeric: true })) * sort.dir;
    });
  }, [contracts, tab, building, state, endBy, endFrom, minRent, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const from = filtered.length ? (cur - 1) * pageSize + 1 : 0;
  const to = Math.min(cur * pageSize, filtered.length);
  const selected = contracts.find((c) => c.id === selectedId) ?? null;

  const resetPage = () => setPage(1);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const th = (label: string, className: string, k?: SortKey) => (
    <th className={className}>
      {k ? <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-white">{label}<span className={`text-[9px] ${sort.key === k ? "text-gold" : "text-slate-500"}`}>{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}</span></button> : label}
    </th>
  );

  const exportCsv = () => {
    const head = ["Contrato", "Empresa", "NIF", "Escritório", "Edifício", "Início", "Término", "Valor mensal", "Valor total", "Estado", "Próximo vencimento"];
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const lines = filtered.map((c) => [c.number, c.company?.name, c.company?.nif, c.office?.number, c.office?.building, c.start_date, c.end_date, Math.round(c.monthly), Math.round(c.total_value), STATE[c.display].label, c.next_due_date].map(esc).join(";"));
    const blob = new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `contratos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const kpis = [
    { n: total, t: "Total de Contratos", icon: I.File, c: "from-[#2a4a8f] to-[#16264d]", sub: growth === null ? null : <span className="flex items-center gap-1.5 text-xs"><span className={growth >= 0 ? "text-emerald-400" : "text-red-400"}>{growth >= 0 ? "↑" : "↓"} {Math.abs(growth)}%</span><span className="text-slate-400">vs mês anterior</span></span>, bar: null as null | [number, string] },
    { n: active, t: "Contratos Activos", icon: I.Check, c: "from-[#16a34a] to-[#0d5c2b]", sub: null, bar: [active / Math.max(1, total), "#16a34a"] as [number, string] },
    { n: ending, t: "Próximos do Término", icon: I.Clock, c: "from-[#b8862b] to-[#6a4a12]", sub: null, bar: [ending / Math.max(1, total), "#e0a122"] as [number, string] },
    { n: late, t: "Contratos em Atraso", icon: I.Alert, c: "from-[#e5484d] to-[#7a1f23]", sub: null, bar: [late / Math.max(1, total), "#e5484d"] as [number, string] },
    { n: done, t: "Contratos Terminados", icon: I.Clock, c: "from-[#4f46e5] to-[#2a2585]", sub: null, bar: [done / Math.max(1, total), "#6b7fb3"] as [number, string] },
  ];

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+1rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right 28%" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/80 via-[#020b13]/20 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl leading-none md:text-6xl">Contratos</h1>
            <p className="mt-3 max-w-xs text-sm leading-snug text-slate-100">Gestão completa dos contratos de locação do Business Center Esperança.</p>
          </div>
          <Link href="/contratos/novo" className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Novo Contrato</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#07121b]/85 p-3.5 backdrop-blur">
              <span className={`grid size-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-6" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-3xl font-semibold leading-none">{k.n}</div>
                <div className="mt-1 truncate text-sm text-slate-200">{k.t}</div>
                {k.sub}
                {k.bar && <div className="mt-1.5 h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(4, k.bar[0] * 100)}%`, background: k.bar[1] }} /></div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Separadores por estado ───── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); resetPage(); }}
            className={`rounded-lg border px-5 py-2.5 text-sm transition-colors ${tab === t.key ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>
            {t.label} ({count(t.key)})
          </button>
        ))}
      </div>

      {/* ───── Filtros ───── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <I.Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
            <input value={query} onChange={(e) => { setQuery(e.target.value); resetPage(); }} placeholder="Pesquisar por empresa, NIF, número do contrato…"
              className="h-11 w-full rounded-lg border border-line bg-panel pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-gold" />
          </div>
          <select value={building} onChange={(e) => { setBuilding(e.target.value); resetPage(); }} aria-label="Edifício" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
            <option value="todos">Todos os edifícios</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={state} onChange={(e) => { setState(e.target.value); resetPage(); }} aria-label="Estado" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
            <option value="todos">Todos os estados</option>
            {Object.entries(STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-slate-200" title="Termina até">
            <span className="whitespace-nowrap text-slate-400">Término até</span>
            <input type="date" value={endBy} onChange={(e) => { setEndBy(e.target.value); resetPage(); }} className="bg-transparent text-sm outline-none [color-scheme:dark]" />
          </label>
          <button onClick={() => setMore(!more)} className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm ${more ? "border-gold/60 text-gold-soft" : "border-line bg-panel hover:border-gold/40"}`}><I.Filter className="size-4" />Mais filtros</button>
          <button onClick={exportCsv} className="flex h-11 items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-4 text-sm font-medium text-gold-soft hover:bg-gold/20"><I.Download className="size-4" />Exportar</button>
        </div>
        {more && (
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4">
            <label className="text-xs text-slate-400">Término a partir de<input type="date" value={endFrom} onChange={(e) => { setEndFrom(e.target.value); resetPage(); }} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100 [color-scheme:dark]" /></label>
            <label className="text-xs text-slate-400">Valor mensal mínimo (Kz)<input type="number" min="0" value={minRent} onChange={(e) => { setMinRent(e.target.value); resetPage(); }} className="mt-1 block h-10 w-44 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
            <button onClick={() => { setQuery(""); setBuilding("todos"); setState("todos"); setEndBy(""); setEndFrom(""); setMinRent(""); setTab("todos"); resetPage(); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar tudo</button>
          </div>
        )}
      </div>

      {/* ───── Tabela + painel de detalhe ───── */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="min-w-0 rounded-2xl border border-line bg-panel/90 p-3">
          {rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">{total === 0 ? "Ainda não há contratos." : "Nenhum contrato corresponde aos filtros."}</p>
          ) : (
            <div className="overflow-x-auto" ref={menuRef}>
              <table className="min-w-[860px]">
                <thead className="bg-white/[0.04]">
                  <tr>
                    {th("Contrato", "pl-3 pt-3", "number")}{th("Empresa", "pt-3", "company")}{th("Escritório", "pt-3", "office")}
                    {th("Período do Contrato", "pt-3", "end")}{th("Valor Mensal", "pt-3")}{th("Estado", "pt-3", "state")}
                    {th("Próximo Vencimento", "pt-3", "due")}{th("Ações", "pt-3")}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const st = STATE[c.display];
                    const lateDue = (c.next_due_days ?? 0) < 0;
                    return (
                      <tr key={c.id} onClick={() => setSelectedId(c.id)} className={`cursor-pointer border-t border-line/70 ${selectedId === c.id ? "bg-gold/[0.06]" : ""}`}>
                        <td className="pl-3"><div className="font-medium">{c.number}</div><div className="text-xs text-slate-400">{datePt(c.start_date)}</div></td>
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: colorOf(c.company?.name ?? "?") }}>{initials(c.company?.name ?? "?")}</span>
                            <div className="min-w-0"><div className="max-w-[10rem] truncate">{c.company?.name ?? "—"}</div><div className="text-xs text-slate-400">NIF: {c.company?.nif ?? "—"}</div></div>
                          </div>
                        </td>
                        <td><div>{c.office?.number ?? "—"}</div><div className="text-xs text-slate-400">{c.office?.building ?? ""}</div></td>
                        <td className="whitespace-nowrap text-xs leading-snug"><div>{datePt(c.start_date)}</div><div>{datePt(c.end_date)}</div><div className="text-slate-400">({c.months} meses)</div></td>
                        <td className="whitespace-nowrap">{kz(c.monthly)}</td>
                        <td><span className={`inline-block min-w-[5rem] rounded px-2 py-1.5 text-center text-xs font-medium ${st.solid}`}>{st.label}</span></td>
                        <td className={`whitespace-nowrap text-xs leading-snug ${lateDue ? "text-red-400" : ""}`}>{c.next_due_date ? <><div>{datePt(c.next_due_date)}</div><div className={lateDue ? "" : "text-slate-400"}>{dueText(c.next_due_days)}</div></> : "—"}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="relative flex items-center gap-1.5">
                            <button onClick={() => { setSelectedId(c.id); setMobileOpen(true); }} aria-label="Ver detalhe" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Eye className="size-4" /></button>
                            <Link href={`/contratos/${c.id}`} aria-label="Editar contrato" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Pencil className="size-4" /></Link>
                            <button onClick={() => setMenuId(menuId === c.id ? null : c.id)} aria-label="Mais ações" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>
                            {menuId === c.id && (
                              <div className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
                                <Link href={`/contratos/${c.id}`} className="block px-4 py-2.5 hover:bg-white/5">Abrir contrato</Link>
                                {c.company && <Link href={`/escritorios/empresa/${c.company.id}`} className="block px-4 py-2.5 hover:bg-white/5">Ver empresa</Link>}
                                <Link href="/escritorios" className="block px-4 py-2.5 hover:bg-white/5">Ver escritórios</Link>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-300">
            <span>A mostrar {from} a {to} de {filtered.length} contratos</span>
            <div className="flex items-center gap-1.5">
              <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Anterior" className="grid size-9 place-items-center rounded-lg border border-line disabled:opacity-40 hover:border-gold/50"><I.ChevL className="size-4" /></button>
              {pagesFor(pages, cur).map((p, i) => p === "…" ? <span key={`e${i}`} className="px-1">…</span> : (
                <button key={p} onClick={() => setPage(p)} className={`grid size-9 place-items-center rounded-lg border text-sm ${p === cur ? "border-gold bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line hover:border-gold/50"}`}>{p}</button>
              ))}
              <button disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label="Seguinte" className="grid size-9 place-items-center rounded-lg border border-line disabled:opacity-40 hover:border-gold/50"><I.ChevR className="size-4" /></button>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); resetPage(); }} aria-label="Por página" className="ml-2 h-9 rounded-lg border border-line bg-panel px-2 text-sm outline-none">
                {[10, 20, 50].map((n) => <option key={n} value={n}>{n} por página</option>)}
              </select>
            </div>
          </div>
        </section>

        {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 xl:hidden" onClick={() => setMobileOpen(false)} />}
        <aside className={mobileOpen ? "fixed inset-y-0 right-0 z-50 w-full max-w-[460px] overflow-y-auto bg-[#06111a] p-3 shadow-2xl xl:static xl:z-auto xl:max-w-none xl:overflow-visible xl:bg-transparent xl:p-0 xl:shadow-none" : "hidden xl:block"}>
          {selected ? <ContractPanel c={selected} all={contracts} onClose={() => setMobileOpen(false)} /> : (
            <div className="rounded-2xl border border-line bg-panel/90 p-8 text-center text-sm text-muted">Selecione um contrato para ver os detalhes.</div>
          )}
        </aside>
      </div>
    </>
  );
}

function ContractPanel({ c, all, onClose }: { c: ContractVM; all: ContractVM[]; onClose: () => void }) {
  const [tab, setTab] = useState<"geral" | "empresa" | "escritorio" | "financeiro" | "documentos" | "historico">("geral");
  const [menu, setMenu] = useState(false);
  const st = STATE[c.display];
  const tabs = [["geral", "Visão Geral"], ["empresa", "Empresa"], ["escritorio", "Escritório"], ["financeiro", "Financeiro"], ["documentos", "Documentos"], ["historico", "Histórico"]] as const;
  const lateDue = (c.next_due_days ?? 0) < 0;
  const row = (k: string, v: React.ReactNode) => <div className="flex items-start justify-between gap-3 py-2 text-[13px]"><dt className="text-slate-300">{k}</dt><dd className="text-right">{v}</dd></div>;
  const paidPct = c.total_value ? Math.min(100, Math.round((c.paid_total / c.total_value) * 100)) : 0;
  const related = all.filter((x) => x.id !== c.id && (x.office?.id === c.office?.id || x.company?.id === c.company?.id)).slice(0, 8);
  return (
    <section className="rounded-2xl border border-line bg-panel/90 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2a4a8f] to-[#16264d] text-sky"><I.File className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-serif text-2xl">{c.number}</h2><span className={`rounded px-2.5 py-1 text-xs font-medium ${st.solid}`}>{st.label}</span></div>
          <div className="mt-0.5 truncate text-base">{c.company?.name ?? "—"}</div>
          <div className="text-xs text-slate-400">NIF: {c.company?.nif ?? "—"}</div>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md border px-3 py-1.5 text-xs ${tab === k ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line text-slate-200 hover:border-gold/40"}`}>{l}</button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "geral" && (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_170px] gap-3">
              <div className="relative h-[112px] overflow-hidden rounded-xl border border-line"><Image src="/office.jpg" alt="Escritório" fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" /></div>
              <div className="rounded-xl border border-line bg-[#041019] p-3">
                <div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-[#2a4a8f] to-[#16264d] text-sky"><I.Building className="size-5" /></span>
                  <div className="leading-tight"><div className="text-2xl font-semibold">{c.office?.number ?? "—"}</div><div className="text-xs text-slate-300">{c.office?.building ?? ""}</div></div></div>
                <div className="mt-2 text-xs text-slate-300">Área: {c.office ? `${c.office.area} m²` : "—"}</div>
              </div>
            </div>
            <Link href="/escritorios" className="btn-gold -mt-1 flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold hover:brightness-105 sm:ml-auto sm:w-[170px]">Ver Escritório <I.Arrow className="size-4" /></Link>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <dl className="divide-y divide-line/60">
                {row("Número do Contrato", c.number)}{row("Data de Início", datePt(c.start_date))}
                {row("Data de Término", <>{datePt(c.end_date)}<div className={c.days_left <= 90 ? "text-red-400" : "text-slate-400"}>({c.days_left} dias)</div></>)}
                {row("Duração", `${c.months} meses`)}{row("Estado", <span className={`rounded px-2.5 py-1 text-xs font-medium ${st.solid}`}>{st.label}</span>)}
                {row("Valor Mensal", <b>{kz(c.monthly)}</b>)}{row("Valor Total", <b>{kz(c.total_value)}</b>)}
                {row("Próximo Vencimento", c.next_due_date ? <>{datePt(c.next_due_date)}<div className={lateDue ? "text-red-400" : "text-slate-400"}>{dueText(c.next_due_days)}</div></> : "—")}
              </dl>
              <dl className="divide-y divide-line/60">
                {row("Tipo de Contrato", "Locação de Escritório")}{row("Edifício", c.office?.building ?? "—")}
                {row("Escritório", c.office?.number ?? "—")}{row("Área", c.office ? `${c.office.area} m²` : "—")}
                {row("Prestações", c.installments_count)}{row("Pago", kz(c.paid_total))}
              </dl>
            </div>
          </div>
        )}
        {tab === "empresa" && (c.company ? (
          <dl className="divide-y divide-line/60">
            {row("Nome", c.company.name)}{row("NIF", c.company.nif ?? "—")}{row("Telefone", c.company.phone ?? "—")}{row("Email", c.company.email ?? "—")}{row("Representante", c.company.rep ?? "—")}
            <div className="pt-3"><Link href={`/escritorios/empresa/${c.company.id}`} className="text-sm text-gold hover:underline">Abrir ficha da empresa →</Link></div>
          </dl>
        ) : <p className="text-sm text-slate-400">Sem empresa associada.</p>)}
        {tab === "escritorio" && (c.office ? (
          <dl className="divide-y divide-line/60">
            {row("Escritório", c.office.number)}{row("Edifício", c.office.building ?? "—")}{row("Área", `${c.office.area} m²`)}
            <div className="pt-3"><Link href="/escritorios" className="text-sm text-gold hover:underline">Abrir planta dos escritórios →</Link></div>
          </dl>
        ) : <p className="text-sm text-slate-400">Sem escritório associado.</p>)}
        {tab === "financeiro" && (
          <div className="space-y-3">
            <dl className="divide-y divide-line/60">
              {row("Valor total", kz(c.total_value))}{row("Total pago", kz(c.paid_total))}{row("Em falta", kz(c.remaining_total))}
              {row("Em atraso", c.overdue_amount > 0 ? <b className="text-red-400">{kz(c.overdue_amount)}</b> : "Sem atrasos")}
              {row("Próximo vencimento", c.next_due_date ? datePt(c.next_due_date) : "—")}
            </dl>
            <div><div className="mb-1 flex justify-between text-xs text-slate-300"><span>Progresso de pagamento</span><span>{paidPct}%</span></div><div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gold" style={{ width: `${paidPct}%` }} /></div></div>
          </div>
        )}
        {tab === "documentos" && (
          <div className="space-y-3 text-sm"><p className="text-slate-300">Os documentos do contrato (contrato assinado, comprovativos e outros anexos) são geridos na página do contrato.</p>
            <Link href={`/contratos/${c.id}`} className="btn-gold inline-block rounded-lg px-4 py-2.5 font-semibold">Abrir documentos do contrato</Link></div>
        )}
        {tab === "historico" && (related.length === 0 ? <p className="text-sm text-slate-400">Sem outros contratos deste escritório ou desta empresa.</p> : (
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-line p-3 text-sm">
                <div><div className="font-medium">{r.number}</div><div className="text-xs text-slate-400">{r.company?.name} · Esc. {r.office?.number} · {datePt(r.start_date)} → {datePt(r.end_date)}</div></div>
                <span className={`rounded px-2 py-1 text-[11px] ${STATE[r.display].solid}`}>{STATE[r.display].label}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>

      <div className="relative mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Link href={`/contratos/${c.id}`} className="btn-gold flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold hover:brightness-105"><I.Pencil className="size-4" />Editar Contrato</Link>
        <Link href={`/contratos/${c.id}`} className="flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm hover:border-gold/50"><I.File className="size-4" />Documentos</Link>
        <button onClick={() => setMenu(!menu)} className="flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm hover:border-gold/50"><I.List className="size-4" />Mais Ações</button>
        {menu && (
          <div className="absolute bottom-14 right-0 z-30 w-52 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
            <Link href={`/contratos/${c.id}`} className="block px-4 py-2.5 hover:bg-white/5">Registar pagamento</Link>
            {c.company && <Link href={`/escritorios/empresa/${c.company.id}`} className="block px-4 py-2.5 hover:bg-white/5">Ver empresa</Link>}
            <Link href="/dividas" className="block px-4 py-2.5 hover:bg-white/5">Ver dívidas</Link>
          </div>
        )}
      </div>
    </section>
  );
}
