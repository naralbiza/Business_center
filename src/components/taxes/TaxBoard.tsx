"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { TaxState, TaxVM } from "@/lib/taxBoard";
import { createTax, deleteTax, setTaxState, updateTax, type ActionResult } from "@/app/actions";
import { datePt, kz } from "@/lib/format";
import * as I from "@/components/icons";

const STATE: Record<TaxState, { label: string; solid: string; stripe: string; text: string }> = {
  pago: { label: "Pago", solid: "bg-[#16a34a] text-white", stripe: "#16a34a", text: "text-emerald-400" },
  aberto: { label: "Em Aberto", solid: "bg-[#e0a122] text-[#1a1305]", stripe: "#e0a122", text: "text-amber-300" },
  atraso: { label: "Em Atraso", solid: "bg-[#e5484d] text-white", stripe: "#e5484d", text: "text-red-400" },
  preparacao: { label: "Em Preparação", solid: "bg-[#3b82f6] text-white", stripe: "#3b82f6", text: "text-sky" },
};
const GROUPS = [
  { key: "iva", code: "IVA", desc: "Imposto sobre o Valor Acrescentado", kinds: ["iva"], color: "#3b82f6" },
  { key: "iac", code: "IAC", desc: "Imposto sobre os Rendimentos do Trabalho", kinds: ["iac"], color: "#22a35a" },
  { key: "irpc", code: "IRPC", desc: "Imposto sobre o Rendimento das Pessoas Colectivas", kinds: ["irpc"], color: "#e0a122" },
  { key: "selo", code: "Imposto de Selo", desc: "Obrigação mensal", kinds: ["imposto_selo"], color: "#ec6aa5" },
  { key: "ip", code: "Imposto IP", desc: "Obrigação anual", kinds: ["imposto_ip"], color: "#06b6d4" },
  { key: "outros", code: "Outros Impostos e Taxas", desc: "", kinds: ["predial", "taxa", "outro"], color: "#8b5cf6" },
];
const KIND_LABEL: Record<string, string> = { iva: "IVA", iac: "IAC", irpc: "IRPC", imposto_selo: "Imposto de Selo", imposto_ip: "Imposto IP", predial: "Imposto Predial Urbano", taxa: "Taxa Municipal", outro: "Outro" };
const TABS = [
  { key: "todos", label: "Todos", test: () => true },
  { key: "pagar", label: "A Pagar", test: (t: TaxVM) => t.state === "aberto" },
  { key: "pagos", label: "Pagos", test: (t: TaxVM) => t.state === "pago" },
  { key: "atraso", label: "Em Atraso", test: (t: TaxVM) => t.state === "atraso" },
  { key: "prep", label: "Em Preparação", test: (t: TaxVM) => t.state === "preparacao" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
type SortKey = "label" | "period" | "due" | "amount";
const MON3 = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pagesFor = (total: number, cur: number): (number | "…")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total, total - 1, cur - 1, cur, cur + 1]);
  const arr = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
};
function Bars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-8 items-end gap-[3px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[4px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}</div>;
}

const field = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";

export default function TaxBoard({ taxes: all, today, canEdit, needsMigration }: { taxes: TaxVM[]; today: string; canEdit: boolean; needsMigration: boolean }) {
  const cy = Number(today.slice(0, 4));
  const years = [...new Set([cy, cy - 1, ...all.map((t) => Number(t.due_date.slice(0, 4)))])].sort((a, b) => b - a);
  const [year, setYear] = useState(cy);
  const [from, setFrom] = useState(`${cy}-01-01`);
  const [to, setTo] = useState(`${cy}-12-31`);
  const [tab, setTab] = useState<TabKey>("todos");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("todos");
  const [state, setState] = useState("todos");
  const [more, setMore] = useState(false);
  const [minV, setMinV] = useState("");
  const [maxV, setMaxV] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaxVM | null>(null);
  const [showNew, setShowNew] = useState<null | "aberto" | "preparacao">(null);
  const [showPay, setShowPay] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLElement>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuId(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pickYear = (y: number) => { setYear(y); setFrom(`${y}-01-01`); setTo(`${y}-12-31`); setPage(1); };
  const run = (p: Promise<ActionResult>, ok: string, then?: () => void) =>
    start(async () => {
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });

  const sum = (l: TaxVM[], f: (t: TaxVM) => number) => l.reduce((s, t) => s + f(t), 0);
  const inRange = (t: TaxVM) => (!from || t.due_date >= from) && (!to || t.due_date <= to);
  const period = useMemo(() => all.filter(inRange), [all, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (k: TabKey) => period.filter(TABS.find((t) => t.key === k)!.test).length;

  const pagos = sum(period.filter((t) => t.state === "pago"), (t) => t.amount);
  const emDivida = sum(period.filter((t) => t.state === "aberto" || t.state === "atraso"), (t) => t.amount);
  const d30 = iso(new Date(new Date(today).getTime() + 30 * 864e5));
  const proximos = all.filter((t) => (t.state === "aberto" || t.state === "preparacao") && t.due_date >= today && t.due_date <= d30);
  const entregues = period.filter((t) => t.state === "pago").length;
  const atrasos = all.filter((t) => t.state === "atraso").length;

  const prevY = all.filter((t) => t.due_date.startsWith(String(year - 1)));
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const dPagos = pct(pagos, sum(prevY.filter((t) => t.state === "pago"), (t) => t.amount));
  const dDiv = pct(emDivida, sum(prevY.filter((t) => t.state === "aberto" || t.state === "atraso"), (t) => t.amount));
  const dEnt = pct(entregues, prevY.filter((t) => t.state === "pago").length);
  const dTot = pct(sum(period, (t) => t.amount), sum(prevY, (t) => t.amount));
  const byMonth = (l: TaxVM[], f: (t: TaxVM) => number) => { const a = Array.from({ length: 12 }, () => 0); l.forEach((t) => { a[Number(t.due_date.slice(5, 7)) - 1] += f(t); }); return a; };

  const q = norm(query.trim());
  const filtered = useMemo(() => {
    const test = TABS.find((t) => t.key === tab)!.test;
    const list = period.filter((t) =>
      test(t) &&
      (type === "todos" || GROUPS.find((g) => g.key === type)?.kinds.includes(t.kind)) &&
      (state === "todos" || t.state === state) &&
      (!minV || t.amount >= Number(minV)) && (!maxV || t.amount <= Number(maxV)) &&
      (!q || [t.label, t.reference, t.period, KIND_LABEL[t.kind]].some((v) => v && norm(String(v)).includes(q))));
    return [...list].sort((a, b) => {
      const v = (t: TaxVM): string | number => sort.key === "label" ? t.label : sort.key === "period" ? t.competence : sort.key === "due" ? t.due_date : t.amount;
      const x = v(a), y = v(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt")) * sort.dir;
    });
  }, [period, tab, type, state, minV, maxV, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const pageRows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const resetPage = () => setPage(1);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const th = (label: string, cls: string, k?: SortKey) => (
    <th className={cls}>{k ? <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-white">{label}<span className={`text-[9px] ${sort.key === k ? "text-gold" : "text-slate-500"}`}>{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}</span></button> : label}</th>
  );

  // Resumo do ano
  const total = sum(period, (t) => t.amount);
  const sAberto = sum(period.filter((t) => t.state === "aberto" || t.state === "preparacao"), (t) => t.amount);
  const sAtraso = sum(period.filter((t) => t.state === "atraso"), (t) => t.amount);
  const pPago = total ? Math.round((pagos / total) * 100) : 0;
  const R = 46, C = 2 * Math.PI * R;
  const segs = [{ v: pagos, c: "#22a35a" }, { v: sAberto, c: "#e0a122" }, { v: sAtraso, c: "#e5484d" }].filter((s) => s.v > 0);
  let acc = 0;
  const calendar = all.filter((t) => t.due_date >= iso(new Date(new Date(today).getTime() - 30 * 864e5))).sort((a, b) => (a.due_date < b.due_date ? -1 : 1)).slice(0, 4);

  const exportCsv = () => {
    const list = checked.size ? filtered.filter((t) => checked.has(t.id)) : filtered;
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const head = ["Tipo", "Referência", "Período", "Data limite", "Valor", "Estado", "Pagamento"];
    const lines = list.map((t) => [t.label, t.reference, t.period, t.due_date, Math.round(t.amount), STATE[t.state].label, t.paid_at].map(esc).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `impostos-${year}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const kpis = [
    { big: kz(pagos), t: "Impostos Pagos (Ano)", icon: I.Check, c: "from-[#16a34a] to-[#0d5c2b]", d: dPagos, good: true, sub: null, bars: byMonth(period.filter((t) => t.state === "pago"), (t) => t.amount), col: "#22a35a" },
    { big: kz(emDivida), t: "Impostos em Dívida", icon: I.Coins, c: "from-[#e5484d] to-[#7a1f23]", d: dDiv, good: false, sub: null, bars: byMonth(period.filter((t) => t.state === "aberto" || t.state === "atraso"), (t) => t.amount), col: "#e5484d" },
    { big: kz(sum(proximos, (t) => t.amount)), t: "Próximos Vencimentos", icon: I.Calendar, c: "from-[#2563eb] to-[#143a8a]", d: null, good: true, sub: `${proximos.length} ${proximos.length === 1 ? "obrigação" : "obrigações"}`, bars: byMonth(proximos, (t) => t.amount), col: "#3b82f6" },
    { big: String(entregues), t: "Declarações Entregues", icon: I.File, c: "from-[#b8862b] to-[#6a4a12]", d: dEnt, good: true, sub: null, bars: byMonth(period.filter((t) => t.state === "pago"), () => 1), col: "#e0a122" },
    { big: String(atrasos), t: "Obrigação em Atraso", icon: I.Alert, c: "from-[#4f46e5] to-[#2a2585]", d: null, good: false, sub: null, bars: byMonth(all.filter((t) => t.state === "atraso"), () => 1), col: "#e5484d" },
  ];
  const arrow = (d: number | null, good: boolean) => d === null ? null : (
    <span className="flex items-center gap-1.5 text-[11px]"><span className={(good ? d >= 0 : d <= 0) ? "text-emerald-400" : "text-red-400"}>{d >= 0 ? "↑" : "↓"} {Math.abs(d)}%</span><span className="text-slate-400">vs. ano anterior</span></span>
  );

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-tax.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl leading-none md:text-6xl">Impostos</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Gestão completa dos impostos e obrigações fiscais do Business Center Esperança.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-[#07121b]/85 px-3.5 text-sm backdrop-blur">
              <I.Calendar className="size-5 text-slate-200" />
              <select value={year} onChange={(e) => pickYear(Number(e.target.value))} aria-label="Ano fiscal" className="bg-transparent pr-1 outline-none">
                {years.map((y) => <option key={y} value={y} className="bg-[#07121b]">Ano Fiscal {y}</option>)}
              </select>
            </label>
            {canEdit && <button onClick={() => setShowNew("aberto")} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Registar Imposto</button>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold leading-tight">{k.big}</div>
                <div className="truncate text-xs text-slate-200">{k.t}</div>
                <div className="mb-1 text-[11px] text-sky">{k.sub}{arrow(k.d, k.good)}</div>
                <Bars values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {needsMigration && <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-amber-200">Para usar todos os tipos de imposto (IVA, IAC, IRPC…) e o estado “Em Preparação”, execute a migração <b>0012_tax_types.sql</b> no Supabase.</p>}

      {/* ───── Separadores ───── */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); resetPage(); }}
            className={`rounded-lg border px-5 py-2.5 text-sm transition-colors ${tab === t.key ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>
            {t.label} ({count(t.key)})
          </button>
        ))}
        <button onClick={exportCsv} className="ml-auto flex h-11 items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-4 text-sm font-medium text-gold-soft hover:bg-gold/20"><I.Download className="size-4" />Exportar{checked.size ? ` (${checked.size})` : ""}</button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <I.Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); resetPage(); }} placeholder="Pesquisar por tipo de imposto, referência ou período…"
                className="h-11 w-full rounded-lg border border-line bg-panel pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-gold" />
            </div>
            <select value={type} onChange={(e) => { setType(e.target.value); resetPage(); }} aria-label="Tipo" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
              <option value="todos">Todos os tipos</option>{GROUPS.map((g) => <option key={g.key} value={g.key}>{g.code}</option>)}
            </select>
            <select value={state} onChange={(e) => { setState(e.target.value); resetPage(); }} aria-label="Estado" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
              <option value="todos">Todos os estados</option>{Object.entries(STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={() => setMore(!more)} className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm ${more ? "border-gold bg-gold/10 text-gold-soft" : "border-line bg-panel hover:border-gold/40"}`}><I.Filter className="size-4" />Mais filtros</button>
          </div>
          {more && (
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4">
              <label className="text-xs text-slate-400">Data limite de<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetPage(); }} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100 [color-scheme:dark]" /></label>
              <label className="text-xs text-slate-400">Data limite até<input type="date" value={to} onChange={(e) => { setTo(e.target.value); resetPage(); }} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100 [color-scheme:dark]" /></label>
              <label className="text-xs text-slate-400">Valor mínimo (Kz)<input type="number" min="0" value={minV} onChange={(e) => { setMinV(e.target.value); resetPage(); }} className="mt-1 block h-10 w-36 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
              <label className="text-xs text-slate-400">Valor máximo (Kz)<input type="number" min="0" value={maxV} onChange={(e) => { setMaxV(e.target.value); resetPage(); }} className="mt-1 block h-10 w-36 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
              <button onClick={() => { setQuery(""); setType("todos"); setState("todos"); setMinV(""); setMaxV(""); setTab("todos"); pickYear(cy); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar tudo</button>
            </div>
          )}

          <section className="rounded-2xl border border-line bg-panel/90 p-3">
            {pageRows.length === 0 ? <p className="py-16 text-center text-sm text-muted">{all.length === 0 ? "Ainda não há obrigações fiscais registadas." : "Nenhuma obrigação corresponde aos filtros."}</p> : (
              <div className="overflow-x-auto" ref={menuRef}>
                <table className="min-w-[860px]">
                  <thead className="bg-white/[0.04]">
                    <tr>
                      <th className="w-10 pl-3 pt-3"><input type="checkbox" aria-label="Selecionar todos" checked={pageRows.length > 0 && pageRows.every((t) => checked.has(t.id))}
                        onChange={(e) => setChecked((s) => { const n = new Set(s); pageRows.forEach((t) => (e.target.checked ? n.add(t.id) : n.delete(t.id))); return n; })} className="accent-[#d6b06a]" /></th>
                      {th("Tipo de Imposto", "pt-3", "label")}{th("Referência", "pt-3")}{th("Período", "pt-3", "period")}{th("Data Limite", "pt-3", "due")}{th("Valor", "pt-3", "amount")}{th("Estado", "pt-3")}{th("Pagamento", "pt-3")}{th("Ações", "pt-3")}
                    </tr>
                  </thead>
                  <tbody>
                    {GROUPS.map((g) => {
                      const rows = pageRows.filter((t) => g.kinds.includes(t.kind));
                      if (rows.length === 0) return null;
                      const all_g = period.filter((t) => g.kinds.includes(t.kind));
                      const gTotal = sum(all_g, (t) => t.amount);
                      const gDebt = sum(all_g.filter((t) => t.state === "aberto" || t.state === "atraso"), (t) => t.amount);
                      return [
                        <tr key={`h-${g.key}`} className="border-t border-line/70 bg-white/[0.03]" style={{ boxShadow: `inset 4px 0 0 ${g.color}` }}>
                          <td colSpan={9} className="py-2.5 pl-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-base font-semibold">{g.code}</span>{g.desc && <span className="text-xs text-slate-300">– {g.desc}</span>}
                              <span className="ml-auto text-xs text-slate-300">Total: <b className="text-white">{kz(gTotal)}</b></span>
                              <span className={`text-xs ${gDebt > 0 ? "text-red-400" : "text-emerald-400"}`}>Em dívida: {kz(gDebt)}</span>
                            </div>
                          </td>
                        </tr>,
                        ...rows.map((t) => {
                          const st = STATE[t.state];
                          return (
                            <tr key={t.id} className="border-t border-line/70" style={{ boxShadow: `inset 4px 0 0 ${g.color}` }}>
                              <td className="pl-4"><input type="checkbox" aria-label="Selecionar" checked={checked.has(t.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} className="accent-[#d6b06a]" /></td>
                              <td className="text-[13px] font-medium">{t.label}</td>
                              <td className="whitespace-nowrap text-xs text-slate-300">{t.reference ?? "—"}</td>
                              <td className="whitespace-nowrap text-[13px]">{t.period}</td>
                              <td className={`whitespace-nowrap text-[13px] ${t.state === "atraso" ? "text-red-400" : ""}`}>{datePt(t.due_date)}</td>
                              <td className="whitespace-nowrap text-[13px] font-medium">{kz(t.amount)}</td>
                              <td><span className={`inline-block min-w-[5.2rem] rounded px-2 py-1.5 text-center text-xs font-medium ${st.solid}`}>{st.label}</span></td>
                              <td className="whitespace-nowrap text-[13px] text-slate-300">{t.paid_at ? datePt(t.paid_at) : "—"}</td>
                              <td>
                                <div className="relative flex items-center gap-1.5">
                                  <button onClick={() => setDetail(t)} aria-label="Ver detalhe" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Eye className="size-4" /></button>
                                  {canEdit && <button onClick={() => setDetail(t)} aria-label="Editar" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Pencil className="size-4" /></button>}
                                  {canEdit && <button onClick={() => setMenuId(menuId === t.id ? null : t.id)} aria-label="Mais ações" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>}
                                  {menuId === t.id && (
                                    <div className="absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
                                      {t.state !== "pago" && <button disabled={pending} onClick={() => { setMenuId(null); run(setTaxState(t.id, "pago"), "Marcado como pago."); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Marcar como pago</button>}
                                      {t.state === "aberto" || t.state === "atraso" ? <button disabled={pending} onClick={() => { setMenuId(null); run(setTaxState(t.id, "preparacao"), "Passou a Em Preparação."); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Passar a Em Preparação</button> : null}
                                      {t.state === "pago" || t.state === "preparacao" ? <button disabled={pending} onClick={() => { setMenuId(null); run(setTaxState(t.id, "aberto"), "Reaberto."); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Reabrir (Em Aberto)</button> : null}
                                      <button disabled={pending} onClick={() => { setMenuId(null); if (confirm(`Eliminar “${t.label} · ${t.period}”?`)) run(deleteTax(t.id), "Obrigação eliminada."); }} className="block w-full px-4 py-2.5 text-left text-red-400 hover:bg-white/5">Eliminar</button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-300">
              <span>A mostrar {filtered.length ? (cur - 1) * pageSize + 1 : 0} a {Math.min(cur * pageSize, filtered.length)} de {filtered.length} registos</span>
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
        </div>

        {/* ───── Coluna lateral ───── */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Receipt className="size-4" /></span>Resumo do Ano Fiscal</h2>
              <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs">{year}</span>
            </div>
            <div className="mt-3 text-sm text-slate-300">Total de Impostos</div>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-2xl font-semibold text-gold-soft">{kz(total)}</span>{dTot !== null && <span className="text-xs"><span className={dTot >= 0 ? "text-emerald-400" : "text-red-400"}>{dTot >= 0 ? "↑" : "↓"} {Math.abs(dTot)}%</span> <span className="text-slate-400">vs. {year - 1}</span></span>}</div>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative size-28 shrink-0">
                <svg viewBox="0 0 120 120" className="-rotate-90" aria-hidden>
                  <circle cx="60" cy="60" r={R} fill="none" stroke="#1b2740" strokeWidth="14" />
                  {total > 0 && segs.map((s, i) => { const len = (s.v / total) * C; const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={s.c} strokeWidth="14" strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />; acc += len; return el; })}
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-lg font-semibold">{pPago}%</div><div className="text-[10px] text-slate-400">Pago</div></div></div>
              </div>
              <ul className="flex-1 space-y-2 text-xs">
                <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#22a35a]" />Pagos</span><b>{kz(pagos)}</b></li>
                <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#e0a122]" />Em Aberto</span><b className="text-amber-300">{kz(sAberto)}</b></li>
                <li className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#e5484d]" />Em Atraso</span><b className="text-red-400">{kz(sAtraso)}</b></li>
              </ul>
            </div>
          </section>

          <section ref={calRef} className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Calendar className="size-4" /></span>Calendário Fiscal</h2>
              <button onClick={() => { setTab("todos"); pickYear(cy); setSort({ key: "due", dir: 1 }); }} className="rounded-lg border border-line px-2.5 py-1 text-[11px] hover:border-gold/50">Ver Todos</button>
            </div>
            {calendar.length === 0 ? <p className="py-4 text-center text-xs text-muted">Sem obrigações no calendário.</p> : (
              <ul className="mt-3 space-y-3">
                {calendar.map((t) => {
                  const d = new Date(t.due_date + "T00:00:00Z");
                  const st = STATE[t.state];
                  const bg = t.state === "atraso" ? "bg-[#c93a3f]" : t.state === "preparacao" ? "bg-[#2f6fe0]" : t.state === "pago" ? "bg-[#3b4a66]" : "bg-[#b8862b]";
                  return (
                    <li key={t.id} className="flex items-center gap-3">
                      <div className={`w-11 shrink-0 rounded-lg py-1 text-center leading-none text-white ${bg}`}><div className="text-base font-bold">{d.getUTCDate()}</div><div className="mt-0.5 text-[9px] font-semibold">{MON3[d.getUTCMonth()]}</div></div>
                      <div className="min-w-0 flex-1 text-[13px]"><div className="truncate">{t.label} ({t.period})</div></div>
                      <div className="text-right"><div className="whitespace-nowrap text-[13px] font-medium">{kz(t.amount)}</div><div className={`text-[11px] ${st.text}`}>{st.label === "Em Aberto" ? "Em aberto" : st.label === "Em Atraso" ? "Em atraso" : st.label === "Em Preparação" ? "Em preparação" : "Pago"}</div></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Alert className="size-4" /></span>Ações Rápidas</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <button disabled={!canEdit} onClick={() => setShowNew("preparacao")} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-xs hover:border-gold/50 disabled:opacity-50"><I.File className="size-6 text-slate-200" />Nova Declaração</button>
              <button disabled={!canEdit} onClick={() => setShowPay(true)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 text-xs text-gold-soft hover:bg-gold/20 disabled:opacity-50"><I.Coins className="size-6" />Registar Pagamento</button>
              <button onClick={exportCsv} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-xs hover:border-gold/50"><I.Chart className="size-6 text-slate-200" />Gerar Relatório</button>
              <button onClick={() => calRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-xs hover:border-gold/50"><I.Calendar className="size-6 text-slate-200" />Calendário Fiscal</button>
            </div>
          </section>
        </div>
      </div>

      {showNew && (
        <Modal title={showNew === "preparacao" ? "Nova declaração" : "Registar imposto"} subtitle="Obrigação fiscal a acompanhar no calendário." onClose={() => setShowNew(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(createTax(new FormData(e.currentTarget)), "Imposto registado.", () => setShowNew(null)); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={lab}>Tipo *</label><select name="kind" required className={field}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className={lab}>Descrição *</label><input name="label" required placeholder="ex.: IVA Mensal" className={field} /></div>
              <div><label className={lab}>Referência</label><input name="reference" placeholder="ex.: IVA-2026-10" className={field} /></div>
              <div><label className={lab}>Período</label><input name="period_label" placeholder="ex.: Out/2026, 3º Trimestre, Anual" className={field} /></div>
              <div><label className={lab}>Mês de competência</label><input name="competence" type="month" className={`${field} [color-scheme:dark]`} /></div>
              <div><label className={lab}>Data limite *</label><input name="due_date" type="date" required className={`${field} [color-scheme:dark]`} /></div>
              <div><label className={lab}>Valor (Kz) *</label><input name="amount" type="number" min="0" step="0.01" required className={field} /></div>
              <div><label className={lab}>Estado inicial</label><select name="status" defaultValue={showNew} className={field}><option value="aberto">Em Aberto</option><option value="preparacao">Em Preparação</option><option value="pago">Pago</option></select></div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowNew(null)} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
              <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar"}</button>
            </div>
          </form>
        </Modal>
      )}

      {showPay && (
        <Modal title="Registar pagamento" subtitle="Marque uma obrigação como paga." onClose={() => setShowPay(false)}>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(setTaxState(String(fd.get("id")), "pago", String(fd.get("paid_at"))), "Pagamento registado.", () => setShowPay(false)); }} className="space-y-5">
            {all.filter((t) => t.state !== "pago").length === 0 ? <p className="text-sm text-slate-300">Não há obrigações por pagar.</p> : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className={lab}>Obrigação *</label>
                  <select name="id" required className={field}>{all.filter((t) => t.state !== "pago").sort((a, b) => (a.due_date < b.due_date ? -1 : 1)).map((t) => <option key={t.id} value={t.id}>{t.label} · {t.period} · {datePt(t.due_date)} · {kz(t.amount)}</option>)}</select></div>
                <div><label className={lab}>Data do pagamento</label><input name="paid_at" type="date" defaultValue={today} max={today} className={`${field} [color-scheme:dark]`} /></div>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowPay(false)} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
              <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">Registar</button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={`${detail.label} · ${detail.period}`} subtitle={STATE[detail.state].label + (detail.paid_at ? ` em ${datePt(detail.paid_at)}` : "")} onClose={() => setDetail(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(updateTax(new FormData(e.currentTarget)), "Obrigação atualizada.", () => setDetail(null)); }} className="space-y-5">
            <input type="hidden" name="id" value={detail.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={lab}>Referência</label><input name="reference" defaultValue={detail.reference ?? ""} disabled={!canEdit} className={field} /></div>
              <div><label className={lab}>Período</label><input name="period_label" defaultValue={detail.period} disabled={!canEdit} className={field} /></div>
              <div><label className={lab}>Data limite</label><input name="due_date" type="date" defaultValue={detail.due_date} disabled={!canEdit} className={`${field} [color-scheme:dark]`} /></div>
              <div><label className={lab}>Valor (Kz)</label><input name="amount" type="number" min="0" step="0.01" defaultValue={detail.amount} disabled={!canEdit} className={field} /></div>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  {detail.state !== "pago" && <button type="button" disabled={pending} onClick={() => run(setTaxState(detail.id, "pago"), "Marcado como pago.", () => setDetail(null))} className="rounded-lg border border-ok/50 px-3 py-2 text-emerald-300 hover:bg-ok/10">Marcar como pago</button>}
                  {detail.state !== "preparacao" && detail.state !== "pago" && <button type="button" disabled={pending} onClick={() => run(setTaxState(detail.id, "preparacao"), "Passou a Em Preparação.", () => setDetail(null))} className="rounded-lg border border-line px-3 py-2 hover:bg-white/5">Em Preparação</button>}
                  {(detail.state === "pago" || detail.state === "preparacao") && <button type="button" disabled={pending} onClick={() => run(setTaxState(detail.id, "aberto"), "Reaberto.", () => setDetail(null))} className="rounded-lg border border-line px-3 py-2 hover:bg-white/5">Reabrir</button>}
                </div>
                <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">Guardar alterações</button>
              </div>
            )}
          </form>
        </Modal>
      )}

      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h2 className="font-serif text-3xl">{title}</h2>{subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
