"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CostCat, EqStatus, EquipVM, ItemVM, MoveVM, PlanVM, SupplierVM, TicketVM } from "@/lib/operationsBoard";
import {
  completePlanBoard, createCostBoard, deleteOpsRecord, moveItemBoard, saveEquipmentBoard, saveItemBoard, savePlanBoard,
  saveSupplierBoard, saveTicketBoard, setEquipmentStatusBoard, setTicketStatusBoard, type ActionResult,
} from "@/app/actions";
import { datePt, escHtml, kz } from "@/lib/format";
import * as I from "@/components/icons";

type Props = {
  items: ItemVM[]; movements: MoveVM[]; suppliers: SupplierVM[]; tickets: TicketVM[]; equipment: EquipVM[]; costs: { id: string; spent_on: string; category: CostCat; description: string; amount: number; supplier_id: string | null }[];
  plans: PlanVM[]; canEdit: boolean; today: string; monthStart: string; needsMigration: boolean;
};
type Field = { name: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea"; options?: [string, string][]; required?: boolean; def?: string | number; span?: boolean; step?: string };
type FormSpec = { title: string; subtitle?: string; fields: Field[]; hidden?: Record<string, string>; submit: (fd: FormData) => Promise<ActionResult>; ok: string };

const EQ: Record<EqStatus, { label: string; color: string }> = {
  operacional: { label: "Operacional", color: "#22a35a" }, manutencao: { label: "Em Manutenção", color: "#f0643a" },
  inativo: { label: "Inactivo", color: "#4a8cff" }, fora_servico: { label: "Fora de Serviço", color: "#8b7cf6" },
};
const COST: Record<CostCat, { label: string; color: string }> = {
  manutencao: { label: "Manutenção", color: "#f0a91c" }, compras: { label: "Compras/Stock", color: "#3b82f6" }, servicos: { label: "Serviços", color: "#22a38a" },
  energia: { label: "Energia e Água", color: "#e5484d" }, outros: { label: "Outros", color: "#8b5cf6" },
};
const PRI: [string, string][] = [["baixa", "Baixa"], ["normal", "Normal"], ["alta", "Alta"], ["urgente", "Urgente"]];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const fld = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";
const initials = (n: string) => n.split(/[\s&]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const ym = (s: string) => s.slice(0, 7);

function Bars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-8 items-end gap-[2px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}</div>;
}
function Donut({ parts, size = 130, stroke = 16 }: { parts: { v: number; c: string }[]; size?: number; stroke?: number }) {
  const R = size / 2 - stroke, C = 2 * Math.PI * R, total = parts.reduce((s, p) => s + p.v, 0);
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#1b2740" strokeWidth={stroke} />
      {total > 0 && parts.filter((p) => p.v > 0).map((p, i) => { const len = (p.v / total) * C; const el = <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={p.c} strokeWidth={stroke} strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />; acc += len; return el; })}
    </svg>
  );
}
function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {tabs.map(([k, l]) => <button key={k} onClick={() => onChange(k)} className={`rounded-lg border px-3.5 py-1.5 text-xs transition-colors ${value === k ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel2/60 text-slate-200 hover:border-gold/40"}`}>{l}</button>)}
    </div>
  );
}

export default function OperationsBoard({ items, movements, suppliers, tickets, equipment, costs, plans, canEdit, today, monthStart, needsMigration }: Props) {
  const [section, setSection] = useState<"logistica" | "fornecedores" | "manutencao">("logistica");
  const [stockTab, setStockTab] = useState<"resumo" | "equip" | "stock" | "mov">("resumo");
  const [supTab, setSupTab] = useState<"principais" | "compras" | "avaliacao">("principais");
  const [manTab, setManTab] = useState<"ordens" | "equip" | "plano">("ordens");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [period, setPeriod] = useState<"mes" | "anterior">("mes");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const logRef = useRef<HTMLElement>(null);
  const supRef = useRef<HTMLElement>(null);
  const manRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const run = (p: Promise<ActionResult>, ok: string, then?: () => void) =>
    start(async () => {
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });
  const del = (table: string, id: string, label: string) => { setMenu(null); if (confirm(`Eliminar ${label}?`)) run(deleteOpsRecord(table, id), "Eliminado."); };
  const goto = (s: typeof section) => { setSection(s); const el = s === "logistica" ? logRef.current : s === "fornecedores" ? supRef.current : manRef.current; el?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const supName = new Map(suppliers.map((s) => [s.id, s.name]));
  const supOpts: [string, string][] = [["", "—"], ...suppliers.map((s) => [s.id, s.name] as [string, string])];
  const eqOpts: [string, string][] = [["", "—"], ...equipment.map((e) => [e.id, e.name] as [string, string])];
  const itemOpts: [string, string][] = items.map((i) => [i.id, i.name]);

  // ── Indicadores
  const before = (l: { created_at?: string; opened_at?: string }[]) => l.filter((x) => (x.created_at ?? x.opened_at ?? "") < monthStart).length;
  const growth = (n: number, b: number) => (b > 0 ? Math.round(((n - b) / b) * 100) : null);
  const pending_t = tickets.filter((t) => t.status !== "concluido");
  const mKey = period === "mes" ? ym(today) : ym(new Date(Date.parse(`${ym(today)}-01T00:00:00Z`) - 864e5).toISOString());
  const pKey = ym(new Date(Date.parse(`${mKey}-01T00:00:00Z`) - 864e5).toISOString());
  const allCosts = [
    ...costs.map((c) => ({ on: c.spent_on, cat: c.category, amt: c.amount })),
    ...tickets.filter((t) => t.cost).map((t) => ({ on: (t.closed_at ?? t.opened_at).slice(0, 10), cat: "manutencao" as CostCat, amt: t.cost as number })),
  ];
  const inP = (k: string) => allCosts.filter((c) => ym(c.on) === k);
  const mCosts = inP(mKey), pCosts = inP(pKey);
  const mTotal = mCosts.reduce((s, c) => s + c.amt, 0), pTotal = pCosts.reduce((s, c) => s + c.amt, 0);
  const costDelta = growth(mTotal, pTotal);
  const byCat = (Object.keys(COST) as CostCat[]).map((k) => ({ k, v: mCosts.filter((c) => c.cat === k).reduce((s, c) => s + c.amt, 0) }));
  const last30 = (f: (d: string) => number) => Array.from({ length: 12 }, (_, i) => f(new Date(Date.parse(today) - (11 - i) * 864e5 * 2).toISOString().slice(0, 10)));
  const kpis = [
    { n: String(items.length + equipment.length), t: "Equipamentos / Activos", icon: I.Package, c: "from-[#1a63e0] to-[#0f3a8a]", d: growth(items.length + equipment.length, before(items) + before(equipment)), good: true, bars: last30(() => items.length), col: "#2f7bf5" },
    { n: String(suppliers.length), t: "Fornecedores", icon: I.Truck, c: "from-[#16a34a] to-[#0d5c2b]", d: growth(suppliers.length, before(suppliers)), good: true, bars: last30(() => suppliers.length), col: "#22a35a" },
    { n: String(tickets.length), t: "Ordens de Manutenção", icon: I.Wrench, c: "from-[#d6902a] to-[#7a4c10]", d: growth(tickets.length, before(tickets)), good: true, bars: last30((d) => tickets.filter((t) => t.opened_at.slice(0, 10) <= d).length), col: "#e0a122" },
    { n: String(pending_t.length), t: "Intervenções Pendentes", icon: I.Alert, c: "from-[#e5484d] to-[#7a1f23]", d: null, good: false, bars: last30((d) => pending_t.filter((t) => t.opened_at.slice(0, 10) <= d).length), col: "#e5484d" },
    { n: kz(mTotal), t: "Custos Operacionais", icon: I.Coins, c: "from-[#b8862b] to-[#6a4a12]", d: costDelta, good: false, bars: last30((d) => allCosts.filter((c) => c.on === d).reduce((s, c) => s + c.amt, 0)), col: "#22a35a" },
  ];

  // ── Stock
  const state = (i: ItemVM) => (i.quantity <= 0 ? "sem" : i.quantity <= i.min ? "baixo" : "normal");
  const stPill = (s: string) => <span className={`inline-block min-w-[3.8rem] rounded px-2 py-1 text-center text-[11px] font-medium ${s === "normal" ? "bg-[#16a34a] text-white" : s === "baixo" ? "bg-[#f0a91c] text-[#1a1305]" : "bg-[#e5484d] text-white"}`}>{s === "normal" ? "Normal" : s === "baixo" ? "Baixo" : "Sem stock"}</span>;
  const q = query.trim().toLowerCase();
  const itemRows = (items.filter((i) => !q || `${i.name} ${i.category} ${i.location ?? ""}`.toLowerCase().includes(q)));
  const itemsShown = expanded.stock || stockTab === "stock" ? itemRows : itemRows.slice(0, 5);

  // ── Séries do gráfico de custos (acumulado diário)
  const [yy, mm] = mKey.split("-").map(Number);
  const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const series = (["manutencao", "compras", "servicos", "outros"] as const).map((k) => {
    let acc = 0;
    const pts = Array.from({ length: dim }, (_, d) => { acc += mCosts.filter((c) => Number(c.on.slice(8)) === d + 1 && (k === "outros" ? c.cat === "outros" || c.cat === "energia" : c.cat === k)).reduce((s, c) => s + c.amt, 0); return acc; });
    return { k, pts, color: k === "outros" ? "#8b5cf6" : COST[k].color, label: k === "outros" ? "Outros" : COST[k].label };
  });
  const maxY = Math.max(...series.flatMap((s) => s.pts), 1);

  const fmtReport = () => {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return setToast({ tone: "erro", text: "Permita janelas pop-up para gerar o relatório." });
    const row = (a: string, b: string) => `<tr><td>${escHtml(a)}</td><td style="text-align:right">${escHtml(b)}</td></tr>`;
    w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Relatório Operacional</title><style>body{font-family:Georgia,serif;margin:44px;color:#111}h1{margin:0}h2{margin-top:28px;font-size:18px}table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px solid #ddd;font-size:14px}small{color:#555}</style></head><body>
      <small>BUSINESS CENTER ESPERANÇA · Operações</small><h1>Relatório Operacional</h1><small>${MONTHS[mm - 1]} ${yy} · gerado em ${datePt(today)}</small>
      <h2>Resumo</h2><table>${row("Itens em stock", String(items.length))}${row("Stock baixo", String(items.filter((i) => state(i) === "baixo").length))}${row("Sem stock", String(items.filter((i) => state(i) === "sem").length))}${row("Equipamentos", String(equipment.length))}${row("Fornecedores", String(suppliers.length))}${row("Ordens de manutenção", String(tickets.length))}${row("Intervenções pendentes", String(pending_t.length))}${row("Custos operacionais do mês", kz(mTotal))}</table>
      <h2>Custos por categoria</h2><table>${byCat.map((c) => row(COST[c.k].label, kz(c.v))).join("")}</table>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const newItem = (it?: ItemVM): FormSpec => ({
    title: it ? `Editar ${it.name}` : "Novo item de stock", ok: "Item guardado.", submit: (fd) => saveItemBoard(fd), hidden: it ? { id: it.id } : undefined,
    fields: [
      { name: "name", label: "Nome *", required: true, def: it?.name, span: true },
      { name: "category", label: "Categoria", def: it?.category ?? "Consumo" }, { name: "unit", label: "Unidade", def: it?.unit ?? "un" },
      ...(it ? [] : [{ name: "quantity", label: "Quantidade inicial", type: "number" as const, def: 0 }]),
      { name: "min_quantity", label: "Stock mínimo", type: "number", def: it?.min ?? 0 }, { name: "location", label: "Localização", def: it?.location ?? "" },
      { name: "supplier_id", label: "Fornecedor", type: "select", options: supOpts, def: it?.supplier_id ?? "" },
    ],
  });
  const moveForm = (it?: ItemVM): FormSpec => ({
    title: "Movimento de stock", subtitle: "Entradas, saídas ou ajuste do stock. As saídas não podem exceder o existente.", ok: "Movimento registado.", submit: (fd) => moveItemBoard(fd),
    fields: [
      { name: "item_id", label: "Item *", type: "select", options: itemOpts, required: true, def: it?.id, span: true },
      { name: "kind", label: "Tipo", type: "select", options: [["entrada", "Entrada"], ["saida", "Saída"], ["ajuste", "Ajuste (define a quantidade)"]], def: "saida" },
      { name: "quantity", label: "Quantidade *", type: "number", required: true, step: "0.01" },
      { name: "destination", label: "Destino / origem", def: "" }, { name: "note", label: "Nota", def: "" },
    ],
  });
  const newSupplier = (s?: SupplierVM): FormSpec => ({
    title: s ? `Editar ${s.name}` : "Novo fornecedor", ok: "Fornecedor guardado.", submit: (fd) => saveSupplierBoard(fd), hidden: s ? { id: s.id } : undefined,
    fields: [
      { name: "name", label: "Nome *", required: true, def: s?.name, span: true },
      { name: "category", label: "Produtos / serviços", def: s?.category ?? "" }, { name: "nif", label: "NIF", def: s?.nif ?? "" },
      { name: "phone", label: "Telefone", def: s?.phone ?? "" }, { name: "email", label: "Email", def: s?.email ?? "" },
      { name: "status", label: "Estado", type: "select", options: [["ativo", "Activo"], ["avaliacao", "Em Avaliação"], ["inativo", "Inactivo"]], def: s?.status ?? "ativo" },
      { name: "rating", label: "Avaliação (1–5)", type: "number", def: s?.rating ?? "" },
    ],
  });
  const newTicket = (urgent = false): FormSpec => ({
    title: urgent ? "Pedido de manutenção" : "Nova ordem de serviço", ok: "Ordem criada.", submit: (fd) => saveTicketBoard(fd),
    fields: [
      { name: "title", label: "Descrição *", required: true, span: true }, { name: "area", label: "Local / área", def: "Edifício" },
      { name: "priority", label: "Prioridade", type: "select", options: PRI, def: urgent ? "alta" : "normal" },
      { name: "equipment_id", label: "Equipamento", type: "select", options: eqOpts, def: "" }, { name: "supplier_id", label: "Fornecedor", type: "select", options: supOpts, def: "" },
      { name: "cost", label: "Custo estimado (Kz)", type: "number", def: "" },
    ],
  });
  const newEquip = (e?: EquipVM): FormSpec => ({
    title: e ? `Editar ${e.name}` : "Novo equipamento", ok: "Equipamento guardado.", submit: (fd) => saveEquipmentBoard(fd), hidden: e ? { id: e.id } : undefined,
    fields: [
      { name: "name", label: "Nome *", required: true, def: e?.name, span: true }, { name: "code", label: "Código", def: e?.code ?? "" }, { name: "category", label: "Categoria", def: e?.category ?? "" },
      { name: "location", label: "Localização", def: e?.location ?? "" },
      { name: "status", label: "Estado", type: "select", options: Object.entries(EQ).map(([k, v]) => [k, v.label] as [string, string]), def: e?.status ?? "operacional" },
      { name: "supplier_id", label: "Fornecedor", type: "select", options: supOpts, def: e?.supplier_id ?? "" }, { name: "value", label: "Valor (Kz)", type: "number", def: e?.value ?? "" },
    ],
  });
  const newCost: FormSpec = {
    title: "Registar compra", subtitle: "Regista o custo e, se escolher um item, dá entrada em stock.", ok: "Compra registada.", submit: (fd) => createCostBoard(fd),
    fields: [
      { name: "description", label: "Descrição *", required: true, span: true },
      { name: "category", label: "Categoria", type: "select", options: (Object.keys(COST) as CostCat[]).map((k) => [k, COST[k].label] as [string, string]), def: "compras" },
      { name: "amount", label: "Valor (Kz) *", type: "number", required: true, step: "0.01" }, { name: "spent_on", label: "Data", type: "date", def: today },
      { name: "supplier_id", label: "Fornecedor", type: "select", options: supOpts, def: "" },
      { name: "item_id", label: "Dar entrada no item", type: "select", options: [["", "— não alterar stock —"], ...itemOpts], def: "" }, { name: "quantity", label: "Quantidade", type: "number", step: "0.01" },
    ],
  };
  const newPlan: FormSpec = {
    title: "Novo plano preventivo", ok: "Plano criado.", submit: (fd) => savePlanBoard(fd),
    fields: [
      { name: "title", label: "Tarefa *", required: true, span: true }, { name: "equipment_id", label: "Equipamento", type: "select", options: eqOpts, def: "" },
      { name: "every_days", label: "A cada (dias) *", type: "number", required: true, def: 30 }, { name: "next_due", label: "Próxima data *", type: "date", required: true, def: today },
    ],
  };

  const actions = [
    { l: "Novo Equipamento", gold: true, icon: I.Plus, f: () => setForm(newEquip()) },
    { l: "Novo Fornecedor", gold: false, icon: I.Plus, f: () => setForm(newSupplier()), amber: true },
    { l: "Nova Ordem de Serviço", gold: false, icon: I.Plus, f: () => setForm(newTicket()), amber: true },
    { l: "Registar Compra", gold: false, icon: I.Coins, f: () => setForm(newCost) },
    { l: "Pedido de Manutenção", gold: false, icon: I.Wrench, f: () => setForm(newTicket(true)) },
    { l: "Relatório Operacional", gold: false, icon: I.File, f: fmtReport },
  ];

  const kebab = (id: string, children: React.ReactNode) => (
    <div className="relative">
      <button onClick={() => setMenu(menu === id ? null : id)} aria-label="Mais ações" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>
      {menu === id && <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">{children}</div>}
    </div>
  );
  const mi = "block w-full px-4 py-2.5 text-left hover:bg-white/5";
  const panel = "rounded-2xl border border-line bg-panel/90 p-4";

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-4 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-ops.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <h1 className="text-5xl leading-none md:text-6xl">Operações</h1>
        <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Gestão integrada de logística, fornecedores e manutenção do Business Center Esperança.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold leading-tight">{k.n}</div>
                <div className="truncate text-xs text-slate-200">{k.t}</div>
                <div className="mb-1 h-4 text-[11px]">{k.d !== null && <><span className={(k.good ? k.d >= 0 : k.d <= 0) ? "text-emerald-400" : "text-red-400"}>{k.d >= 0 ? "↑" : "↓"} {Math.abs(k.d)}%</span> <span className="text-slate-400">vs. mês anterior</span></>}</div>
                <Bars values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {needsMigration && <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-amber-200">Para equipamentos, custos e plano preventivo, execute a migração <b>0016_operations.sql</b> no Supabase.</p>}

      {/* ───── Secções ───── */}
      <div className="grid gap-3 md:grid-cols-3">
        {([["logistica", "Logística", "Equipamentos, stock e movimentações", I.Package], ["fornecedores", "Fornecedores", "Gestão de fornecedores e contratos", I.Users], ["manutencao", "Manutenção", "Ordens de serviço e intervenções", I.Wrench]] as const).map(([k, t, d, Icon]) => (
          <button key={k} onClick={() => goto(k)} className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${section === k ? "border-[#2f7bf5] bg-gradient-to-r from-[#1a3a7a]/60 to-[#0b1f4a]/30 shadow-[0_0_0_1px_rgba(47,123,245,0.4)]" : "border-line bg-panel/80 hover:border-gold/40"}`}>
            <span className={`grid size-14 shrink-0 place-items-center rounded-xl ${section === k ? "bg-[#1a63e0] text-white" : "bg-white/[0.05] text-slate-200"}`}><Icon className="size-7" /></span>
            <span><span className="block font-serif text-xl">{t}</span><span className="text-xs text-slate-300">{d}</span></span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3" ref={boxRef}>
        {/* ───── Stock e Equipamentos ───── */}
        <section ref={logRef} className={`${panel} scroll-mt-20`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><I.Package className="size-5 text-gold" />Stock e Equipamentos</h2>
            <button onClick={() => { setStockTab("stock"); }} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-gold/50">Ver Todos</button></div>
          <Tabs value={stockTab} onChange={setStockTab} tabs={[["resumo", "Resumo"], ["equip", "Equipamentos"], ["stock", "Stock"], ["mov", "Movimentações"]]} />
          {stockTab === "resumo" && (
            <div className="mb-3 grid grid-cols-4 gap-2">
              {[[items.filter((i) => i.quantity > 0).length, "Itens em Stock", "#22a35a"], [items.filter((i) => state(i) === "baixo").length, "Stock Baixo", "#f0a91c"], [items.filter((i) => state(i) === "sem").length, "Sem Stock", "#e5484d"], [equipment.filter((e) => e.status === "operacional").length, "Em Utilização", "#3b82f6"]].map(([n, t, c]) => (
                <div key={String(t)} className="rounded-xl border border-line bg-[#041019] p-2 text-center"><div className="text-lg font-semibold" style={{ color: String(c) }}>{n}</div><div className="text-[10px] leading-tight text-slate-400">{t}</div></div>
              ))}
            </div>
          )}
          {(stockTab === "resumo" || stockTab === "stock") && (
            <>
              {stockTab === "stock" && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar item, categoria, local…" className="mb-2 h-9 w-full rounded-lg border border-line bg-panel pl-3 text-sm outline-none focus:border-gold" />}
              {itemsShown.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem itens em stock.</p> : (
                <table>
                  <thead><tr><th className="pt-1">Item</th><th>Categoria</th><th>Qtd.</th><th>Estado</th><th>Local</th><th /></tr></thead>
                  <tbody>{itemsShown.map((i) => (
                    <tr key={i.id} className="border-t border-line/70">
                      <td className="max-w-[7rem] truncate text-[12px] font-medium">{i.name}</td><td className="text-[12px] text-slate-300">{i.category}</td>
                      <td className="text-[12px]">{i.quantity}</td><td>{stPill(state(i))}</td><td className="max-w-[5rem] truncate text-[12px] text-slate-300">{i.location ?? "—"}</td>
                      <td>{canEdit && kebab(`i${i.id}`, <><button className={mi} onClick={() => { setMenu(null); setForm(moveForm(i)); }}>Movimentar stock</button><button className={mi} onClick={() => { setMenu(null); setForm(newItem(i)); }}>Editar</button><button className={`${mi} text-red-400`} onClick={() => del("logistics_items", i.id, i.name)}>Eliminar</button></>)}</td>
                    </tr>))}</tbody>
                </table>
              )}
              {stockTab === "resumo" && itemRows.length > 5 && <button onClick={() => setExpanded((e) => ({ ...e, stock: !e.stock }))} className="mt-2 text-xs text-gold hover:underline">{expanded.stock ? "Mostrar menos" : `Mostrar todos (${itemRows.length})`}</button>}
              {canEdit && <button onClick={() => setForm(newItem())} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Plus className="size-3.5" />Novo item</button>}
            </>
          )}
          {stockTab === "equip" && (
            equipment.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem equipamentos registados.</p> : (
              <table><thead><tr><th className="pt-1">Equipamento</th><th>Local</th><th>Estado</th><th /></tr></thead>
                <tbody>{equipment.map((e) => (
                  <tr key={e.id} className="border-t border-line/70"><td className="max-w-[8rem] truncate text-[12px] font-medium">{e.name}</td><td className="max-w-[5rem] truncate text-[12px] text-slate-300">{e.location ?? "—"}</td>
                    <td><span className="inline-flex items-center gap-1.5 text-[11px]"><i className="size-2 rounded-full" style={{ background: EQ[e.status].color }} />{EQ[e.status].label}</span></td>
                    <td>{canEdit && kebab(`e${e.id}`, <><button className={mi} onClick={() => { setMenu(null); setForm(newEquip(e)); }}>Editar</button>
                      {(Object.keys(EQ) as EqStatus[]).filter((s) => s !== e.status).map((s) => <button key={s} className={mi} onClick={() => { setMenu(null); run(setEquipmentStatusBoard(e.id, s), `Estado: ${EQ[s].label}.`); }}>{EQ[s].label}</button>)}
                      <button className={`${mi} text-red-400`} onClick={() => del("equipment", e.id, e.name)}>Eliminar</button></>)}</td></tr>))}</tbody></table>
            )
          )}
          {stockTab === "mov" && (
            movements.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem movimentações.</p> : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">{movements.slice(0, 30).map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-xl border border-line p-2.5 text-xs">
                  <span><b className="text-[13px]">{m.item}</b><br /><span className="text-slate-400">{datePt(m.created_at)}{m.destination ? ` · ${m.destination}` : ""}</span></span>
                  <span className={m.kind === "entrada" ? "text-emerald-400" : m.kind === "saida" ? "text-red-400" : "text-amber-300"}>{m.kind === "entrada" ? "+" : m.kind === "saida" ? "−" : "="}{m.quantity}</span>
                </li>))}</ul>
            )
          )}
          {canEdit && stockTab !== "stock" && <button onClick={() => setForm(moveForm())} className="mt-2 ml-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Package className="size-3.5" />Movimento</button>}
        </section>

        {/* ───── Fornecedores ───── */}
        <section ref={supRef} className={`${panel} scroll-mt-20`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><I.Users className="size-5 text-gold" />Fornecedores</h2>
            <button onClick={() => setExpanded((e) => ({ ...e, sup: !e.sup }))} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-gold/50">{expanded.sup ? "Menos" : "Ver Todos"}</button></div>
          <Tabs value={supTab} onChange={setSupTab} tabs={[["principais", "Principais"], ["compras", "Compras"], ["avaliacao", "Avaliação"]]} />
          {supTab === "principais" && (suppliers.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem fornecedores.</p> : (
            <ul className="space-y-2">{(expanded.sup ? suppliers : suppliers.slice(0, 5)).map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: colorOf(s.name) }}>{initials(s.name)}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{s.name}</div><div className="truncate text-[11px] text-slate-400">{s.category ?? "—"}</div></div>
                <span className="hidden text-[10px] text-slate-500 sm:block">NIF: {s.nif ?? "—"}</span>
                <span className={`rounded px-2 py-1 text-[11px] font-medium ${s.status === "ativo" ? "bg-[#16a34a] text-white" : s.status === "avaliacao" ? "bg-[#f0a91c] text-[#1a1305]" : "bg-[#4b5563] text-white"}`}>{s.status === "ativo" ? "Activo" : s.status === "avaliacao" ? "Em Avaliação" : "Inactivo"}</span>
                {canEdit && kebab(`s${s.id}`, <><button className={mi} onClick={() => { setMenu(null); setForm(newSupplier(s)); }}>Editar</button><button className={`${mi} text-red-400`} onClick={() => del("suppliers", s.id, s.name)}>Eliminar</button></>)}
              </li>))}</ul>
          ))}
          {supTab === "compras" && (() => {
            const buys = costs.filter((c) => c.category === "compras").slice(0, 12);
            return buys.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem compras registadas.</p> : (
              <ul className="space-y-2">{buys.map((c) => <li key={c.id} className="flex items-center justify-between rounded-xl border border-line p-2.5 text-xs"><span><b className="text-[13px]">{c.description}</b><br /><span className="text-slate-400">{datePt(c.spent_on)}{c.supplier_id ? ` · ${supName.get(c.supplier_id) ?? ""}` : ""}</span></span><b>{kz(c.amount)}</b></li>)}</ul>
            );
          })()}
          {supTab === "avaliacao" && (
            <ul className="space-y-2">{suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border border-line p-2.5 text-xs">
                <span className="truncate text-[13px]">{s.name}</span>
                <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} disabled={!canEdit || pending} aria-label={`${n} estrelas`} onClick={() => { const fd = new FormData(); fd.set("id", s.id); fd.set("name", s.name); fd.set("rating", String(n)); run(saveSupplierBoard(fd), "Avaliação guardada."); }}
                    className={`text-lg leading-none ${(s.rating ?? 0) >= n ? "text-[#e0a122]" : "text-slate-600"}`}>★</button>))}</span>
              </li>))}</ul>
          )}
          {canEdit && supTab === "principais" && <button onClick={() => setForm(newSupplier())} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Plus className="size-3.5" />Novo fornecedor</button>}
        </section>

        {/* ───── Manutenção ───── */}
        <section ref={manRef} className={`${panel} scroll-mt-20`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><I.Wrench className="size-5 text-gold" />Manutenção</h2>
            <button onClick={() => setExpanded((e) => ({ ...e, man: !e.man }))} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-gold/50">{expanded.man ? "Menos" : "Ver Todos"}</button></div>
          <Tabs value={manTab} onChange={setManTab} tabs={[["ordens", "Ordens de Serviço"], ["equip", "Equipamentos"], ["plano", "Plano Preventivo"]]} />
          {manTab === "ordens" && (tickets.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem ordens de serviço.</p> : (
            <ul className="space-y-2">{(expanded.man ? tickets : tickets.slice(0, 5)).map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-slate-200"><I.Wrench className="size-5" /></span>
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">#{t.code}</div><div className="truncate text-[11px] text-slate-400">{t.title}</div></div>
                <span className={`rounded px-2 py-1 text-[11px] font-medium ${t.status === "aberto" ? "bg-[#e5484d] text-white" : t.status === "em_curso" ? "bg-[#1a63e0] text-white" : "bg-[#16a34a] text-white"}`}>{t.status === "aberto" ? "Pendente" : t.status === "em_curso" ? "Em Andamento" : "Concluída"}</span>
                <span className="hidden text-[10px] text-slate-500 sm:block">{datePt(t.opened_at)}</span>
                {canEdit && kebab(`t${t.id}`, <>{(["aberto", "em_curso", "concluido"] as const).filter((s) => s !== t.status).map((s) => <button key={s} className={mi} onClick={() => { setMenu(null); run(setTicketStatusBoard(t.id, s), "Estado atualizado."); }}>{s === "aberto" ? "Marcar pendente" : s === "em_curso" ? "Iniciar" : "Concluir"}</button>)}<button className={`${mi} text-red-400`} onClick={() => del("maintenance_tickets", t.id, t.code)}>Eliminar</button></>)}
              </li>))}</ul>
          ))}
          {manTab === "equip" && (equipment.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem equipamentos registados.</p> : (
            <ul className="space-y-2">{equipment.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: EQ[e.status].color }} />
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{e.name}</div><div className="truncate text-[11px] text-slate-400">{e.location ?? "—"} · {EQ[e.status].label}</div></div>
                {canEdit && kebab(`m${e.id}`, <>{(Object.keys(EQ) as EqStatus[]).filter((s) => s !== e.status).map((s) => <button key={s} className={mi} onClick={() => { setMenu(null); run(setEquipmentStatusBoard(e.id, s), `Estado: ${EQ[s].label}.`); }}>{EQ[s].label}</button>)}</>)}
              </li>))}</ul>
          ))}
          {manTab === "plano" && (
            <>
              {plans.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem tarefas preventivas.</p> : (
                <ul className="space-y-2">{plans.map((p) => { const days = Math.round((Date.parse(p.next_due) - Date.parse(today)) / 864e5); return (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                    <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{p.title}</div><div className="truncate text-[11px] text-slate-400">{p.equipment ?? "Geral"} · a cada {p.every_days} dias</div></div>
                    <span className={`text-[11px] ${days < 0 ? "text-red-400" : days <= 7 ? "text-amber-300" : "text-slate-400"}`}>{datePt(p.next_due)}{days < 0 ? ` (${-days} d em atraso)` : days === 0 ? " (hoje)" : ` (em ${days} d)`}</span>
                    {canEdit && <button disabled={pending} onClick={() => run(completePlanBoard(p.id), "Tarefa concluída; próxima data atualizada.")} className="rounded-lg border border-ok/50 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-ok/10">Concluir</button>}
                  </li>); })}</ul>
              )}
              {canEdit && <button onClick={() => setForm(newPlan)} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Plus className="size-3.5" />Novo plano</button>}
            </>
          )}
          {canEdit && manTab !== "plano" && <button onClick={() => setForm(newTicket())} className="mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Plus className="size-3.5" />Nova ordem</button>}
        </section>
      </div>

      {/* ───── Gráficos ───── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <section className={panel}>
          <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><I.Chart className="size-4 text-gold" />Custos Operacionais</h2>
            <select value={period} onChange={(e) => setPeriod(e.target.value as "mes" | "anterior")} aria-label="Período" className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs outline-none"><option value="mes">Este Mês</option><option value="anterior">Mês anterior</option></select></div>
          <div className="flex flex-wrap items-baseline gap-3"><span className="text-2xl font-semibold text-gold-soft">{kz(mTotal)}</span>{costDelta !== null && <span className={`text-sm ${costDelta <= 0 ? "text-emerald-400" : "text-red-400"}`}>{costDelta <= 0 ? "↓" : "↑"} {Math.abs(costDelta)}%</span>}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">{series.map((s) => <span key={s.k} className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>)}</div>
          <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="mt-2 h-32 w-full" aria-hidden>
            {[0, 25, 50, 75, 100].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />)}
            {series.map((s) => <polyline key={s.k} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" points={s.pts.map((v, i) => `${(i / Math.max(1, dim - 1)) * 300},${98 - (v / maxY) * 94}`).join(" ")} />)}
          </svg>
          <div className="flex justify-between text-[10px] text-slate-500"><span>01</span><span>{Math.round(dim / 2)}</span><span>{dim}</span></div>
        </section>
        <section className={panel}>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Distribuição de Custos</h2><span className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs">{period === "mes" ? "Este Mês" : "Mês anterior"}</span></div>
          <div className="flex items-center gap-3">
            <div className="relative size-[130px] shrink-0"><Donut parts={byCat.map((c) => ({ v: c.v, c: COST[c.k].color }))} />
              <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-lg font-semibold">{short(mTotal)}</div><div className="text-[10px] text-slate-400">Kz</div></div></div></div>
            <ul className="flex-1 space-y-2 text-xs">{byCat.map((c) => <li key={c.k} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: COST[c.k].color }} /><span className="flex-1 truncate text-slate-200">{COST[c.k].label}</span><b>{mTotal ? Math.round((c.v / mTotal) * 100) : 0}%</b></li>)}</ul>
          </div>
        </section>
        <section className={panel}>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Equipamentos por Estado</h2></div>
          <div className="flex items-center gap-3">
            <div className="relative size-[130px] shrink-0"><Donut parts={(Object.keys(EQ) as EqStatus[]).map((s) => ({ v: equipment.filter((e) => e.status === s).length, c: EQ[s].color }))} />
              <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-xl font-semibold">{equipment.length}</div><div className="text-[10px] text-slate-400">Equipamentos</div></div></div></div>
            <ul className="flex-1 space-y-2 text-xs">{(Object.keys(EQ) as EqStatus[]).map((s) => { const n = equipment.filter((e) => e.status === s).length; return (
              <li key={s} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: EQ[s].color }} /><span className="flex-1 truncate text-slate-200">{EQ[s].label}</span><b>{equipment.length ? Math.round((n / equipment.length) * 100) : 0}%</b></li>); })}</ul>
          </div>
        </section>
      </div>

      {/* ───── Ações rápidas ───── */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel/90 p-3">
        <h2 className="mr-2 flex items-center gap-2 px-2 font-medium"><I.Gear className="size-5 text-gold" />Ações Rápidas</h2>
        {actions.map((a) => (
          <button key={a.l} onClick={a.f} disabled={!canEdit && a.l !== "Relatório Operacional"}
            className={`flex h-11 items-center gap-2 rounded-xl px-4 text-sm transition disabled:opacity-40 ${a.gold ? "btn-gold font-semibold hover:brightness-105" : a.amber ? "border border-gold/40 bg-gold/10 text-gold-soft hover:bg-gold/20" : "border border-line bg-[#041019] hover:border-gold/50"}`}>
            <a.icon className="size-4" />{a.l}
          </button>
        ))}
      </section>

      {form && <FormModal spec={form} pending={pending} onClose={() => setForm(null)} onSubmit={(fd) => run(form.submit(fd), form.ok, () => setForm(null))} />}
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}

function FormModal({ spec, pending, onClose, onSubmit }: { spec: FormSpec; pending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={spec.title} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="w-full max-w-xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 className="font-serif text-3xl">{spec.title}</h2>{spec.subtitle && <p className="text-sm text-slate-400">{spec.subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button></div>
        {spec.hidden && Object.entries(spec.hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <div className="grid gap-4 sm:grid-cols-2">
          {spec.fields.map((f) => (
            <div key={f.name} className={f.span || f.type === "textarea" ? "sm:col-span-2" : ""}>
              <label className={lab}>{f.label}</label>
              {f.type === "select" ? (
                <select name={f.name} defaultValue={String(f.def ?? "")} required={f.required} className={fld}>{f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              ) : f.type === "textarea" ? (
                <textarea name={f.name} rows={2} defaultValue={String(f.def ?? "")} className={fld} />
              ) : (
                <input name={f.name} type={f.type ?? "text"} step={f.step} min={f.type === "number" ? 0 : undefined} required={f.required} defaultValue={f.def === undefined ? undefined : String(f.def)} className={`${fld} ${f.type === "date" ? "[color-scheme:dark]" : ""}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
