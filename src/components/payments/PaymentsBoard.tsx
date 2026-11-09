"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PayState, PaymentRowVM } from "@/lib/paymentsBoard";
import { registerPaymentBoard, type ActionResult } from "@/app/actions";
import { datePt, kz } from "@/lib/format";
import * as I from "@/components/icons";

const STATE: Record<PayState, { label: string; solid: string; stripe: string }> = {
  recebido: { label: "Recebido", solid: "bg-[#16a34a] text-white", stripe: "#16a34a" },
  pendente: { label: "Pendente", solid: "bg-[#e0a122] text-[#1a1305]", stripe: "#e0a122" },
  em_atraso: { label: "Em Atraso", solid: "bg-[#e5484d] text-white", stripe: "#e5484d" },
  cancelado: { label: "Cancelado", solid: "bg-[#4b5563] text-white", stripe: "#6b7280" },
};
const METHOD: Record<string, string> = { transferencia: "Transferência", numerario: "Numerário", multicaixa: "Multicaixa", cheque: "Cheque", outro: "Outro" };
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MON3 = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const TABS = [
  { key: "todos", label: "Todos", test: () => true },
  { key: "recebidos", label: "Recebidos", test: (r: PaymentRowVM) => r.state === "recebido" },
  { key: "pendentes", label: "Pendentes", test: (r: PaymentRowVM) => r.state === "pendente" },
  { key: "atraso", label: "Em Atraso", test: (r: PaymentRowVM) => r.state === "em_atraso" },
  { key: "cancelados", label: "Cancelados", test: (r: PaymentRowVM) => r.state === "cancelado" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
type SortKey = "date" | "amount" | "office" | "method";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const initials = (n: string) => n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthRange = (y: number, m: number) => ({ from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) });
const daysBetween = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 864e5);

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
  return (
    <div className="flex h-9 items-end gap-[2px]" aria-hidden>
      {values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}
    </div>
  );
}

export default function PaymentsBoard({ rows: all, buildings, today, canEdit }: { rows: PaymentRowVM[]; buildings: { id: string; name: string }[]; today: string; canEdit: boolean }) {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)) - 1;
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(ty, tm - i, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), key: `${d.getUTCFullYear()}-${d.getUTCMonth()}` }; });
  const [monthKey, setMonthKey] = useState(months[0].key);
  const init = monthRange(ty, tm);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [tab, setTab] = useState<TabKey>("todos");
  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState("todos");
  const [method, setMethod] = useState("todos");
  const [more, setMore] = useState(false);
  const [minV, setMinV] = useState("");
  const [maxV, setMaxV] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
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
  const monthLabel = monthKey === "todos" ? "Todos os períodos" : (() => { const [y, m] = monthKey.split("-").map(Number); return `${MONTHS[m]} ${y}`; })();
  const monthName = monthKey === "todos" ? "período" : MONTHS[Number(monthKey.split("-")[1])];
  const inRange = (d: string, f = from, t = to) => (!f || d >= f) && (!t || d <= t);

  // Linhas do período (para separadores e indicadores)
  const period = useMemo(() => all.filter((r) => inRange(r.date)), [all, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (k: TabKey) => period.filter(TABS.find((t) => t.key === k)!.test).length;

  const sum = (list: PaymentRowVM[], f: (r: PaymentRowVM) => number) => list.reduce((s, r) => s + f(r), 0);
  const received = period.filter((r) => r.state === "recebido");
  const rentReceived = received.filter((r) => r.kind === "parcela");
  const receitas = sum(received, (r) => r.paid);
  const recebidos = sum(rentReceived, (r) => r.paid);
  const pendentes = sum(period.filter((r) => r.state === "pendente"), (r) => r.remaining);
  const atraso = sum(all.filter((r) => r.state === "em_atraso"), (r) => r.remaining);
  const d30 = iso(new Date(new Date(today).getTime() + 30 * 864e5));
  const vencem = sum(all.filter((r) => r.state === "pendente" && r.date >= today && r.date <= d30), (r) => r.remaining);

  // Variação face ao mês anterior (só quando há um mês escolhido)
  const prev = (() => {
    if (monthKey === "todos") return null;
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return monthRange(d.getUTCFullYear(), d.getUTCMonth());
  })();
  const prevRows = prev ? all.filter((r) => inRange(r.date, prev.from, prev.to)) : [];
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const delta = prev ? {
    receitas: pct(receitas, sum(prevRows.filter((r) => r.state === "recebido"), (r) => r.paid)),
    recebidos: pct(recebidos, sum(prevRows.filter((r) => r.state === "recebido" && r.kind === "parcela"), (r) => r.paid)),
    pendentes: pct(pendentes, sum(prevRows.filter((r) => r.state === "pendente"), (r) => r.remaining)),
  } : { receitas: null, recebidos: null, pendentes: null };

  // Séries diárias para os mini-gráficos
  const series = (list: PaymentRowVM[], f: (r: PaymentRowVM) => number) => {
    const n = 30;
    const start = from ? new Date(from).getTime() : new Date(today).getTime() - 29 * 864e5;
    const out = Array.from({ length: n }, () => 0);
    list.forEach((r) => { const i = Math.floor((new Date(r.date).getTime() - start) / 864e5 / (monthKey === "todos" ? 12 : 1)); if (i >= 0 && i < n) out[i] += f(r); });
    return out;
  };

  // Filtros da tabela
  const q = norm(query.trim());
  const filtered = useMemo(() => {
    const test = TABS.find((t) => t.key === tab)!.test;
    const list = period.filter((r) =>
      test(r) &&
      (building === "todos" || r.office?.building_id === building) &&
      (method === "todos" || (method === "outros" ? r.method !== null && !["transferencia", "numerario", "multicaixa"].includes(r.method) : r.method === method)) &&
      (!minV || r.amount >= Number(minV)) && (!maxV || r.amount <= Number(maxV)) &&
      (!q || [r.company?.name, r.company?.nif, r.contractNumber, r.ref, String(Math.round(r.amount)), r.office?.number].some((v) => v && norm(String(v)).includes(q))));
    return [...list].sort((a, b) => {
      const k = sort.key;
      const x = k === "date" ? a.date : k === "amount" ? a.amount : k === "office" ? a.office?.number ?? "" : a.method ?? "";
      const y = k === "date" ? b.date : k === "amount" ? b.amount : k === "office" ? b.office?.number ?? "" : b.method ?? "";
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt", { numeric: true })) * sort.dir;
    });
  }, [period, tab, building, method, minV, maxV, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const pageRows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const resetPage = () => setPage(1);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "date" ? -1 : 1 }));
  const th = (label: string, cls: string, k?: SortKey) => (
    <th className={cls}>{k ? <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-white">{label}<span className={`text-[9px] ${sort.key === k ? "text-gold" : "text-slate-500"}`}>{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}</span></button> : label}</th>
  );

  // Resumo financeiro e métodos
  const prevista = sum(period.filter((r) => r.kind === "parcela" && r.state !== "cancelado"), (r) => r.amount) + sum(received.filter((r) => r.kind === "evento"), (r) => r.paid);
  const recebida = receitas;
  const emFalta = Math.max(0, prevista - recebida);
  const pRec = prevista ? Math.min(100, Math.round((recebida / prevista) * 100)) : 0;
  const methodTotals = [
    { k: "transferencia", label: "Transferência", color: "#5b8def" },
    { k: "numerario", label: "Numerário", color: "#f5b82e" },
    { k: "multicaixa", label: "Multicaixa", color: "#22a35a" },
    { k: "outros", label: "Outros", color: "#9aa5b8" },
  ].map((m) => ({ ...m, v: sum(received, (r) => (m.k === "outros" ? (r.method && !["transferencia", "numerario", "multicaixa"].includes(r.method) ? r.paid : 0) : r.method === m.k ? r.paid : 0)) }));
  const mTotal = methodTotals.reduce((s, m) => s + m.v, 0);
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const upcoming = all.filter((r) => r.state === "pendente" && r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 3);

  // Exportação e recibo
  const csvOf = (list: PaymentRowVM[]) => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const head = ["Data", "Referência", "Tipo", "Empresa", "NIF", "Contrato", "Escritório", "Valor", "Pago", "Estado", "Método"];
    const lines = list.map((r) => [r.date, r.ref, r.type, r.company?.name, r.company?.nif, r.contractNumber, r.office?.number, Math.round(r.amount), Math.round(r.paid), STATE[r.state].label, r.method ? METHOD[r.method] ?? r.method : ""].map(esc).join(";"));
    return "﻿" + [head.map(esc).join(";"), ...lines].join("\n");
  };
  const exportCsv = () => {
    const list = checked.size ? filtered.filter((r) => checked.has(r.id)) : filtered;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csvOf(list)], { type: "text/csv;charset=utf-8" }));
    a.download = `pagamentos-${today}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const receipt = (r: PaymentRowVM) => {
    const w = window.open("", "_blank", "width=720,height=800");
    if (!w) return setToast({ tone: "erro", text: "Permita janelas pop-up para gerar o recibo." });
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Recibo ${esc(r.ref)}</title>
      <style>body{font-family:Georgia,serif;margin:48px;color:#111}h1{margin:0;font-size:28px}small{color:#555}table{width:100%;border-collapse:collapse;margin-top:28px}td{padding:10px 0;border-bottom:1px solid #ddd;font-size:15px}td:first-child{color:#555;width:40%}.v{font-size:26px;margin-top:28px}</style></head><body>
      <small>BUSINESS CENTER ESPERANÇA · Centro Empresarial</small><h1>Recibo de pagamento</h1><small>${esc(r.ref)}</small>
      <table><tr><td>Empresa</td><td>${esc(r.company?.name ?? "—")}</td></tr><tr><td>NIF</td><td>${esc(r.company?.nif ?? "—")}</td></tr>
      <tr><td>Contrato</td><td>${esc(r.contractNumber)}</td></tr><tr><td>Escritório</td><td>${esc(r.office ? `${r.office.number} ${r.office.building ?? ""}` : "—")}</td></tr>
      <tr><td>Tipo</td><td>${esc(r.type)}</td></tr><tr><td>Data do pagamento</td><td>${esc(datePt(r.date))}</td></tr>
      <tr><td>Método</td><td>${esc(r.method ? METHOD[r.method] ?? r.method : "—")}</td></tr></table>
      <div class="v">Valor recebido: <b>${esc(kz(r.paid))}</b></div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const run = (p: Promise<ActionResult>, ok: string, then?: () => void) =>
    start(async () => {
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });

  const kpis = [
    { t: "Receitas do Mês", v: receitas, icon: I.Coins, c: "from-[#16a34a] to-[#0d5c2b]", d: delta.receitas, up: true, bars: series(received, (r) => r.paid), col: "#22a35a" },
    { t: "Pagamentos Recebidos", v: recebidos, icon: I.Download, c: "from-[#2563eb] to-[#143a8a]", d: delta.recebidos, up: true, bars: series(rentReceived, (r) => r.paid), col: "#3b82f6" },
    { t: "Pendentes", v: pendentes, icon: I.Clock, c: "from-[#b8862b] to-[#6a4a12]", d: delta.pendentes, up: false, bars: series(period.filter((r) => r.state === "pendente"), (r) => r.remaining), col: "#e0a122" },
    { t: "Em Atraso", v: atraso, icon: I.Alert, c: "from-[#e5484d] to-[#7a1f23]", d: null, up: false, bars: series(all.filter((r) => r.state === "em_atraso"), (r) => r.remaining), col: "#e5484d" },
    { t: "Vencem em 30 dias", v: vencem, icon: I.Calendar, c: "from-[#4f46e5] to-[#2a2585]", d: null, up: false, bars: series(all.filter((r) => r.state === "pendente" && r.date >= today && r.date <= d30), (r) => r.remaining), col: "#6b7fb3" },
  ];

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-pay.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"><I.ChevL className="size-3.5" />Pagamentos</Link>
            <h1 className="mt-1 text-5xl leading-none md:text-6xl">Pagamentos</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Controle todas as receitas, faturas e pagamentos do Business Center Esperança.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-[#07121b]/85 px-3.5 text-sm backdrop-blur">
              <I.Calendar className="size-5 text-slate-200" />
              <select value={monthKey} onChange={(e) => pickMonth(e.target.value)} aria-label="Período" className="bg-transparent pr-1 text-sm outline-none">
                {months.map((m) => <option key={m.key} value={m.key} className="bg-[#07121b]">{MONTHS[m.m]} {m.y}</option>)}
                <option value="todos" className="bg-[#07121b]">Todos os períodos</option>
              </select>
            </label>
            {canEdit && <button onClick={() => setShowNew(true)} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Registar Pagamento</button>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-slate-200">{k.t}</div>
                <div className="truncate text-xl font-semibold leading-tight">{kz(k.v)}</div>
                <div className="mb-1 flex items-center gap-1.5 text-[11px]">
                  {k.d !== null && <span className={(k.up ? k.d >= 0 : k.d <= 0) ? "text-emerald-400" : "text-red-400"}>{k.d >= 0 ? "↑" : "↓"} {Math.abs(k.d)}%</span>}
                  {k.d !== null && <span className="text-slate-400">vs. mês anterior</span>}
                </div>
                <Bars values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Separadores e ferramentas ───── */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); resetPage(); }}
            className={`rounded-lg border px-5 py-2.5 text-sm transition-colors ${tab === t.key ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>
            {t.label} ({count(t.key)})
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button onClick={exportCsv} className="flex h-11 items-center gap-2 rounded-lg border border-line bg-panel/80 px-4 text-sm hover:border-gold/50"><I.Download className="size-4" />Exportar{checked.size ? ` (${checked.size})` : ""}</button>
          <button onClick={() => setMore(!more)} className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm ${more ? "border-gold bg-gold/10 text-gold-soft" : "border-gold/50 text-gold-soft hover:bg-gold/10"}`}><I.Filter className="size-4" />Mais filtros</button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <I.Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); resetPage(); }} placeholder="Pesquisar por empresa, contrato, referência ou valor…"
                className="h-11 w-full rounded-lg border border-line bg-panel pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-gold" />
            </div>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm">
              <I.Calendar className="size-4 text-slate-300" />
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setMonthKey("custom"); resetPage(); }} aria-label="De" className="bg-transparent outline-none [color-scheme:dark]" />
              <span className="text-slate-500">—</span>
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setMonthKey("custom"); resetPage(); }} aria-label="Até" className="bg-transparent outline-none [color-scheme:dark]" />
            </div>
            <select value={building} onChange={(e) => { setBuilding(e.target.value); resetPage(); }} aria-label="Edifício" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
              <option value="todos">Todos os edifícios</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={method} onChange={(e) => { setMethod(e.target.value); resetPage(); }} aria-label="Método" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
              <option value="todos">Todos os métodos</option>
              <option value="transferencia">Transferência</option><option value="numerario">Numerário</option><option value="multicaixa">Multicaixa</option><option value="outros">Outros</option>
            </select>
          </div>
          {more && (
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4">
              <label className="text-xs text-slate-400">Valor mínimo (Kz)<input type="number" min="0" value={minV} onChange={(e) => { setMinV(e.target.value); resetPage(); }} className="mt-1 block h-10 w-40 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
              <label className="text-xs text-slate-400">Valor máximo (Kz)<input type="number" min="0" value={maxV} onChange={(e) => { setMaxV(e.target.value); resetPage(); }} className="mt-1 block h-10 w-40 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
              <button onClick={() => { setQuery(""); setBuilding("todos"); setMethod("todos"); setMinV(""); setMaxV(""); setTab("todos"); pickMonth(months[0].key); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar tudo</button>
            </div>
          )}

          <section className="rounded-2xl border border-line bg-panel/90 p-3">
            {pageRows.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted">{all.length === 0 ? "Ainda não há pagamentos registados." : "Nenhum pagamento corresponde aos filtros."}</p>
            ) : (
              <div className="overflow-x-auto" ref={menuRef}>
                <table className="min-w-[900px]">
                  <thead className="bg-white/[0.04]">
                    <tr>
                      <th className="w-10 pl-3 pt-3"><input type="checkbox" aria-label="Selecionar todos" checked={pageRows.length > 0 && pageRows.every((r) => checked.has(r.id))}
                        onChange={(e) => setChecked((s) => { const n = new Set(s); pageRows.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} className="accent-[#d6b06a]" /></th>
                      {th("Dados do Pagamento", "pt-3", "date")}{th("Empresa / Contrato", "pt-3")}{th("Escritório", "pt-3", "office")}{th("Valor", "pt-3", "amount")}
                      {th("Estado", "pt-3")}{th("Método", "pt-3", "method")}{th("Comprovativo", "pt-3")}{th("Ações", "pt-3")}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => {
                      const st = STATE[r.state];
                      const d = new Date(r.date + "T00:00:00Z");
                      const paidPct = r.amount ? Math.min(100, (r.paid / r.amount) * 100) : 0;
                      return (
                        <tr key={r.id} className="border-t border-line/70" style={{ boxShadow: `inset 3px 0 0 ${st.stripe}` }}>
                          <td className="pl-3"><input type="checkbox" aria-label="Selecionar" checked={checked.has(r.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} className="accent-[#d6b06a]" /></td>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-11 shrink-0 rounded-lg border border-line bg-[#041019] py-1 text-center leading-none">
                                <div className="text-base font-semibold">{String(d.getUTCDate()).padStart(2, "0")}</div><div className="mt-0.5 text-[10px] text-slate-400">{d.getUTCFullYear()}</div>
                              </div>
                              <div className="min-w-0"><div className="max-w-[10rem] truncate text-[13px] font-medium">{r.ref}</div><div className="text-xs text-slate-400">{r.type}</div></div>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: colorOf(r.company?.name ?? "?") }}>{initials(r.company?.name ?? "?")}</span>
                              <div className="min-w-0"><div className="max-w-[9rem] truncate text-[13px]">{r.company?.name ?? "—"}</div><div className="max-w-[9rem] truncate text-xs text-slate-400">{r.contractNumber}</div></div>
                            </div>
                          </td>
                          <td><div className="text-[13px]">{r.office?.number ?? "—"}</div><div className="text-xs text-slate-400">{r.office?.building ?? ""}</div></td>
                          <td className="min-w-[7.5rem]">
                            <div className="whitespace-nowrap text-[13px] font-medium">{kz(r.amount)}</div>
                            <div className="mt-1 h-1 w-20 rounded-full bg-white/10"><div className="h-1 rounded-full" style={{ width: `${Math.max(r.paid ? 8 : 4, paidPct)}%`, background: st.stripe }} /></div>
                          </td>
                          <td><span className={`inline-block min-w-[5rem] rounded px-2 py-1.5 text-center text-xs font-medium ${st.solid}`}>{st.label}</span></td>
                          <td className="text-[13px]">{r.method ? <span className="flex items-center gap-2"><I.Wallet className="size-4 text-slate-300" />{METHOD[r.method] ?? r.method}</span> : <span className="text-slate-500">—</span>}</td>
                          <td className="text-xs text-slate-400">{r.state === "recebido" ? <span className="flex items-center gap-1.5"><I.File className="size-4 text-slate-300" /><span className="max-w-[5rem] truncate">{r.reference ?? "Recibo"}</span></span> : "—"}</td>
                          <td>
                            <div className="relative flex items-center gap-1.5">
                              {r.contractId ? <Link href={`/contratos/${r.contractId}`} aria-label="Ver contrato" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Eye className="size-4" /></Link>
                                : <span className="grid size-9 place-items-center rounded-lg border border-line text-slate-600"><I.Eye className="size-4" /></span>}
                              <button disabled={r.state !== "recebido"} onClick={() => receipt(r)} aria-label="Recibo" title="Gerar recibo" className="grid size-9 place-items-center rounded-lg border border-line enabled:hover:border-gold/50 disabled:text-slate-600"><I.Download className="size-4" /></button>
                              <button onClick={() => setMenuId(menuId === r.id ? null : r.id)} aria-label="Mais ações" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>
                              {menuId === r.id && (
                                <div className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
                                  {r.contractId && <Link href={`/contratos/${r.contractId}`} className="block px-4 py-2.5 hover:bg-white/5">Abrir contrato</Link>}
                                  {r.company?.id && <Link href={`/escritorios/empresa/${r.company.id}`} className="block px-4 py-2.5 hover:bg-white/5">Ver empresa</Link>}
                                  {canEdit && r.installmentId && r.remaining > 0 && <button onClick={() => { setMenuId(null); setShowNew(true); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Registar pagamento</button>}
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
              <span>A mostrar {filtered.length ? (cur - 1) * pageSize + 1 : 0} a {Math.min(cur * pageSize, filtered.length)} de {filtered.length} pagamentos</span>
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
              <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Wallet className="size-4" /></span>Resumo Financeiro</h2>
              <span className="rounded-lg border border-line bg-panel2 px-2 py-1 text-[11px]">{monthKey === "todos" ? "Todos" : monthLabel}</span>
            </div>
            <div className="mt-4">
              <div className="text-sm text-slate-200">Receita Prevista ({monthName})</div>
              <div className="text-2xl font-semibold text-gold-soft">{kz(prevista)}</div>
            </div>
            <div className="mt-3">
              <div className="text-sm text-slate-200">Receita Recebida</div>
              <div className="text-2xl font-semibold text-emerald-400">{kz(recebida)}</div>
              <div className="mt-1.5 flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-white/10"><div className="h-2 rounded-full bg-[#22a35a]" style={{ width: `${pRec}%` }} /></div><span className="w-9 text-right text-xs">{pRec}%</span></div>
            </div>
            <div className="mt-3">
              <div className="text-sm text-slate-200">Em Falta</div>
              <div className="text-2xl font-semibold text-red-400">{kz(emFalta)}</div>
              <div className="mt-1.5 flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-white/10"><div className="h-2 rounded-full bg-[#e5484d]" style={{ width: `${prevista ? 100 - pRec : 0}%` }} /></div><span className="w-9 text-right text-xs">{prevista ? 100 - pRec : 0}%</span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Coins className="size-4" /></span>Métodos de Pagamento</h2>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative size-32 shrink-0">
                <svg viewBox="0 0 130 130" className="-rotate-90" aria-hidden>
                  <circle cx="65" cy="65" r={R} fill="none" stroke="#1b2740" strokeWidth="16" />
                  {mTotal > 0 && methodTotals.filter((m) => m.v > 0).map((m) => {
                    const len = (m.v / mTotal) * C;
                    const el = <circle key={m.k} cx="65" cy="65" r={R} fill="none" stroke={m.color} strokeWidth="16" strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />;
                    acc += len; return el;
                  })}
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-sm font-semibold">{short(mTotal)} Kz</div><div className="text-[10px] text-slate-400">Total</div></div></div>
              </div>
              <ul className="flex-1 space-y-2 text-xs">
                {methodTotals.map((m) => (
                  <li key={m.k} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: m.color }} /><span className="flex-1 text-slate-200">{m.label}</span><span className="font-medium">{mTotal ? Math.round((m.v / mTotal) * 100) : 0}%</span></li>
                ))}
              </ul>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Clock className="size-4" /></span>Próximos Vencimentos</h2>
              <button onClick={() => { setTab("pendentes"); pickMonth("todos"); }} className="rounded-lg border border-line px-2.5 py-1 text-[11px] hover:border-gold/50">Ver Todos</button>
            </div>
            {upcoming.length === 0 ? <p className="py-4 text-center text-xs text-muted">Sem vencimentos próximos.</p> : (
              <ul className="mt-3 space-y-3">
                {upcoming.map((r) => {
                  const d = new Date(r.date + "T00:00:00Z");
                  const n = daysBetween(r.date, today);
                  return (
                    <li key={r.id} className="flex items-center gap-3">
                      <div className="w-11 shrink-0 rounded-lg bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] py-1 text-center leading-none text-[#1a1305]">
                        <div className="text-base font-bold">{d.getUTCDate()}</div><div className="mt-0.5 text-[9px] font-semibold">{MON3[d.getUTCMonth()]}</div>
                      </div>
                      <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{r.company?.name ?? "—"}</div><div className="truncate text-[11px] text-slate-400">Escritório {r.office?.number ?? "—"} · {r.contractNumber}</div></div>
                      <div className="text-right"><div className="whitespace-nowrap text-[13px] font-medium">{kz(r.remaining)}</div><div className={`text-[11px] ${n <= 7 ? "text-red-400" : "text-amber-300"}`}>{n === 0 ? "Hoje" : `Em ${n} dias`}</div></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {showNew && <NewPaymentModal rows={all.filter((r) => r.installmentId && r.remaining > 0 && (r.state === "pendente" || r.state === "em_atraso"))} today={today} pending={pending} onClose={() => setShowNew(false)}
        onSubmit={(fd) => run(registerPaymentBoard(fd), "Pagamento registado.", () => setShowNew(false))} />}
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}

function NewPaymentModal({ rows, today, pending, onClose, onSubmit }: { rows: PaymentRowVM[]; today: string; pending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void }) {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const [sel, setSel] = useState(sorted[0]?.installmentId ?? "");
  const cur = sorted.find((r) => r.installmentId === sel);
  const field = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
  const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";
  return (
    <div role="dialog" aria-modal="true" aria-label="Registar pagamento" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="w-full max-w-xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h2 className="font-serif text-3xl">Registar pagamento</h2><p className="text-sm text-slate-400">Escolha a prestação em aberto e indique o valor recebido.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
        </div>
        {sorted.length === 0 ? <p className="rounded-lg border border-line p-4 text-sm text-slate-300">Não há prestações em aberto.</p> : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={lab}>Prestação *</label>
              <select name="installment_id" value={sel} onChange={(e) => setSel(e.target.value)} required className={field}>
                {sorted.map((r) => <option key={r.id} value={r.installmentId ?? ""}>{r.company?.name} · {r.contractNumber} · vence {datePt(r.date)} · {kz(r.remaining)}</option>)}
              </select>
            </div>
            <div><label className={lab}>Valor (Kz) *</label><input key={sel} name="amount" type="number" step="0.01" min="0.01" max={cur?.remaining} defaultValue={cur?.remaining} required className={field} /></div>
            <div><label className={lab}>Data do pagamento</label><input name="paid_at" type="date" defaultValue={today} max={today} className={`${field} [color-scheme:dark]`} /></div>
            <div><label className={lab}>Método</label><select name="method" defaultValue="transferencia" className={field}><option value="transferencia">Transferência</option><option value="numerario">Numerário</option><option value="multicaixa">Multicaixa</option><option value="cheque">Cheque</option><option value="outro">Outro</option></select></div>
            <div><label className={lab}>Referência</label><input name="reference" className={field} placeholder="ex.: comprovativo n.º" /></div>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending || sorted.length === 0} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Registar"}</button>
        </div>
      </form>
    </div>
  );
}
