"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { InvoiceState, InvoiceVM } from "@/lib/invoicesBoard";
import { registerPaymentBoard, type ActionResult } from "@/app/actions";
import { datePt, kz } from "@/lib/format";
import * as I from "@/components/icons";

const STATE: Record<InvoiceState, { label: string; solid: string; stripe: string }> = {
  paga: { label: "Paga", solid: "bg-[#16a34a] text-white", stripe: "#16a34a" },
  em_aberto: { label: "Em Aberto", solid: "bg-[#e0a122] text-[#1a1305]", stripe: "#e0a122" },
  vencida: { label: "Vencida", solid: "bg-[#e5484d] text-white", stripe: "#e5484d" },
  cancelada: { label: "Cancelada", solid: "bg-[#4b5563] text-white", stripe: "#6b7280" },
};
const METHOD: Record<string, string> = { transferencia: "Transferência", numerario: "Numerário", multicaixa: "Multicaixa", cheque: "Cheque", outro: "Outro" };
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const TABS = [
  { key: "todas", label: "Todas", test: () => true },
  { key: "pagas", label: "Pagas", test: (r: InvoiceVM) => r.state === "paga" },
  { key: "aberto", label: "Em Aberto", test: (r: InvoiceVM) => r.state === "em_aberto" },
  { key: "vencidas", label: "Vencidas", test: (r: InvoiceVM) => r.state === "vencida" },
  { key: "canceladas", label: "Canceladas", test: (r: InvoiceVM) => r.state === "cancelada" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
type SortKey = "number" | "issue" | "company" | "amount" | "due" | "balance";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const initials = (n: string) => n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthRange = (y: number, m: number) => ({ from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) });

function pagesFor(total: number, cur: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total, total - 1, cur - 1, cur, cur + 1]);
  const arr = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
}
function Bars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-8 items-end gap-[2px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}</div>;
}

export default function InvoicesBoard({ invoices: all, buildings, companies, today, canEdit }: { invoices: InvoiceVM[]; buildings: { id: string; name: string }[]; companies: { id: string; name: string }[]; today: string; canEdit: boolean }) {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)) - 1;
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(ty, tm - i, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), key: `${d.getUTCFullYear()}-${d.getUTCMonth()}` }; });
  const [monthKey, setMonthKey] = useState(months[0].key);
  const init = monthRange(ty, tm);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [tab, setTab] = useState<TabKey>("todas");
  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState("todos");
  const [company, setCompany] = useState("todas");
  const [state, setState] = useState("todos");
  const [more, setMore] = useState(false);
  const [minV, setMinV] = useState("");
  const [maxV, setMaxV] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "number", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<InvoiceVM | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuId(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pickMonth = (key: string) => {
    setMonthKey(key); setPage(1);
    if (key === "todos") { setFrom(""); setTo(""); return; }
    const [y, m] = key.split("-").map(Number);
    const r = monthRange(y, m); setFrom(r.from); setTo(r.to);
  };
  const monthName = monthKey === "todos" || monthKey === "custom" ? "período" : MONTHS[Number(monthKey.split("-")[1])];
  const inRange = (d: string, f = from, t = to) => (!f || d >= f) && (!t || d <= t);
  const sum = (list: InvoiceVM[], f: (r: InvoiceVM) => number) => list.reduce((s, r) => s + f(r), 0);

  const period = useMemo(() => all.filter((r) => inRange(r.due_date)), [all, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (k: TabKey) => period.filter(TABS.find((t) => t.key === k)!.test).length;
  const live = period.filter((r) => r.state !== "cancelada");

  const faturada = sum(live, (r) => r.amount);
  const emDivida = sum(all.filter((r) => (r.state === "em_aberto" || r.state === "vencida") && (!to || r.due_date <= to)), (r) => r.balance);
  const pagas = period.filter((r) => r.state === "paga").length;
  const vencidas = all.filter((r) => r.state === "vencida").length;

  const prev = (() => {
    if (monthKey === "todos" || monthKey === "custom") return null;
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return monthRange(d.getUTCFullYear(), d.getUTCMonth());
  })();
  const prevList = prev ? all.filter((r) => inRange(r.due_date, prev.from, prev.to)) : [];
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const deltas = prev ? {
    fat: pct(faturada, sum(prevList.filter((r) => r.state !== "cancelada"), (r) => r.amount)),
    div: pct(emDivida, sum(prevList.filter((r) => r.state === "em_aberto" || r.state === "vencida"), (r) => r.balance)),
    pag: pct(pagas, prevList.filter((r) => r.state === "paga").length),
    tot: pct(period.length, prevList.length),
  } : { fat: null, div: null, pag: null, tot: null };

  const series = (list: InvoiceVM[], f: (r: InvoiceVM) => number) => {
    const n = 30;
    const start = from ? new Date(from).getTime() : new Date(today).getTime() - 29 * 864e5;
    const out = Array.from({ length: n }, () => 0);
    list.forEach((r) => { const i = Math.floor((new Date(r.due_date).getTime() - start) / 864e5 / (monthKey === "todos" ? 12 : 1)); if (i >= 0 && i < n) out[i] += f(r); });
    return out;
  };

  const q = norm(query.trim());
  const filtered = useMemo(() => {
    const test = TABS.find((t) => t.key === tab)!.test;
    const list = period.filter((r) =>
      test(r) &&
      (building === "todos" || r.office?.building_id === building) &&
      (company === "todas" || r.company?.id === company) &&
      (state === "todos" || r.state === state) &&
      (!minV || r.amount >= Number(minV)) && (!maxV || r.amount <= Number(maxV)) &&
      (!q || [r.number, r.company?.name, r.company?.nif, r.contractNumber, r.office?.number].some((v) => v && norm(String(v)).includes(q))));
    return [...list].sort((a, b) => {
      const k = sort.key;
      const val = (r: InvoiceVM): string | number => k === "number" ? r.number : k === "issue" ? r.issue_date : k === "company" ? r.company?.name ?? "" : k === "amount" ? r.amount : k === "due" ? r.due_date : r.balance;
      const x = val(a), y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt", { numeric: true })) * sort.dir;
    });
  }, [period, tab, building, company, state, minV, maxV, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const resetPage = () => setPage(1);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const th = (label: string, cls: string, k?: SortKey) => (
    <th className={cls}>{k ? <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-white">{label}<span className={`text-[9px] ${sort.key === k ? "text-gold" : "text-slate-500"}`}>{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}</span></button> : label}</th>
  );
  const selected = all.find((r) => r.id === selectedId) ?? null;

  const exportCsv = () => {
    const list = checked.size ? filtered.filter((r) => checked.has(r.id)) : filtered;
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const head = ["Fatura", "Emissão", "Empresa", "NIF", "Contrato", "Escritório", "Valor", "Estado", "Vencimento", "Saldo"];
    const lines = list.map((r) => [r.number, r.issue_date, r.company?.name, r.company?.nif, r.contractNumber, r.office?.number, Math.round(r.amount), STATE[r.state].label, r.due_date, Math.round(r.balance)].map(esc).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `faturas-${today}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const printInvoice = (r: InvoiceVM) => {
    const w = window.open("", "_blank", "width=760,height=860");
    if (!w) return setToast({ tone: "erro", text: "Permita janelas pop-up para gerar o PDF." });
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(r.number)}</title>
      <style>body{font-family:Georgia,serif;margin:48px;color:#111}h1{margin:0;font-size:30px}small{color:#555}table{width:100%;border-collapse:collapse;margin-top:28px}td,th{padding:10px 0;border-bottom:1px solid #ddd;font-size:15px;text-align:left}td:first-child{color:#555;width:38%}.t{margin-top:26px;font-size:24px}.s{display:inline-block;margin-top:8px;padding:3px 10px;border:1px solid #111;font-size:12px}</style></head><body>
      <small>BUSINESS CENTER ESPERANÇA · Centro Empresarial · Moçâmedes, Namibe</small><h1>Fatura ${esc(r.number)}</h1><span class="s">${esc(STATE[r.state].label.toUpperCase())}</span>
      <table><tr><td>Cliente</td><td>${esc(r.company?.name ?? "—")}</td></tr><tr><td>NIF</td><td>${esc(r.company?.nif ?? "—")}</td></tr>
      <tr><td>Contrato</td><td>${esc(r.contractNumber)} (prestação ${r.seq}/${r.count})</td></tr><tr><td>Escritório</td><td>${esc(r.office ? `${r.office.number} ${r.office.building ?? ""}` : "—")}</td></tr>
      <tr><td>Descrição</td><td>Renda de escritório · ${esc(datePt(r.issue_date))} a ${esc(datePt(r.period_to))}</td></tr>
      <tr><td>Emissão</td><td>${esc(datePt(r.issue_date))}</td></tr><tr><td>Vencimento</td><td>${esc(datePt(r.due_date))}</td></tr></table>
      <div class="t">Valor da fatura: <b>${esc(kz(r.amount))}</b></div><div class="t">Valor pago: ${esc(kz(r.paid))} · Saldo: <b>${esc(kz(r.balance))}</b></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  const run = (p: Promise<ActionResult>, ok: string, then?: () => void) =>
    start(async () => {
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });

  const arrow = (d: number | null, upGood: boolean) => d === null ? null : (
    <span className="flex items-center gap-1.5 text-[11px]"><span className={(upGood ? d >= 0 : d <= 0) ? "text-emerald-400" : "text-red-400"}>{d >= 0 ? "↑" : "↓"} {Math.abs(d)}%</span><span className="text-slate-400">vs. mês anterior</span></span>
  );
  const kpis = [
    { big: kz(faturada), t: `Receita Faturada (${monthName})`, icon: I.File, c: "from-[#16a34a] to-[#0d5c2b]", d: deltas.fat, good: true, bars: series(live, (r) => r.amount), col: "#22a35a" },
    { big: kz(emDivida), t: "Valor em Dívida", icon: I.Coins, c: "from-[#e5484d] to-[#7a1f23]", d: deltas.div, good: false, bars: series(all.filter((r) => r.state === "em_aberto" || r.state === "vencida"), (r) => r.balance), col: "#e5484d" },
    { big: String(pagas), t: "Faturas Pagas", icon: I.Check, c: "from-[#16a34a] to-[#0d5c2b]", d: deltas.pag, good: true, bars: series(period.filter((r) => r.state === "paga"), () => 1), col: "#22a35a" },
    { big: String(vencidas), t: "Faturas Vencidas", icon: I.Clock, c: "from-[#e5484d] to-[#7a1f23]", d: null, good: false, bars: series(all.filter((r) => r.state === "vencida"), () => 1), col: "#e5484d" },
    { big: String(period.length), t: "Total de Faturas", icon: I.Receipt, c: "from-[#2563eb] to-[#143a8a]", d: deltas.tot, good: true, bars: series(period, () => 1), col: "#3b82f6" },
  ];

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-inv.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"><I.ChevL className="size-3.5" />Faturas e Dívidas</Link>
            <h1 className="mt-1 text-5xl leading-none md:text-6xl">Faturas e Dívidas</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Gestão completa das faturas e controlo de dívidas do Business Center Esperança.</p>
          </div>
          {canEdit && <button onClick={() => { const first = all.find((r) => r.state === "vencida" || r.state === "em_aberto"); if (first) setPayFor(first); else setToast({ tone: "erro", text: "Não há faturas em aberto." }); }}
            className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Registar Pagamento</button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold leading-tight">{k.big}</div>
                <div className="truncate text-xs text-slate-200">{k.t}</div>
                <div className="mb-1">{arrow(k.d, k.good)}</div>
                <Bars values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Separadores, período e exportação ───── */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); resetPage(); }}
            className={`rounded-lg border px-5 py-2.5 text-sm transition-colors ${tab === t.key ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>
            {t.label} ({count(t.key)})
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-panel/80 px-3 text-sm">
            <I.Calendar className="size-4 text-slate-300" />
            <select value={monthKey === "custom" ? "todos" : monthKey} onChange={(e) => pickMonth(e.target.value)} aria-label="Período" className="bg-transparent pr-1 outline-none">
              {months.map((m) => <option key={m.key} value={m.key} className="bg-[#07121b]">{MONTHS[m.m]} {m.y}</option>)}
              <option value="todos" className="bg-[#07121b]">Todos os períodos</option>
            </select>
          </label>
          <button onClick={exportCsv} className="flex h-11 items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-4 text-sm font-medium text-gold-soft hover:bg-gold/20"><I.Download className="size-4" />Exportar{checked.size ? ` (${checked.size})` : ""}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <I.Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); resetPage(); }} placeholder="Pesquisar por empresa, NIF, nº da fatura…"
            className="h-11 w-full rounded-lg border border-line bg-panel pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-gold" />
        </div>
        <select value={building} onChange={(e) => { setBuilding(e.target.value); resetPage(); }} aria-label="Edifício" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
          <option value="todos">Todos os edifícios</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={state} onChange={(e) => { setState(e.target.value); resetPage(); }} aria-label="Estado" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
          <option value="todos">Todos os estados</option>{Object.entries(STATE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={company} onChange={(e) => { setCompany(e.target.value); resetPage(); }} aria-label="Empresa" className="h-11 max-w-[14rem] rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
          <option value="todas">Todas as empresas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setMore(!more)} className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm ${more ? "border-gold bg-gold/10 text-gold-soft" : "border-line bg-panel hover:border-gold/40"}`}><I.Filter className="size-4" />Mais filtros</button>
      </div>
      {more && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4">
          <label className="text-xs text-slate-400">Vencimento de<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setMonthKey("custom"); resetPage(); }} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100 [color-scheme:dark]" /></label>
          <label className="text-xs text-slate-400">Vencimento até<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setMonthKey("custom"); resetPage(); }} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100 [color-scheme:dark]" /></label>
          <label className="text-xs text-slate-400">Valor mínimo (Kz)<input type="number" min="0" value={minV} onChange={(e) => { setMinV(e.target.value); resetPage(); }} className="mt-1 block h-10 w-36 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
          <label className="text-xs text-slate-400">Valor máximo (Kz)<input type="number" min="0" value={maxV} onChange={(e) => { setMaxV(e.target.value); resetPage(); }} className="mt-1 block h-10 w-36 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
          <button onClick={() => { setQuery(""); setBuilding("todos"); setState("todos"); setCompany("todas"); setMinV(""); setMaxV(""); setTab("todas"); pickMonth(months[0].key); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar tudo</button>
        </div>
      )}

      {/* ───── Tabela + painel ───── */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0 rounded-2xl border border-line bg-panel/90 p-3">
          {rows.length === 0 ? <p className="py-16 text-center text-sm text-muted">{all.length === 0 ? "Ainda não há faturas." : "Nenhuma fatura corresponde aos filtros."}</p> : (
            <div className="overflow-x-auto" ref={menuRef}>
              <table className="min-w-[940px]">
                <thead className="bg-white/[0.04]">
                  <tr>
                    <th className="w-10 pl-3 pt-3"><input type="checkbox" aria-label="Selecionar todas" checked={rows.length > 0 && rows.every((r) => checked.has(r.id))}
                      onChange={(e) => setChecked((s) => { const n = new Set(s); rows.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} className="accent-[#d6b06a]" /></th>
                    {th("Fatura Nº", "pt-3", "number")}{th("Data Emissão", "pt-3", "issue")}{th("Empresa", "pt-3", "company")}{th("Contrato", "pt-3")}{th("Escritório", "pt-3")}
                    {th("Valor", "pt-3", "amount")}{th("Estado", "pt-3")}{th("Vencimento", "pt-3", "due")}{th("Saldo", "pt-3", "balance")}{th("Ações", "pt-3")}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = STATE[r.state];
                    const late = r.state === "vencida";
                    return (
                      <tr key={r.id} onClick={() => setSelectedId(r.id)} className={`cursor-pointer border-t border-line/70 ${selectedId === r.id ? "bg-gold/[0.06]" : ""}`} style={selectedId === r.id ? { boxShadow: "inset 3px 0 0 #d6b06a" } : undefined}>
                        <td className="pl-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Selecionar" checked={checked.has(r.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} className="accent-[#d6b06a]" /></td>
                        <td className="whitespace-nowrap text-[13px] font-medium">{r.number}</td>
                        <td className="whitespace-nowrap text-[13px] text-slate-300">{datePt(r.issue_date)}</td>
                        <td><div className="flex items-center gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: colorOf(r.company?.name ?? "?") }}>{initials(r.company?.name ?? "?")}</span><span className="max-w-[9rem] truncate text-[13px]">{r.company?.name ?? "—"}</span></div></td>
                        <td className="whitespace-nowrap text-xs text-slate-300">{r.contractNumber}</td>
                        <td className="text-[13px]">{r.office?.number ?? "—"}</td>
                        <td className="whitespace-nowrap text-[13px] font-medium">{kz(r.amount)}</td>
                        <td><span className={`inline-block min-w-[5rem] rounded px-2 py-1.5 text-center text-xs font-medium ${st.solid}`}>{st.label}</span></td>
                        <td className={`whitespace-nowrap text-[13px] ${late ? "text-red-400" : "text-slate-200"}`}>{datePt(r.due_date)}</td>
                        <td className={`whitespace-nowrap text-[13px] ${late ? "font-medium text-red-400" : ""}`}>{kz(r.balance)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="relative flex items-center gap-1.5">
                            <button onClick={() => { setSelectedId(r.id); setMobileOpen(true); }} aria-label="Ver fatura" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Eye className="size-4" /></button>
                            <button onClick={() => printInvoice(r)} aria-label="Gerar PDF" title="Gerar PDF" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Download className="size-4" /></button>
                            <button onClick={() => setMenuId(menuId === r.id ? null : r.id)} aria-label="Mais ações" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>
                            {menuId === r.id && (
                              <div className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
                                {r.contractId && <Link href={`/contratos/${r.contractId}`} className="block px-4 py-2.5 hover:bg-white/5">Abrir contrato</Link>}
                                {r.company?.id && <Link href={`/escritorios/empresa/${r.company.id}`} className="block px-4 py-2.5 hover:bg-white/5">Ver empresa</Link>}
                                {canEdit && r.balance > 0 && <button onClick={() => { setMenuId(null); setPayFor(r); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Registar pagamento</button>}
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
            <span>A mostrar {filtered.length ? (cur - 1) * pageSize + 1 : 0} a {Math.min(cur * pageSize, filtered.length)} de {filtered.length} faturas</span>
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
        <aside className={mobileOpen ? "fixed inset-y-0 right-0 z-50 w-full max-w-[440px] overflow-y-auto bg-[#06111a] p-3 shadow-2xl xl:static xl:z-auto xl:max-w-none xl:overflow-visible xl:bg-transparent xl:p-0 xl:shadow-none" : "hidden xl:block"}>
          {selected ? <InvoicePanel r={selected} canEdit={canEdit} onClose={() => { setSelectedId(null); setMobileOpen(false); }} onPrint={() => printInvoice(selected)} onPay={() => setPayFor(selected)} />
            : <div className="rounded-2xl border border-line bg-panel/90 p-8 text-center text-sm text-muted">Selecione uma fatura para ver os detalhes.</div>}
        </aside>
      </div>

      {payFor && (
        <div role="dialog" aria-modal="true" aria-label="Registar pagamento" className="fixed inset-0 z-[55] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={() => setPayFor(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(registerPaymentBoard(fd), "Pagamento registado.", () => setPayFor(null)); }}
            className="w-full max-w-xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><h2 className="font-serif text-3xl">Registar pagamento</h2><p className="text-sm text-slate-400">{payFor.company?.name} · {payFor.number} · saldo {kz(payFor.balance)}</p></div>
              <button type="button" onClick={() => setPayFor(null)} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
            </div>
            <input type="hidden" name="installment_id" value={payFor.installmentId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Valor (Kz) *</label><input name="amount" type="number" step="0.01" min="0.01" max={payFor.balance} defaultValue={payFor.balance} required className="w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold" /></div>
              <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Data</label><input name="paid_at" type="date" defaultValue={today} max={today} className="w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold [color-scheme:dark]" /></div>
              <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Método</label><select name="method" defaultValue="transferencia" className="w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold"><option value="transferencia">Transferência</option><option value="numerario">Numerário</option><option value="multicaixa">Multicaixa</option><option value="cheque">Cheque</option><option value="outro">Outro</option></select></div>
              <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Referência</label><input name="reference" className="w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold" /></div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPayFor(null)} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
              <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Registar"}</button>
            </div>
          </form>
        </div>
      )}
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}

function InvoicePanel({ r, canEdit, onClose, onPrint, onPay }: { r: InvoiceVM; canEdit: boolean; onClose: () => void; onPrint: () => void; onPay: () => void }) {
  const [tab, setTab] = useState<"geral" | "pagamentos" | "empresa" | "contrato" | "documentos">("geral");
  const [menu, setMenu] = useState(false);
  const st = STATE[r.state];
  const late = r.state === "vencida";
  const tabs = [["geral", "Visão Geral"], ["pagamentos", "Pagamentos"], ["empresa", "Empresa"], ["contrato", "Contrato"], ["documentos", "Documentos"]] as const;
  const row = (k: string, v: React.ReactNode) => <div className="flex items-start justify-between gap-4 py-1.5 text-[13px]"><dt className="text-slate-300">{k}</dt><dd className="text-right">{v}</dd></div>;
  const mail = r.company?.email ? `mailto:${r.company.email}?subject=${encodeURIComponent(`Fatura ${r.number} — Business Center Esperança`)}&body=${encodeURIComponent(`Exmos. Senhores,\n\nSegue a informação da fatura ${r.number}, no valor de ${kz(r.amount)}, com vencimento em ${datePt(r.due_date)}.\nSaldo em dívida: ${kz(r.balance)}.\n\nCom os melhores cumprimentos,\nBusiness Center Esperança`)}` : null;
  return (
    <section className="rounded-2xl border border-line bg-panel/90 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#143a8a] text-white"><I.File className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-serif text-2xl">{r.number}</h2><span className={`rounded px-2.5 py-1 text-xs font-medium ${st.solid}`}>{st.label}</span></div>
          <div className="mt-0.5 truncate">{r.company?.name ?? "—"}</div>
          <div className="text-xs text-slate-400">NIF: {r.company?.nif ?? "—"}</div>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-md border px-3 py-1.5 text-xs ${tab === k ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line text-slate-200 hover:border-gold/40"}`}>{l}</button>)}
      </div>

      <div className="mt-4">
        {tab === "geral" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
              <div className="bg-[#041019] p-3"><div className="text-xl font-semibold text-gold-soft">{kz(r.amount)}</div><div className="text-xs text-slate-300">Valor da Fatura</div></div>
              <div className="bg-[#041019] p-3"><div className={`text-xl font-semibold ${r.balance > 0 ? "text-red-400" : "text-emerald-400"}`}>{kz(r.balance)}</div><div className="text-xs text-slate-300">Saldo em Dívida</div></div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <dl>
                {row("Emissão", datePt(r.issue_date))}
                {row("Vencimento", <span className={late ? "text-red-400" : ""}>{datePt(r.due_date)}{late && <> ({r.days_overdue} dias em atraso)</>}</span>)}
                {row("Tipo", "Renda de Escritório")}{row("Contrato", r.contractNumber)}
                {row("Escritório", r.office ? `${r.office.number}${r.office.building ? ` (${r.office.building})` : ""}` : "—")}
                {row("Período", `${datePt(r.issue_date)} – ${datePt(r.period_to)}`)}
                {row("Estado", <span className={late ? "text-red-400" : r.state === "paga" ? "text-emerald-400" : "text-amber-300"}>{st.label}</span>)}
              </dl>
              <div className="w-[104px]">
                <button onClick={onPrint} aria-label="Pré-visualizar fatura" className="grid h-[124px] w-full place-items-center rounded-lg border border-line bg-white/95 p-2 text-left text-[7px] leading-tight text-slate-700">
                  <span><b className="block text-[8px]">FATURA</b>{r.number}<br />{r.company?.name}<br />{kz(r.amount)}<br />Venc.: {datePt(r.due_date)}</span>
                </button>
                <button onClick={onPrint} className="btn-gold mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold hover:brightness-105">Ver Fatura <I.Arrow className="size-3.5" /></button>
              </div>
            </div>
          </div>
        )}
        {tab === "pagamentos" && (r.payments.length === 0 ? <p className="text-sm text-slate-400">Nenhum pagamento registado para esta fatura.</p> : (
          <ul className="space-y-2">{r.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-line p-3 text-sm">
              <div><div className="font-medium">{kz(p.amount)}</div><div className="text-xs text-slate-400">{datePt(p.paid_at)} · {METHOD[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</div></div>
              <span className="rounded bg-[#16a34a] px-2 py-1 text-[11px] text-white">Recebido</span>
            </li>))}</ul>
        ))}
        {tab === "empresa" && (r.company ? (
          <dl className="divide-y divide-line/60">{row("Nome", r.company.name)}{row("NIF", r.company.nif ?? "—")}{row("Email", r.company.email ?? "—")}
            <div className="pt-3"><Link href={`/escritorios/empresa/${r.company.id}`} className="text-sm text-gold hover:underline">Abrir ficha da empresa →</Link></div></dl>
        ) : <p className="text-sm text-slate-400">Sem empresa associada.</p>)}
        {tab === "contrato" && (
          <dl className="divide-y divide-line/60">{row("Contrato", r.contractNumber)}{row("Prestação", `${r.seq} de ${r.count || "?"}`)}{row("Escritório", r.office?.number ?? "—")}
            {r.contractId && <div className="pt-3"><Link href={`/contratos/${r.contractId}`} className="text-sm text-gold hover:underline">Abrir contrato →</Link></div>}</dl>
        )}
        {tab === "documentos" && (
          <div className="space-y-3 text-sm"><p className="text-slate-300">Os documentos anexados ficam no contrato. A fatura pode ser gerada em PDF a qualquer momento.</p>
            <button onClick={onPrint} className="btn-gold rounded-lg px-4 py-2.5 font-semibold">Gerar PDF da fatura</button></div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-line bg-[#041019] p-3">
        <div className="flex items-center gap-2 text-sm font-medium"><I.Wallet className="size-4 text-gold" />Histórico de Pagamentos</div>
        {r.payments.length === 0 ? <p className="mt-3 text-center text-xs text-slate-400">Nenhum pagamento registado para esta fatura.</p> : (
          <ul className="mt-2 space-y-1.5 text-xs">{r.payments.slice(0, 3).map((p) => <li key={p.id} className="flex justify-between"><span className="text-slate-300">{datePt(p.paid_at)} · {METHOD[p.method] ?? p.method}</span><b>{kz(p.amount)}</b></li>)}</ul>
        )}
        {canEdit && r.balance > 0 && <div className="mt-3 flex justify-center"><button onClick={onPay} className="btn-gold flex h-10 items-center gap-2 rounded-lg px-5 text-xs font-semibold hover:brightness-105"><I.Plus className="size-4" />Registar Pagamento</button></div>}
      </div>

      <div className="relative mt-4 rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><I.Bell className="size-4 text-gold" />Ações</div>
        <div className="flex flex-wrap gap-2">
          {mail ? <a href={mail} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.File className="size-4" />Enviar por Email</a>
            : <span className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-line px-3 text-xs text-slate-500" title="A empresa não tem email registado">Enviar por Email</span>}
          <button onClick={onPrint} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Download className="size-4" />Gerar PDF</button>
          <button onClick={() => setMenu(!menu)} aria-label="Mais ações" className="grid size-10 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>
        </div>
        {menu && (
          <div className="absolute bottom-14 right-3 z-30 w-48 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
            {r.contractId && <Link href={`/contratos/${r.contractId}`} className="block px-4 py-2.5 hover:bg-white/5">Abrir contrato</Link>}
            {r.company?.id && <Link href={`/escritorios/empresa/${r.company.id}`} className="block px-4 py-2.5 hover:bg-white/5">Ver empresa</Link>}
            <Link href="/pagamentos" className="block px-4 py-2.5 hover:bg-white/5">Ver pagamentos</Link>
          </div>
        )}
      </div>
    </section>
  );
}
