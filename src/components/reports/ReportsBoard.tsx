"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Module, Movement, ReportsData } from "@/lib/reportsBoard";
import { datePt, escHtml, kz } from "@/lib/format";
import * as I from "@/components/icons";

const VIEWS = [["geral", "Visão Geral"], ["financeiro", "Financeiro"], ["ocupacao", "Ocupação e Espaços"], ["eventos", "Eventos"], ["restaurante", "Restaurante"], ["clientes", "Clientes e Vendas"], ["operacoes", "Operações"], ["rh", "Recursos Humanos"], ["impostos", "Impostos"], ["personalizado", "Personalizado"]] as const;
type View = (typeof VIEWS)[number][0];
type Panel = "kpis" | "rvd" | "fonte" | "ocupacao" | "desempenho" | "tipos" | "segmentos" | "top" | "despesas" | "rapidos" | "dados";
const ALL_PANELS: Panel[] = ["kpis", "rvd", "fonte", "ocupacao", "desempenho", "tipos", "segmentos", "top", "despesas", "rapidos", "dados"];
const BY_VIEW: Record<Exclude<View, "personalizado">, Panel[]> = {
  geral: ALL_PANELS,
  financeiro: ["kpis", "rvd", "fonte", "desempenho", "despesas", "top", "dados"],
  ocupacao: ["kpis", "ocupacao", "tipos", "dados"],
  eventos: ["kpis", "tipos", "fonte", "top", "dados"],
  restaurante: ["ocupacao", "dados"],
  clientes: ["kpis", "segmentos", "top", "fonte", "dados"],
  operacoes: ["kpis", "despesas", "desempenho", "dados"],
  rh: ["kpis", "despesas", "dados"],
  impostos: ["despesas", "dados"],
};
const PANEL_LABEL: Record<Panel, string> = { kpis: "Indicadores", rvd: "Receitas vs Despesas", fonte: "Receita por Fonte", ocupacao: "Ocupação dos Espaços", desempenho: "Desempenho por Mês", tipos: "Eventos por Tipo", segmentos: "Clientes por Segmento", top: "Top 5 Clientes", despesas: "Despesas por Categoria", rapidos: "Relatórios Rápidos", dados: "Dados Detalhados" };
const MODULES: [Module | "financeiro", string][] = [["financeiro", "Financeiro"], ["eventos", "Eventos"], ["restaurante", "Restaurante"], ["escritorios", "Escritórios"], ["operacoes", "Operações"], ["rh", "RH"], ["impostos", "Impostos"]];
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PAL = ["#3b82f6", "#e5484d", "#22a35a", "#e0a122", "#8b5cf6", "#22c1c3", "#ec6aa5", "#9aa5b8"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + "T00:00:00Z") + n * 864e5));
const diff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const kindOf = (title: string) => {
  const s = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return s.includes("casam") ? "Casamentos" : /reuni|visita|planeamento/.test(s) ? "Reuniões" : s.includes("anivers") ? "Aniversários" : /formatura|festa|infantil|jantar/.test(s) ? "Formaturas" : /corpor|confer|empres|workshop|lancam|govern|minist/.test(s) ? "Corporativos" : "Outros";
};
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const field = "h-10 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold";

function Bars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-8 items-end gap-[2px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}</div>;
}
function Donut({ parts, size = 130, stroke = 18, onPick }: { parts: { v: number; c: string; k: string }[]; size?: number; stroke?: number; onPick?: (k: string) => void }) {
  const R = size / 2 - stroke / 2, C = 2 * Math.PI * R, total = parts.reduce((s, p) => s + p.v, 0);
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#1b2740" strokeWidth={stroke} />
      {total > 0 && parts.filter((p) => p.v > 0).map((p) => { const len = (p.v / total) * C; const el = <circle key={p.k} onClick={() => onPick?.(p.k)} className={onPick ? "cursor-pointer transition hover:opacity-80" : ""} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={p.c} strokeWidth={stroke} strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />; acc += len; return el; })}
    </svg>
  );
}
function Ring({ value, color, size = 74 }: { value: number; color: string; size?: number }) {
  const R = size / 2 - 5, C = 2 * Math.PI * R;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size}><circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#1b2740" strokeWidth="6" /><circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(Math.min(100, value) / 100) * C} ${C}`} /></svg>
      <span className="absolute inset-0 grid place-items-center text-base font-semibold">{value}%</span>
    </div>
  );
}

export default function ReportsBoard({ data }: { data: ReportsData }) {
  const { movements, reservations, venues, offices, activeClients, sectors, restaurant, today } = data;
  const monthStart = `${today.slice(0, 7)}-01`;
  const [view, setView] = useState<View>("geral");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [compare, setCompare] = useState<"mes" | "ano" | "nenhum">("mes");
  const [custom, setCustom] = useState<Set<Panel>>(new Set(ALL_PANELS));
  const [drill, setDrill] = useState<null | { title: string; rows: Movement[] }>(null);
  const [tab, setTab] = useState<(typeof MODULES)[number][0]>("financeiro");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("todos");
  const [limit, setLimit] = useState(8);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const show = (p: Panel) => (view === "personalizado" ? custom.has(p) : BY_VIEW[view].includes(p));
  const inR = (d: string, a = from, b = to) => d >= a && d <= b;
  const len = Math.max(1, diff(to, from) + 1);
  const prev = compare === "ano"
    ? { a: iso(new Date(Date.UTC(Number(from.slice(0, 4)) - 1, Number(from.slice(5, 7)) - 1, Number(from.slice(8))))), b: iso(new Date(Date.UTC(Number(to.slice(0, 4)) - 1, Number(to.slice(5, 7)) - 1, Number(to.slice(8))))) }
    : { a: addDays(from, -len), b: addDays(from, -1) };
  const cmpOn = compare !== "nenhum";

  const cur = useMemo(() => movements.filter((m) => inR(m.date)), [movements, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const prv = useMemo(() => movements.filter((m) => inR(m.date, prev.a, prev.b)), [movements, prev.a, prev.b]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (l: Movement[], k: Movement["kind"]) => l.filter((m) => m.kind === k).reduce((s, m) => s + m.amount, 0);
  const rec = sum(cur, "receita"), dep = sum(cur, "despesa"), lucro = rec - dep;
  const recP = sum(prv, "receita"), depP = sum(prv, "despesa"), lucroP = recP - depP;
  const resIn = (a: string, b: string) => reservations.filter((r) => r.status !== "cancelada" && inR(r.starts_at.slice(0, 10), a, b));
  const doneIn = (a: string, b: string) => reservations.filter((r) => r.status === "confirmada" && r.ends_at.slice(0, 10) <= today && inR(r.ends_at.slice(0, 10), a, b)).length;
  const ocup = offices.total ? Math.round((offices.occupied / offices.total) * 100) : 0;

  const spark = (k: Movement["kind"] | "lucro") => {
    const n = 12, step = Math.max(1, Math.ceil(len / n));
    return Array.from({ length: n }, (_, i) => {
      const a = addDays(from, i * step), b = addDays(from, i * step + step - 1);
      const l = cur.filter((m) => inR(m.date, a, b));
      return k === "lucro" ? Math.max(0, sum(l, "receita") - sum(l, "despesa")) : sum(l, k);
    });
  };
  const rowsOf = (pred: (m: Movement) => boolean) => cur.filter(pred).sort((a, b) => (a.date < b.date ? 1 : -1));
  const open = (title: string, rows: Movement[]) => setDrill({ title, rows });

  const kpis = [
    { n: kz(rec), t: "Receita Total", icon: I.Coins, c: "from-[#b8862b] to-[#6a4a12]", d: cmpOn ? pct(rec, recP) : null, good: true, bars: spark("receita"), col: "#3b82f6", pick: () => open("Receita Total", rowsOf((m) => m.kind === "receita")) },
    { n: kz(dep), t: "Despesas Totais", icon: I.Receipt, c: "from-[#e5484d] to-[#7a1f23]", d: cmpOn ? pct(dep, depP) : null, good: false, bars: spark("despesa"), col: "#e5484d", pick: () => open("Despesas Totais", rowsOf((m) => m.kind === "despesa")) },
    { n: kz(lucro), t: "Lucro Operacional", icon: I.Chart, c: "from-[#16a34a] to-[#0d5c2b]", d: cmpOn ? pct(lucro, lucroP) : null, good: true, bars: spark("lucro"), col: "#22a35a", pick: () => open("Lucro Operacional (todos os movimentos)", rowsOf(() => true)) },
    { n: `${ocup}%`, t: "Taxa de Ocupação", icon: I.Building, c: "from-[#1a63e0] to-[#0f3a8a]", d: null, good: true, bars: Array.from({ length: 12 }, () => ocup), col: "#2f7bf5", pick: () => undefined },
    { n: String(doneIn(from, to)), t: "Eventos Realizados", icon: I.Calendar, c: "from-[#7c3aed] to-[#3b1d85]", d: cmpOn ? pct(doneIn(from, to), doneIn(prev.a, prev.b)) : null, good: true, bars: Array.from({ length: 12 }, (_, i) => resIn(addDays(from, Math.floor((i * len) / 12)), addDays(from, Math.floor(((i + 1) * len) / 12) - 1 < 0 ? 0 : Math.floor(((i + 1) * len) / 12) - 1)).length), col: "#8b5cf6", pick: () => open("Eventos realizados (receitas de eventos)", rowsOf((m) => m.module === "eventos")) },
    { n: String(activeClients), t: "Clientes Ativos", icon: I.Users, c: "from-[#d6902a] to-[#7a4c10]", d: null, good: true, bars: Array.from({ length: 12 }, () => activeClients), col: "#e0a122", pick: () => undefined },
  ];
  const arrow = (d: number | null, good: boolean) => d === null ? <span className="text-slate-500">&nbsp;</span> : <><span className={(good ? d >= 0 : d <= 0) ? "text-emerald-400" : "text-red-400"}>{d >= 0 ? "↑" : "↓"} {Math.abs(d)}%</span> <span className="text-slate-400">vs. {compare === "ano" ? "ano" : "período"} anterior</span></>;

  // Receitas vs Despesas por balde
  const buckets = useMemo(() => {
    const out: { label: string; a: string; b: string }[] = [];
    if (len <= 45) { const step = len > 31 ? 2 : 1; for (let i = 0; i < len; i += step) out.push({ label: String(Number(addDays(from, i).slice(8))), a: addDays(from, i), b: addDays(from, Math.min(len - 1, i + step - 1)) }); }
    else { let c = from.slice(0, 7); while (c <= to.slice(0, 7)) { const [y, m] = c.split("-").map(Number); out.push({ label: MONTHS[m - 1], a: `${c}-01`, b: iso(new Date(Date.UTC(y, m, 0))) }); c = iso(new Date(Date.UTC(y, m, 1))).slice(0, 7); } }
    return out;
  }, [from, to, len]);
  const bData = buckets.map((b) => { const l = cur.filter((m) => inR(m.date, b.a, b.b)); return { ...b, r: sum(l, "receita"), d: sum(l, "despesa") }; });
  const bMax = Math.max(...bData.flatMap((b) => [b.r, b.d]), 1);
  let cum = 0;
  const cumPts = bData.map((b) => { cum += b.r - b.d; return cum; });

  const group = (rows: Movement[], f: (m: Movement) => string) => { const mp = new Map<string, number>(); rows.forEach((m) => mp.set(f(m), (mp.get(f(m)) ?? 0) + m.amount)); return [...mp.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v); };
  const fonte = group(cur.filter((m) => m.kind === "receita"), (m) => m.category);
  const despCat = group(cur.filter((m) => m.kind === "despesa"), (m) => m.category);
  const topClients = group(cur.filter((m) => m.kind === "receita" && m.party), (m) => m.party as string).slice(0, 5);
  const tipos = group(resIn(from, to).map((r) => ({ category: kindOf(r.title), amount: 1 }) as unknown as Movement), (m) => m.category);

  // Desempenho dos últimos 12 meses (até ao mês final do período)
  const months12 = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1 - (11 - i), 1)); return d.toISOString().slice(0, 7); });
  const perf = months12.map((k) => { const l = movements.filter((m) => m.date.startsWith(k)); return { k, label: MONTHS[Number(k.slice(5)) - 1], r: sum(l, "receita"), d: sum(l, "despesa") }; });
  const pMax = Math.max(...perf.flatMap((p) => [p.r, p.d, Math.abs(p.r - p.d)]), 1);

  // Ocupação dos espaços
  const days = len;
  const venueOcc = venues.slice(0, 2).map((v) => {
    const hrs = reservations.filter((r) => r.venue_id === v.id && r.status !== "cancelada" && inR(r.starts_at.slice(0, 10))).reduce((s, r) => s + Math.min(14, Math.max(1, diff(r.ends_at, r.starts_at) * 24 || (Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 36e5)), 0);
    return { label: v.name, sub: v.capacity ? `${v.capacity} pax` : "", p: Math.min(100, Math.round((hrs / (days * 14)) * 100)), color: "#8b5cf6" };
  });
  const rrIn = restaurant.reservations.filter((r) => r.status !== "cancelada" && inR(r.starts_at.slice(0, 10))).length;
  const rings = [
    ...venueOcc,
    { label: "Restaurante", sub: restaurant.tables ? `${restaurant.tables} mesas` : "", p: restaurant.tables ? Math.min(100, Math.round((rrIn / (restaurant.tables * 3 * days)) * 100)) : 0, color: "#e0a122" },
    { label: "Escritórios", sub: `${offices.total} unid.`, p: ocup, color: "#3b82f6" },
  ].slice(0, 4);

  // Dados detalhados
  const detailRows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return cur.filter((m) => (tab === "financeiro" || m.module === tab) && (kind === "todos" || m.kind === kind) &&
      (!ql || `${m.description} ${m.category} ${m.origin} ${m.party ?? ""}`.toLowerCase().includes(ql))).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [cur, tab, kind, q]);
  const restaurantRows = tab === "restaurante" ? restaurant.reservations.filter((r) => inR(r.starts_at.slice(0, 10))).length : 0;

  // Exportação
  const toCsv = (rows: Movement[]) => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    return "﻿" + [["Data", "Tipo", "Descrição", "Categoria", "Valor (Kz)", "Estado", "Origem"].map(esc).join(";"),
      ...rows.map((m) => [m.date, m.kind === "receita" ? "Recebimento" : "Despesa", m.description, m.category, m.kind === "receita" ? m.amount : -m.amount, "Pago", m.origin].map(esc).join(";"))].join("\n");
  };
  const download = (content: string, name: string, type: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  const exportRows = (rows: Movement[], fmt: "csv" | "xls", name = "relatorio") => {
    if (fmt === "csv") return download(toCsv(rows), `${name}.csv`, "text/csv;charset=utf-8");
    const body = rows.map((m) => `<tr><td>${m.date}</td><td>${m.kind === "receita" ? "Recebimento" : "Despesa"}</td><td>${escHtml(m.description)}</td><td>${escHtml(m.category)}</td><td>${m.kind === "receita" ? m.amount : -m.amount}</td><td>Pago</td><td>${escHtml(m.origin)}</td></tr>`).join("");
    download(`﻿<html><head><meta charset="utf-8"></head><body><table border="1"><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor (Kz)</th><th>Estado</th><th>Origem</th></tr>${body}</table></body></html>`, `${name}.xls`, "application/vnd.ms-excel");
  };
  const printReport = (title: string, sections: { h: string; rows: [string, string][] }[]) => {
    const w = window.open("", "_blank", "width=860,height=900");
    if (!w) return alert("Permita janelas pop-up para gerar o PDF.");
    w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>body{font-family:Georgia,serif;margin:44px;color:#111}h1{margin:0}h2{margin-top:26px;font-size:18px}table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px solid #ddd;font-size:14px}small{color:#555}</style></head><body>
      <small>BUSINESS CENTER ESPERANÇA · Relatórios e Analytics</small><h1>${escHtml(title)}</h1><small>Período: ${datePt(from)} a ${datePt(to)}</small>
      ${sections.map((s) => `<h2>${escHtml(s.h)}</h2><table>${s.rows.map(([a, b]) => `<tr><td>${escHtml(a)}</td><td style="text-align:right">${escHtml(b)}</td></tr>`).join("") || "<tr><td>Sem dados</td><td></td></tr>"}</table>`).join("")}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  const quick = [
    { t: "Relatório Financeiro", d: "Receitas, despesas e lucros", icon: I.Coins, f: () => printReport("Relatório Financeiro", [{ h: "Resumo", rows: [["Receita total", kz(rec)], ["Despesas totais", kz(dep)], ["Lucro operacional", kz(lucro)]] }, { h: "Receita por fonte", rows: fonte.map((x) => [x.k, kz(x.v)] as [string, string]) }, { h: "Despesas por categoria", rows: despCat.map((x) => [x.k, kz(x.v)] as [string, string]) }]) },
    { t: "Relatório de Ocupação", d: "Espaços e taxas de utilização", icon: I.Building, f: () => printReport("Relatório de Ocupação", [{ h: "Ocupação por espaço", rows: rings.map((r) => [r.label, `${r.p}%`] as [string, string]) }, { h: "Escritórios", rows: [["Total", String(offices.total)], ["Ocupados", String(offices.occupied)], ["Taxa", `${ocup}%`]] }]) },
    { t: "Relatório de Eventos", d: "Tipos de eventos e receita", icon: I.Calendar, f: () => printReport("Relatório de Eventos", [{ h: "Eventos por tipo", rows: tipos.map((x) => [x.k, String(x.v)] as [string, string]) }, { h: "Receita de eventos", rows: [["Total", kz(cur.filter((m) => m.module === "eventos").reduce((s, m) => s + m.amount, 0))]] }]) },
    { t: "Relatório de Clientes", d: "Novos clientes e retenção", icon: I.Users, f: () => printReport("Relatório de Clientes", [{ h: "Clientes ativos", rows: [["Total", String(activeClients)]] }, { h: "Top clientes por receita", rows: topClients.map((x) => [x.k, kz(x.v)] as [string, string]) }, { h: "Segmentos", rows: sectors.map((s) => [s.sector, String(s.n)] as [string, string]) }]) },
  ];

  const presets = [
    ["Este mês", monthStart, today], ["Mês anterior", addDays(monthStart, -Number(addDays(monthStart, -1).slice(8))), addDays(monthStart, -1)],
    ["Trimestre", iso(new Date(Date.UTC(Number(today.slice(0, 4)), Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3, 1))), today], ["Ano", `${today.slice(0, 4)}-01-01`, today],
  ] as const;
  const panel = "rounded-2xl border border-line bg-panel/90 p-4";
  const empty = <p className="py-8 text-center text-xs text-muted">Sem dados neste período.</p>;
  const legend = (items: { k: string; v: number }[], total: number, onPick: (k: string) => void, fmt = (v: number) => `${total ? Math.round((v / total) * 100) : 0}%`) => (
    <ul className="flex-1 space-y-1.5 text-xs">{items.slice(0, 6).map((x, i) => (
      <li key={x.k}><button onClick={() => onPick(x.k)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/[0.05]"><i className="size-2.5 shrink-0 rounded-full" style={{ background: PAL[i % PAL.length] }} /><span className="flex-1 truncate text-slate-200">{x.k}</span><b>{fmt(x.v)}</b></button></li>))}</ul>
  );

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-4 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-rep.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl leading-none md:text-5xl">Relatórios e Analytics</h1>
            <p className="mt-2 max-w-md text-sm leading-snug text-slate-100">Análise completa e relatórios inteligentes do Business Center Esperança.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#07121b]/85 px-3 py-2 text-sm backdrop-blur">
              <I.Calendar className="size-4 text-slate-200" />
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="De" className="bg-transparent text-[13px] outline-none [color-scheme:dark]" />
              <span className="text-slate-500">—</span>
              <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Até" className="bg-transparent text-[13px] outline-none [color-scheme:dark]" />
            </div>
            <label className="rounded-xl border border-white/15 bg-[#07121b]/85 px-3 py-1.5 text-[10px] text-slate-400 backdrop-blur">Comparar com
              <select value={compare} onChange={(e) => setCompare(e.target.value as typeof compare)} className="block bg-transparent text-sm text-slate-100 outline-none"><option value="mes" className="bg-[#07121b]">Período anterior</option><option value="ano" className="bg-[#07121b]">Ano anterior</option><option value="nenhum" className="bg-[#07121b]">Sem comparação</option></select></label>
            <div className="relative" ref={exportRef}>
              <button onClick={() => setExportOpen(!exportOpen)} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Download className="size-5" />Gerar Relatório</button>
              {exportOpen && (
                <div className="absolute right-0 top-14 z-30 w-56 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-white/5" onClick={() => { setExportOpen(false); quick[0].f(); }}>PDF (imprimir / guardar)</button>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-white/5" onClick={() => { setExportOpen(false); exportRows(cur, "xls", `relatorio-${from}_${to}`); }}>Excel (.xls)</button>
                  <button className="block w-full px-4 py-2.5 text-left hover:bg-white/5" onClick={() => { setExportOpen(false); exportRows(cur, "csv", `relatorio-${from}_${to}`); }}>CSV</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ───── Separadores e atalhos de período ───── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-panel/70 p-1.5">
          {VIEWS.map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`rounded-lg px-4 py-2 text-sm transition-colors ${view === k ? "bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "text-slate-100 hover:bg-white/[0.06]"}`}>{l}</button>)}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {presets.map(([l, a, b]) => <button key={l} onClick={() => { setFrom(a); setTo(b); }} className={`rounded-lg border px-3 py-2 text-xs ${from === a && to === b ? "border-gold/60 bg-gold/10 text-gold-soft" : "border-line hover:border-gold/40"}`}>{l}</button>)}
        </div>
      </div>
      {view === "personalizado" && (
        <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-panel/80 p-3 text-xs">
          {ALL_PANELS.map((p) => (
            <label key={p} className="flex items-center gap-2"><input type="checkbox" checked={custom.has(p)} onChange={(e) => setCustom((s) => { const n = new Set(s); if (e.target.checked) n.add(p); else n.delete(p); return n; })} className="accent-[#d6b06a]" />{PANEL_LABEL[p]}</label>
          ))}
        </div>
      )}

      {/* ───── Indicadores ───── */}
      {show("kpis") && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {kpis.map((k) => (
            <button key={k.t} onClick={k.pick} className="flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-panel/90 p-3 text-left transition hover:border-gold/40">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-slate-300">{k.t}</span>
                <span className="block truncate text-lg font-semibold leading-tight">{k.n}</span>
                <span className="block h-4 truncate text-[10.5px]">{arrow(k.d, k.good)}</span>
                <Bars values={k.bars} color={k.col} />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
        {show("rvd") && (
          <section className={panel}>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-serif text-lg">Receitas vs Despesas</h2><span className="flex gap-3 text-[11px] text-slate-300"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#3b82f6]" />Receitas</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#e5484d]" />Despesas</span></span></div>
            {rec + dep === 0 ? empty : (
              <>
                <div className="flex h-44 items-end gap-[3px]">
                  {bData.map((b) => (
                    <button key={b.a} title={`${b.label}: ${kz(b.r)} / ${kz(b.d)}`} onClick={() => open(`Movimentos ${datePt(b.a)} – ${datePt(b.b)}`, rowsOf((m) => inR(m.date, b.a, b.b)))} className="group relative flex h-full flex-1 items-end justify-center gap-[1px]">
                      <i className="w-1/2 rounded-t-sm bg-gradient-to-t from-[#1d4ed8] to-[#3b82f6] transition group-hover:brightness-125" style={{ height: `${Math.max(2, (b.r / bMax) * 90)}%` }} />
                      <i className="w-1/2 rounded-t-sm bg-gradient-to-t from-[#9b1c22] to-[#e5484d] transition group-hover:brightness-125" style={{ height: `${Math.max(2, (b.d / bMax) * 90)}%` }} />
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex gap-[3px] text-[9px] text-slate-500">{bData.map((b) => <span key={b.a} className="flex-1 text-center">{b.label}</span>)}</div>
                <p className="mt-2 text-[11px] text-slate-400">Saldo acumulado no período: <b className={cumPts.at(-1)! >= 0 ? "text-emerald-400" : "text-red-400"}>{kz(cumPts.at(-1) ?? 0)}</b></p>
              </>
            )}
          </section>
        )}
        {show("fonte") && (
          <section className={panel}>
            <h2 className="mb-3 font-serif text-lg">Receita por Fonte</h2>
            {fonte.length === 0 ? empty : (
              <div className="flex items-center gap-3">
                <div className="relative size-[130px] shrink-0"><Donut parts={fonte.map((x, i) => ({ v: x.v, c: PAL[i % PAL.length], k: x.k }))} onPick={(k) => open(`Receita – ${k}`, rowsOf((m) => m.kind === "receita" && m.category === k))} />
                  <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-base font-semibold">{short(rec)}</div><div className="text-[10px] text-slate-400">Kz</div></div></div></div>
                {legend(fonte, rec, (k) => open(`Receita – ${k}`, rowsOf((m) => m.kind === "receita" && m.category === k)))}
              </div>
            )}
          </section>
        )}
        {show("ocupacao") && (
          <section className={panel}>
            <h2 className="mb-3 font-serif text-lg">Ocupação dos Espaços</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
              {rings.map((r) => <div key={r.label} className="flex flex-col items-center gap-1 text-center"><Ring value={r.p} color={r.color} /><div className="text-xs text-slate-200">{r.label}</div><div className="text-[10px] text-slate-500">{r.sub}</div></div>)}
            </div>
          </section>
        )}
        {show("desempenho") && (
          <section className={`${panel} xl:col-span-1`}>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-serif text-lg">Desempenho por Mês</h2><span className="rounded-lg border border-line bg-panel2 px-2 py-0.5 text-[11px]">Últimos 12 meses</span></div>
            <div className="flex gap-3 text-[11px] text-slate-300"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#3b82f6]" />Receita</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#e5484d]" />Despesa</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#22a35a]" />Lucro</span></div>
            <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="mt-2 h-36 w-full">
              {[0, 30, 60, 90, 118].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />)}
              {(["r", "d", "l"] as const).map((s) => {
                const pts = perf.map((p, i) => `${(i / 11) * 300},${116 - (Math.max(0, s === "l" ? p.r - p.d : p[s]) / pMax) * 108}`).join(" ");
                return <polyline key={s} points={pts} fill="none" stroke={s === "r" ? "#3b82f6" : s === "d" ? "#e5484d" : "#22a35a"} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
            <div className="flex">{perf.map((p) => <button key={p.k} onClick={() => open(`Movimentos de ${p.label} ${p.k.slice(0, 4)}`, movements.filter((m) => m.date.startsWith(p.k)).sort((a, b) => (a.date < b.date ? 1 : -1)))} className="flex-1 py-0.5 text-center text-[9px] text-slate-500 hover:text-gold">{p.label}</button>)}</div>
          </section>
        )}
        {show("tipos") && (
          <section className={panel}>
            <h2 className="mb-3 font-serif text-lg">Eventos por Tipo</h2>
            {tipos.length === 0 ? empty : (
              <div className="flex items-center gap-3">
                <div className="relative size-[130px] shrink-0"><Donut parts={tipos.map((x, i) => ({ v: x.v, c: PAL[i % PAL.length], k: x.k }))} />
                  <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-xl font-semibold">{tipos.reduce((s, x) => s + x.v, 0)}</div><div className="text-[10px] text-slate-400">Eventos</div></div></div></div>
                {legend(tipos, tipos.reduce((s, x) => s + x.v, 0), (k) => open(`Eventos – ${k} (receitas)`, rowsOf((m) => m.module === "eventos" && kindOf(m.description.replace("Evento – ", "")) === k)), (v) => String(v))}
              </div>
            )}
          </section>
        )}
        {show("segmentos") && (
          <section className={panel}>
            <h2 className="mb-3 font-serif text-lg">Clientes por Segmento</h2>
            {sectors.length === 0 ? empty : (
              <ul className="space-y-3">{sectors.slice(0, 5).map((s, i) => { const tot = sectors.reduce((a, b) => a + b.n, 0); return (
                <li key={s.sector} className="flex items-center gap-3 text-xs"><span className="w-24 shrink-0 truncate text-slate-200">{s.sector}</span>
                  <span className="h-2.5 flex-1 rounded-full bg-white/10"><i className="block h-2.5 rounded-full" style={{ width: `${(s.n / tot) * 100}%`, background: PAL[i % PAL.length] }} /></span><b className="w-9 text-right">{Math.round((s.n / tot) * 100)}%</b></li>); })}</ul>
            )}
          </section>
        )}
        {show("top") && (
          <section className={panel}>
            <h2 className="mb-3 font-serif text-lg">Top 5 Clientes (Receita)</h2>
            {topClients.length === 0 ? empty : (
              <table><thead><tr><th>#</th><th>Cliente</th><th className="text-right">Receita (Kz)</th><th className="text-right">%</th></tr></thead>
                <tbody>{topClients.map((c, i) => (
                  <tr key={c.k} onClick={() => open(`Receita – ${c.k}`, rowsOf((m) => m.kind === "receita" && m.party === c.k))} className="cursor-pointer border-t border-line/70">
                    <td className="text-[12px]">{i + 1}</td><td className="max-w-[9rem] truncate text-[12px]">{c.k}</td><td className="text-right text-[12px]">{Math.round(c.v).toLocaleString("pt-PT")}</td><td className="text-right text-[12px]">{rec ? Math.round((c.v / rec) * 100) : 0}%</td>
                  </tr>))}</tbody></table>
            )}
          </section>
        )}
        {show("despesas") && (
          <section className={panel}>
            <h2 className="mb-3 font-serif text-lg">Despesas por Categoria</h2>
            {despCat.length === 0 ? empty : (
              <div className="flex items-center gap-3">
                <div className="relative size-[130px] shrink-0"><Donut parts={despCat.map((x, i) => ({ v: x.v, c: PAL[i % PAL.length], k: x.k }))} onPick={(k) => open(`Despesa – ${k}`, rowsOf((m) => m.kind === "despesa" && m.category === k))} />
                  <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-base font-semibold">{short(dep)}</div><div className="text-[10px] text-slate-400">Kz</div></div></div></div>
                {legend(despCat, dep, (k) => open(`Despesa – ${k}`, rowsOf((m) => m.kind === "despesa" && m.category === k)))}
              </div>
            )}
          </section>
        )}
        {show("rapidos") && (
          <section className={panel}>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-serif text-lg">Relatórios Rápidos</h2><button onClick={() => dataRef.current?.scrollIntoView({ behavior: "smooth" })} className="rounded-lg border border-line px-2.5 py-1 text-[11px] hover:border-gold/50">Ver Todos</button></div>
            <ul className="space-y-2">{quick.map((r) => (
              <li key={r.t}><button onClick={r.f} className="flex w-full items-center gap-3 rounded-xl border border-line bg-[#041019] p-2.5 text-left transition hover:border-gold/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-gold/30 text-gold"><r.icon className="size-5" /></span>
                <span className="min-w-0"><span className="block text-[13px] font-medium">{r.t}</span><span className="block truncate text-[11px] text-slate-400">{r.d}</span></span></button></li>))}</ul>
          </section>
        )}
      </div>

      {/* ───── Dados detalhados ───── */}
      {show("dados") && (
        <section ref={dataRef} className={panel}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-2 font-serif text-xl">Dados Detalhados</h2>
            {MODULES.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setLimit(8); }} className={`rounded-lg border px-3 py-1.5 text-xs ${tab === k ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line hover:border-gold/40"}`}>{l}</button>)}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative"><I.Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar…" className={`${field} w-44 pl-9`} /></div>
              <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo" className={field}><option value="todos">Todos os tipos</option><option value="receita">Recebimentos</option><option value="despesa">Despesas</option></select>
              <button onClick={() => exportRows(detailRows, "xls", `dados-${tab}`)} className="flex h-10 items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 text-sm text-gold-soft hover:bg-gold/20"><I.Download className="size-4" />Exportar</button>
            </div>
          </div>
          {tab === "restaurante" ? <p className="py-8 text-center text-sm text-slate-300">O restaurante tem {restaurantRows} reserva(s) neste período. As reservas não geram faturação no sistema; consulte a página <Link href="/restaurante" className="text-gold hover:underline">Restaurante</Link>.</p>
            : detailRows.length === 0 ? empty : (
              <div className="overflow-x-auto"><table className="min-w-[760px]">
                <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th className="text-right">Valor (Kz)</th><th>Estado</th><th>Origem</th><th>Ações</th></tr></thead>
                <tbody>{detailRows.slice(0, limit).map((m) => (
                  <tr key={m.id} className="border-t border-line/70">
                    <td className="whitespace-nowrap text-[12px]">{datePt(m.date)}</td>
                    <td className="text-[12px]"><span className="flex items-center gap-1.5"><i className={`size-2 rounded-full ${m.kind === "receita" ? "bg-emerald-400" : "bg-red-400"}`} />{m.kind === "receita" ? "Recebimento" : "Despesa"}</span></td>
                    <td className="max-w-[16rem] truncate text-[12px]">{m.description}</td><td className="text-[12px] text-slate-300">{m.category}</td>
                    <td className={`whitespace-nowrap text-right text-[12px] font-medium ${m.kind === "receita" ? "" : "text-red-300"}`}>{m.kind === "receita" ? "" : "-"}{Math.round(m.amount).toLocaleString("pt-PT")}</td>
                    <td><span className="rounded bg-[#16a34a] px-2 py-0.5 text-[10.5px] text-white">Pago</span></td><td className="text-[12px] text-slate-300">{m.origin}</td>
                    <td><Link href={m.href} aria-label="Abrir origem" className="grid size-7 place-items-center rounded-md hover:bg-white/10"><I.Eye className="size-4" /></Link></td>
                  </tr>))}</tbody>
              </table></div>
            )}
          {detailRows.length > limit && <button onClick={() => setLimit((l) => l + 20)} className="mt-3 text-xs text-gold hover:underline">Mostrar mais ({detailRows.length - limit} restantes)</button>}
        </section>
      )}

      {/* ───── Origem dos valores ───── */}
      {drill && (
        <>
          <div className="fixed inset-0 z-40 bg-black/55" onClick={() => setDrill(null)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-line bg-[#06111a] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line p-5">
              <div><h2 className="font-serif text-2xl">{drill.title}</h2><p className="text-xs text-slate-400">{drill.rows.length} registo(s) · {kz(drill.rows.reduce((s, m) => s + (m.kind === "receita" ? m.amount : -m.amount), 0))}</p></div>
              <button onClick={() => setDrill(null)} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {drill.rows.length === 0 ? empty : (
                <ul className="space-y-2">{drill.rows.slice(0, 300).map((m) => (
                  <li key={m.id}><Link href={m.href} className="flex items-center gap-3 rounded-xl border border-line p-2.5 text-sm transition hover:border-gold/40">
                    <i className={`size-2.5 shrink-0 rounded-full ${m.kind === "receita" ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{m.description}</span><span className="block text-[11px] text-slate-400">{datePt(m.date)} · {m.category} · {m.origin}</span></span>
                    <b className={`whitespace-nowrap text-[13px] ${m.kind === "receita" ? "" : "text-red-300"}`}>{m.kind === "receita" ? "" : "-"}{Math.round(m.amount).toLocaleString("pt-PT")}</b>
                  </Link></li>))}</ul>
              )}
            </div>
            <div className="flex gap-2 border-t border-line p-4">
              <button onClick={() => exportRows(drill.rows, "xls", "origem-dos-valores")} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-gold/50 bg-gold/10 text-sm text-gold-soft hover:bg-gold/20"><I.Download className="size-4" />Excel</button>
              <button onClick={() => exportRows(drill.rows, "csv", "origem-dos-valores")} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-line text-sm hover:border-gold/50">CSV</button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
