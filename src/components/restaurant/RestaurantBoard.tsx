"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RResVM, ResStatus, TableStatus, TableVM } from "@/lib/restaurantBoard";
import { deleteRestaurantReservation, deleteRestaurantTable, saveRestaurantReservation, saveRestaurantTable, setRestaurantReservationStatus, setRestaurantTableStatus, type ActionResult } from "@/app/actions";
import * as I from "@/components/icons";

const OPEN = "08:00 - 22:00", KITCHEN = "08:00 - 21:30", TURNS = 3;
const TSTAT: Record<TableStatus, { label: string; bg: string; border: string; dot: string }> = {
  livre: { label: "Livre", bg: "#0e6e3f", border: "#22a35a", dot: "#22a35a" },
  ocupada: { label: "Ocupada", bg: "#a8242a", border: "#e5484d", dot: "#e5484d" },
  reservada: { label: "Reservada", bg: "#8a6410", border: "#e0a122", dot: "#e0a122" },
  preparar: { label: "A preparar", bg: "#1a56c4", border: "#3b82f6", dot: "#3b82f6" },
  bloqueada: { label: "Bloqueada", bg: "#3d4656", border: "#6b7280", dot: "#6b7280" },
};
const RSTAT: Record<ResStatus, { label: string; solid: string }> = {
  confirmada: { label: "Confirmada", solid: "bg-[#16a34a] text-white" },
  a_chegar: { label: "A chegar", solid: "bg-[#f0a91c] text-[#1a1305]" },
  em_curso: { label: "Em curso", solid: "bg-[#1a63e0] text-white" },
  aguardar: { label: "A aguardar", solid: "bg-[#6b7a90] text-white" },
  concluida: { label: "Concluída", solid: "bg-[#0f8a8a] text-white" },
  cancelada: { label: "Cancelada", solid: "bg-[#8a2a2f] text-white" },
};
const TABS = [
  { key: "todas", label: "Todas", test: () => true },
  { key: "confirmadas", label: "Confirmadas", test: (r: RResVM) => r.status === "confirmada" || r.status === "a_chegar" },
  { key: "aguardar", label: "A aguardar", test: (r: RResVM) => r.status === "aguardar" },
  { key: "concluidas", label: "Concluídas", test: (r: RResVM) => r.status === "concluida" },
  { key: "canceladas", label: "Canceladas", test: (r: RResVM) => r.status === "cancelada" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const loc = (iso: string) => new Date(Date.parse(iso) + 3600e3);
const dstr = (iso: string) => loc(iso).toISOString().slice(0, 10);
const hm = (iso: string) => loc(iso).toISOString().slice(11, 16);
const dmy = (s: string) => s.split("-").reverse().join("/");
const addDays = (s: string, n: number) => new Date(Date.parse(s + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const field = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";
const ACTIVE: ResStatus[] = ["confirmada", "aguardar", "a_chegar", "em_curso"];
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
  return <div className="flex h-8 items-end gap-[2px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}</div>;
}

export default function RestaurantBoard({ tables, reservations: all, canEdit, today }: { tables: TableVM[]; reservations: RResVM[]; canEdit: boolean; today: string }) {
  const [area, setArea] = useState(tables[0]?.area ?? "Área Principal");
  const [full, setFull] = useState(false);
  const [tab, setTab] = useState<TabKey>("todas");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(addDays(`${today.slice(0, 7)}-01`.replace(/-\d\d$/, "-28"), 4).slice(0, 7) === today.slice(0, 7) ? addDays(`${today.slice(0, 7)}-28`, 4) : `${today.slice(0, 7)}-28`);
  const [state, setState] = useState("todos");
  const [more, setMore] = useState(false);
  const [minParty, setMinParty] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [tableMenu, setTableMenu] = useState<string | null>(null);
  const [resForm, setResForm] = useState<null | { res?: RResVM; table?: string; walkin?: boolean }>(null);
  const [tableForm, setTableForm] = useState<null | { table?: TableVM }>(null);
  const [avail, setAvail] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLElement>(null);
  const allRef = useRef<HTMLElement>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) { setMenu(null); setTableMenu(null); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const run = (p: Promise<ActionResult>, ok: string, then?: () => void) =>
    start(async () => {
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });

  const areas = [...new Set(tables.map((t) => t.area))];
  const areaTables = tables.filter((t) => t.area === (areas.includes(area) ? area : areas[0]));
  const count = (s: TableStatus) => areaTables.filter((t) => t.status === s).length;

  const onDay = (d: string) => all.filter((r) => dstr(r.starts_at) === d && r.status !== "cancelada");
  const occPct = (d: string) => Math.min(100, Math.round((onDay(d).length / Math.max(1, tables.length * TURNS)) * 100));
  const guests = (d: string) => all.filter((r) => dstr(r.starts_at) === d && ACTIVE.includes(r.status)).reduce((s, r) => s + r.party_size, 0);
  const yest = addDays(today, -1), lastWeek = addDays(today, -7);
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const todayRes = all.filter((r) => dstr(r.starts_at) === today && r.status !== "cancelada");
  const busyTables = tables.filter((t) => t.status !== "livre").length;
  const series = (f: (d: string) => number) => Array.from({ length: 14 }, (_, i) => f(addDays(today, i - 13)));
  const kpis = [
    { big: String(todayRes.length), t: "Reservas Hoje", icon: I.Calendar, c: "from-[#16a34a] to-[#0d5c2b]", d: pct(todayRes.length, onDay(yest).length), note: "vs. ontem", bars: series((d) => onDay(d).length), col: "#22a35a" },
    { big: `${busyTables} / ${tables.length}`, t: "Mesas Ocupadas", icon: I.Utensils, c: "from-[#b8862b] to-[#6a4a12]", d: null, note: `${tables.length ? Math.round((busyTables / tables.length) * 100) : 0}% de ocupação`, bars: series((d) => Math.min(tables.length, onDay(d).length)), col: "#e0a122" },
    { big: String(guests(today)), t: "Clientes Esperados", icon: I.Users, c: "from-[#1a63e0] to-[#0f3a8a]", d: pct(guests(today), guests(yest)), note: "vs. ontem", bars: series(guests), col: "#3b82f6" },
  ];
  const taxa = occPct(today), taxaPrev = occPct(lastWeek);

  // Reservas de hoje (ordem horária)
  const todayList = [...all.filter((r) => dstr(r.starts_at) === today)].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  // Ocupação desta semana
  const mon = (() => { const d = new Date(today + "T00:00:00Z"); return addDays(today, -((d.getUTCDay() + 6) % 7)); })();
  const week = WD.map((w, i) => ({ w, p: occPct(addDays(mon, i)) }));
  // Horários mais movimentados (hoje, janelas de 2 h)
  const slots = Array.from({ length: 7 }, (_, i) => 8 + i * 2).map((h) => ({
    h, n: todayRes.filter((r) => { const x = Number(hm(r.starts_at).slice(0, 2)); return x >= h && x < h + 2; }).length,
  })).filter((s) => s.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);

  // Lista de reservas
  const q = norm(query.trim());
  const period = useMemo(() => all.filter((r) => dstr(r.starts_at) >= from && dstr(r.starts_at) <= to), [all, from, to]);
  const countTab = (k: TabKey) => period.filter(TABS.find((t) => t.key === k)!.test).length;
  const filtered = useMemo(() => {
    const test = TABS.find((t) => t.key === tab)!.test;
    return period.filter((r) => test(r) && (state === "todos" || r.status === state) && (!minParty || r.party_size >= Number(minParty)) &&
      (!q || [r.client, r.phone, r.table_code].some((v) => v && norm(v).includes(q)))).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }, [period, tab, state, minParty, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * pageSize, cur * pageSize);

  const exportCsv = () => {
    const list = checked.size ? filtered.filter((r) => checked.has(r.id)) : filtered;
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const lines = list.map((r) => [r.client, dstr(r.starts_at), hm(r.starts_at), r.party_size, r.table_code, r.phone, RSTAT[r.status].label].map(esc).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [["Cliente", "Data", "Hora", "Pessoas", "Mesa", "Contacto", "Estado"].map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "reservas-restaurante.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  const stateButtons = (r: RResVM) => (Object.keys(RSTAT) as ResStatus[]).filter((s) => s !== r.status).map((s) => (
    <button key={s} disabled={pending} onClick={() => { setMenu(null); run(setRestaurantReservationStatus(r.id, s), `Reserva: ${RSTAT[s].label}.`); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Marcar como {RSTAT[s].label.toLowerCase()}</button>
  ));
  const pill = (s: ResStatus) => <span className={`inline-block min-w-[5.4rem] rounded px-2 py-1.5 text-center text-xs font-medium ${RSTAT[s].solid}`}>{RSTAT[s].label}</span>;

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-rest.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl leading-none md:text-6xl">Restaurante</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Gestão de reservas, mesas e operação do Business Center Esperança.</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-300">
              <span className="flex items-center gap-2"><I.Pin className="size-4 text-slate-200" /><span><b className="block text-slate-100">Business Center Esperança</b>Namibe, Angola</span></span>
              <span className="flex items-center gap-2 border-l border-white/15 pl-6"><I.Clock className="size-4 text-slate-200" /><span><b className="block text-slate-100">Horário de Funcionamento</b>{OPEN}</span></span>
              <span className="flex items-center gap-2 border-l border-white/15 pl-6"><I.Utensils className="size-4 text-slate-200" /><span><b className="block text-slate-100">Cozinha</b>{KITCHEN}</span></span>
            </div>
          </div>
          {canEdit && <button onClick={() => setResForm({})} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Nova Reserva</button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3.5 backdrop-blur">
              <span className={`grid size-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-6" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-semibold leading-none">{k.big}</div>
                <div className="mt-1 truncate text-xs text-slate-200">{k.t}</div>
                <div className="mb-1 h-4 text-[11px]">{k.d !== null ? <><span className={k.d >= 0 ? "text-emerald-400" : "text-red-400"}>{k.d >= 0 ? "↑" : "↓"} {Math.abs(k.d)}%</span> <span className="text-slate-400">{k.note}</span></> : <span className="text-amber-300">{k.note}</span>}</div>
                <Bars values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#07121b]/85 p-3.5 backdrop-blur">
            <div className="grid size-14 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#22c9a6 ${taxa}%, #1b2740 0)` }}><div className="size-10 rounded-full bg-[#07121b]" /></div>
            <div><div className="text-2xl font-semibold leading-none">{taxa}%</div><div className="mt-1 text-xs text-slate-200">Taxa de Ocupação</div>
              {pct(taxa, taxaPrev) !== null && <div className="mt-1 text-[11px]"><span className={(pct(taxa, taxaPrev) as number) >= 0 ? "text-emerald-400" : "text-red-400"}>{(pct(taxa, taxaPrev) as number) >= 0 ? "↑" : "↓"} {Math.abs(pct(taxa, taxaPrev) as number)}%</span> <span className="text-slate-400">vs. semana passada</span></div>}</div>
          </div>
        </div>
      </section>

      {tables.length === 0 && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-amber-100">Ainda não há mesas registadas. {canEdit ? "Use “Nova Mesa” no mapa para criar a primeira." : "Peça a um administrador para configurar as mesas."}</p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]" ref={boxRef}>
        <div className="min-w-0 space-y-4">
          {/* ───── Mapa de mesas ───── */}
          <section className={`rounded-2xl border border-line bg-panel/90 p-3 ${full ? "fixed inset-3 z-50 overflow-auto bg-[#020b13]" : ""}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="flex items-center gap-2 font-medium"><I.MapIcon className="size-5 text-gold" />Mapa de Mesas - Restaurante</h2>
              <div className="flex items-center gap-2">
                {canEdit && <button onClick={() => setTableForm({})} className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Plus className="size-3.5" />Nova Mesa</button>}
                <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área" className="h-9 rounded-lg border border-line bg-panel2 px-3 text-xs outline-none focus:border-gold">
                  {(areas.length ? areas : ["Área Principal"]).map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button onClick={() => setFull(!full)} aria-label={full ? "Sair do ecrã inteiro" : "Ecrã inteiro"} className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.MapIcon className="size-4" /></button>
              </div>
            </div>
            <div className="relative aspect-[785/265] w-full overflow-hidden rounded-xl border border-line">
              <Image src="/restaurant-map.jpg" alt="Planta do restaurante" fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" />
              {areaTables.map((t) => {
                const s = TSTAT[t.status];
                return (
                  <div key={t.id} className="absolute" style={{ left: `${t.x}%`, top: `${t.y}%`, transform: "translate(-50%,-50%)" }}>
                    <button onClick={() => setTableMenu(tableMenu === t.id ? null : t.id)} className="block min-w-[4.6rem] rounded-md border px-2 py-1 text-center leading-tight text-white shadow-lg transition hover:scale-105" style={{ background: s.bg, borderColor: s.border }}>
                      <span className="block text-[11px] font-semibold">{t.code}</span><span className="block text-[10px] opacity-90">{s.label}</span>
                    </button>
                    {tableMenu === t.id && (
                      <div className="absolute left-1/2 top-full z-30 mt-1 w-52 -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
                        <div className="border-b border-line px-4 py-2 text-xs text-slate-400">{t.code} · {t.capacity} lugares</div>
                        {canEdit && (Object.keys(TSTAT) as TableStatus[]).filter((x) => x !== t.status).map((x) => (
                          <button key={x} disabled={pending} onClick={() => { setTableMenu(null); run(setRestaurantTableStatus(t.id, x), `${t.code}: ${TSTAT[x].label}.`); }} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-white/5"><i className="size-2 rounded-full" style={{ background: TSTAT[x].dot }} />{TSTAT[x].label}</button>
                        ))}
                        {canEdit && <button onClick={() => { setTableMenu(null); setResForm({ table: t.id }); }} className="block w-full border-t border-line px-4 py-2 text-left hover:bg-white/5">Nova reserva nesta mesa</button>}
                        {canEdit && <button onClick={() => { setTableMenu(null); setTableForm({ table: t }); }} className="block w-full px-4 py-2 text-left hover:bg-white/5">Editar mesa</button>}
                        {canEdit && <button onClick={() => { setTableMenu(null); if (confirm(`Eliminar ${t.code}?`)) run(deleteRestaurantTable(t.id), "Mesa eliminada."); }} className="block w-full px-4 py-2 text-left text-red-400 hover:bg-white/5">Eliminar mesa</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 px-1 text-xs text-slate-200">
              {(["livre", "reservada", "ocupada", "preparar"] as TableStatus[]).map((s) => <li key={s} className="flex items-center gap-2"><i className="size-3 rounded-full" style={{ background: TSTAT[s].dot }} />{TSTAT[s].label} ({count(s)})</li>)}
              {count("bloqueada") > 0 && <li className="flex items-center gap-2"><i className="size-3 rounded-full bg-slate-500" />Bloqueada ({count("bloqueada")})</li>}
            </ul>
          </section>

          {/* ───── Todas as reservas ───── */}
          <section ref={allRef} className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-3 font-serif text-2xl">Todas as Reservas</h2>
              {TABS.map((t) => (
                <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
                  className={`rounded-lg border px-4 py-2 text-xs transition-colors ${tab === t.key ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel2/60 text-slate-100 hover:border-gold/40"}`}>
                  {t.label} ({countTab(t.key)})
                </button>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <I.Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
                <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Pesquisar cliente, contacto, mesa…" className="h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-gold" />
              </div>
              <label className="flex h-10 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs"><I.Calendar className="size-4 text-slate-300" />
                <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="De" className="bg-transparent outline-none [color-scheme:dark]" /><span className="text-slate-500">—</span>
                <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Até" className="bg-transparent outline-none [color-scheme:dark]" /></label>
              <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} aria-label="Estado" className="h-10 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
                <option value="todos">Todos os estados</option>{(Object.keys(RSTAT) as ResStatus[]).map((s) => <option key={s} value={s}>{RSTAT[s].label}</option>)}
              </select>
              <button onClick={() => setMore(!more)} className={`flex h-10 items-center gap-2 rounded-lg border px-4 text-sm ${more ? "border-gold bg-gold/10 text-gold-soft" : "border-line hover:border-gold/40"}`}><I.Filter className="size-4" />Mais filtros</button>
              <button onClick={exportCsv} className="flex h-10 items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 px-3 text-sm text-gold-soft hover:bg-gold/20"><I.Download className="size-4" />Exportar</button>
            </div>
            {more && (
              <div className="mb-3 flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-3">
                <label className="text-xs text-slate-400">Mínimo de pessoas<input type="number" min="1" value={minParty} onChange={(e) => { setMinParty(e.target.value); setPage(1); }} className="mt-1 block h-9 w-32 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
                <button onClick={() => { setQuery(""); setState("todos"); setMinParty(""); setTab("todas"); setPage(1); }} className="h-9 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar</button>
              </div>
            )}
            {rows.length === 0 ? <p className="py-12 text-center text-sm text-muted">{all.length === 0 ? "Ainda não há reservas." : "Nenhuma reserva corresponde aos filtros."}</p> : (
              <div className="overflow-x-auto">
                <table className="min-w-[760px]">
                  <thead className="bg-white/[0.04]"><tr>
                    <th className="w-10 pl-3 pt-3"><input type="checkbox" aria-label="Selecionar todas" checked={rows.length > 0 && rows.every((r) => checked.has(r.id))} onChange={(e) => setChecked((s) => { const n = new Set(s); rows.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} className="accent-[#d6b06a]" /></th>
                    <th className="pt-3">Cliente</th><th className="pt-3">Data / Hora</th><th className="pt-3">Pessoas</th><th className="pt-3">Mesa</th><th className="pt-3">Contacto</th><th className="pt-3">Estado</th><th className="pt-3">Ações</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-line/70">
                        <td className="pl-3"><input type="checkbox" aria-label="Selecionar" checked={checked.has(r.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} className="accent-[#d6b06a]" /></td>
                        <td className="text-[13px] font-medium">{r.client}</td>
                        <td className="whitespace-nowrap text-[13px]">{dmy(dstr(r.starts_at))} {hm(r.starts_at)}</td>
                        <td className="text-[13px]">{r.party_size}</td>
                        <td className="whitespace-nowrap text-[13px]">{r.table_code ? r.table_code.replace("Mesa ", "") : "—"}</td>
                        <td className="whitespace-nowrap text-[13px] text-slate-300">{r.phone ?? "—"}</td>
                        <td>{pill(r.status)}</td>
                        <td>
                          <div className="relative flex items-center gap-1.5">
                            <button onClick={() => setResForm({ res: r })} aria-label="Ver detalhe" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Eye className="size-4" /></button>
                            {canEdit && <button onClick={() => setResForm({ res: r })} aria-label="Editar" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Pencil className="size-4" /></button>}
                            {canEdit && <button onClick={() => setMenu(menu === `a${r.id}` ? null : `a${r.id}`)} aria-label="Mais ações" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>}
                            {menu === `a${r.id}` && <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">{stateButtons(r)}
                              <button onClick={() => { setMenu(null); if (confirm("Eliminar esta reserva?")) run(deleteRestaurantReservation(r.id), "Reserva eliminada."); }} className="block w-full px-4 py-2.5 text-left text-red-400 hover:bg-white/5">Eliminar</button></div>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
              <span>A mostrar {filtered.length ? (cur - 1) * pageSize + 1 : 0} a {Math.min(cur * pageSize, filtered.length)} de {filtered.length} reservas</span>
              <div className="flex items-center gap-1.5">
                <button disabled={cur === 1} onClick={() => setPage(cur - 1)} aria-label="Anterior" className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-40 hover:border-gold/50"><I.ChevL className="size-4" /></button>
                {pagesFor(pages, cur).map((p, i) => p === "…" ? <span key={`e${i}`} className="px-1">…</span> : (
                  <button key={p} onClick={() => setPage(p)} className={`grid size-8 place-items-center rounded-lg border text-sm ${p === cur ? "border-gold bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line hover:border-gold/50"}`}>{p}</button>
                ))}
                <button disabled={cur === pages} onClick={() => setPage(cur + 1)} aria-label="Seguinte" className="grid size-8 place-items-center rounded-lg border border-line disabled:opacity-40 hover:border-gold/50"><I.ChevR className="size-4" /></button>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} aria-label="Por página" className="ml-2 h-8 rounded-lg border border-line bg-panel px-2 text-sm outline-none">{[10, 20, 50].map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
              </div>
            </div>
          </section>
        </div>

        {/* ───── Coluna lateral ───── */}
        <div className="space-y-4">
          <section ref={todayRef} className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-serif text-xl">Reservas de Hoje</h2>
              <button onClick={() => allRef.current?.scrollIntoView({ behavior: "smooth" })} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-gold/50">Ver todas</button></div>
            {todayList.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem reservas para hoje.</p> : (
              <table>
                <thead><tr><th className="pt-1">Hora</th><th>Cliente</th><th>Pessoas</th><th>Mesa</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {todayList.map((r) => (
                    <tr key={r.id} className="border-t border-line/70">
                      <td className="text-[12px]">{hm(r.starts_at)}</td><td className="max-w-[7rem] truncate text-[12px]">{r.client}</td>
                      <td className="text-center text-[12px]">{r.party_size}</td><td className="text-center text-[12px]">{r.table_code ? r.table_code.replace("Mesa ", "") : "—"}</td>
                      <td>{pill(r.status)}</td>
                      <td className="relative">{canEdit && <button onClick={() => setMenu(menu === `t${r.id}` ? null : `t${r.id}`)} aria-label="Mais ações" className="grid size-7 place-items-center rounded-md hover:bg-white/10"><I.Dots className="size-4" /></button>}
                        {menu === `t${r.id}` && <div className="absolute right-0 top-8 z-30 w-48 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">{stateButtons(r)}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><I.Chart className="size-4 text-gold" />Ocupação do Restaurante</h2><span className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-[11px]">Esta Semana</span></div>
            <div className="flex h-36 items-end gap-3">
              {week.map((d) => (
                <div key={d.w} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-slate-300">{d.p}%</span>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-[#8a6a2a] to-[#e6c98a]" style={{ height: `${Math.max(4, d.p * 0.75)}%` }} />
                  <span className="text-[10px] text-slate-400">{d.w}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><I.Clock className="size-4 text-gold" />Horários Mais Movimentados</h2><span className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-[11px]">Hoje</span></div>
            {slots.length === 0 ? <p className="py-4 text-center text-xs text-muted">Sem reservas hoje.</p> : (
              <ul className="space-y-3">{slots.map((s, i) => { const p = Math.min(100, Math.round((s.n / Math.max(1, tables.length)) * 100)); return (
                <li key={s.h} className="flex items-center gap-3 text-xs">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-gold/50 text-[11px] text-gold">{i + 1}</span>
                  <span className="w-24 shrink-0 text-slate-200">{String(s.h).padStart(2, "0")}:00 - {String(s.h + 2).padStart(2, "0")}:00</span>
                  <span className="h-2.5 flex-1 rounded-full bg-white/10"><i className="block h-2.5 rounded-full bg-gradient-to-r from-[#8a6a2a] to-[#e6c98a]" style={{ width: `${Math.max(p, 4)}%` }} /></span>
                  <b className="w-9 text-right">{p}%</b><span className="w-16 text-right text-slate-400">{s.n} reserva{s.n === 1 ? "" : "s"}</span>
                </li>); })}</ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><I.Alert className="size-4 text-gold" />Ações Rápidas</h2>
            <div className="grid grid-cols-3 gap-2">
              <button disabled={!canEdit} onClick={() => setBlockOpen(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-2 text-center text-[11px] text-gold-soft hover:bg-gold/20 disabled:opacity-50"><I.Shield className="size-4 shrink-0" />Bloquear Mesa</button>
              <button onClick={() => setAvail(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-2 text-center text-[11px] text-gold-soft hover:bg-gold/20"><I.Search className="size-4 shrink-0" />Ver Disponibilidade</button>
              <button disabled={!canEdit} onClick={() => setResForm({ walkin: true })} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] px-2 text-center text-[11px] hover:border-gold/50 disabled:opacity-50"><I.Users className="size-4 shrink-0" />Registar Cliente</button>
            </div>
          </section>
        </div>
      </div>

      {resForm && <ReservationModal init={resForm} tables={tables} today={today} pending={pending} reservations={all} canEdit={canEdit} onClose={() => setResForm(null)}
        onSubmit={(fd) => run(saveRestaurantReservation(fd), resForm.res ? "Reserva atualizada." : resForm.walkin ? "Cliente registado." : "Reserva criada.", () => setResForm(null))} />}
      {tableForm && <TableModal init={tableForm.table} areas={areas} pending={pending} onClose={() => setTableForm(null)}
        onSubmit={(fd) => run(saveRestaurantTable(fd), "Mesa guardada.", () => setTableForm(null))} />}
      {avail && <AvailabilityModal tables={tables} reservations={all} today={today} onClose={() => setAvail(false)} />}
      {blockOpen && (
        <Modal title="Bloquear mesa" subtitle="Uma mesa bloqueada deixa de aceitar reservas até ser libertada." onClose={() => setBlockOpen(false)}>
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {tables.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-line p-3 text-sm">
                <span><b>{t.code}</b> <span className="text-xs text-slate-400">· {TSTAT[t.status].label}</span></span>
                <button disabled={pending} onClick={() => run(setRestaurantTableStatus(t.id, t.status === "bloqueada" ? "livre" : "bloqueada"), t.status === "bloqueada" ? "Mesa libertada." : "Mesa bloqueada.")} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-gold/50">{t.status === "bloqueada" ? "Libertar" : "Bloquear"}</button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[55] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 className="font-serif text-3xl">{title}</h2>{subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function ReservationModal({ init, tables, today, pending, reservations, canEdit, onClose, onSubmit }: {
  init: { res?: RResVM; table?: string; walkin?: boolean }; tables: TableVM[]; today: string; pending: boolean; reservations: RResVM[]; canEdit: boolean; onClose: () => void; onSubmit: (fd: FormData) => void;
}) {
  const r = init.res;
  const [nowH] = useState(() => new Date(Date.now() + 3600e3).toISOString().slice(11, 16));
  const when = r ? `${dstr(r.starts_at)}T${hm(r.starts_at)}` : init.walkin ? `${today}T${nowH}` : `${today}T19:00`;
  const free = tables.filter((t) => t.status !== "bloqueada");
  const taken = (id: string) => reservations.some((x) => x.table_id === id && dstr(x.starts_at) === when.slice(0, 10) && ACTIVE.includes(x.status) && x.id !== r?.id);
  return (
    <Modal title={r ? "Reserva" : init.walkin ? "Registar cliente" : "Nova reserva"} subtitle={init.walkin ? "Cliente sem reserva: fica logo em atendimento." : "Mesa e horário são validados contra conflitos."} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (r) fd.set("id", r.id); onSubmit(fd); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={lab}>Cliente *</label><input name="client" required defaultValue={r?.client} disabled={!canEdit} className={field} /></div>
          <div><label className={lab}>Contacto</label><input name="phone" defaultValue={r?.phone ?? ""} disabled={!canEdit} className={field} /></div>
          <div><label className={lab}>Pessoas *</label><input name="party_size" type="number" min="1" required defaultValue={r?.party_size ?? 2} disabled={!canEdit} className={field} /></div>
          <div><label className={lab}>Data e hora *</label><input name="starts_at" type="datetime-local" required defaultValue={when} disabled={!canEdit} className={`${field} [color-scheme:dark]`} /></div>
          <div><label className={lab}>Duração (min)</label><input name="duration_min" type="number" min="15" step="15" defaultValue={r?.duration_min ?? 120} disabled={!canEdit} className={field} /></div>
          <div><label className={lab}>Mesa</label>
            <select name="table_id" defaultValue={r?.table_id ?? init.table ?? ""} disabled={!canEdit} className={field}><option value="">Sem mesa atribuída</option>
              {free.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.capacity} lugares{taken(t.id) ? " (com reservas nesse dia)" : ""}</option>)}</select></div>
          <div><label className={lab}>Estado</label>
            <select name="status" defaultValue={r?.status ?? (init.walkin ? "em_curso" : "confirmada")} disabled={!canEdit} className={field}>{(Object.keys(RSTAT) as ResStatus[]).map((s) => <option key={s} value={s}>{RSTAT[s].label}</option>)}</select></div>
          <div className="sm:col-span-2"><label className={lab}>Notas</label><textarea name="notes" rows={2} defaultValue={r?.notes ?? ""} disabled={!canEdit} className={field} /></div>
        </div>
        {canEdit && <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar"}</button>
        </div>}
      </form>
    </Modal>
  );
}

function TableModal({ init, areas, pending, onClose, onSubmit }: { init?: TableVM; areas: string[]; pending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void }) {
  return (
    <Modal title={init ? `Editar ${init.code}` : "Nova mesa"} subtitle="A posição é uma percentagem da planta (0–100)." onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (init) fd.set("id", init.id); onSubmit(fd); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={lab}>Código *</label><input name="code" required defaultValue={init?.code} placeholder="Mesa 13" className={field} /></div>
          <div><label className={lab}>Capacidade *</label><input name="capacity" type="number" min="1" required defaultValue={init?.capacity ?? 4} className={field} /></div>
          <div><label className={lab}>Área</label><input name="area" list="areas" defaultValue={init?.area ?? areas[0] ?? "Área Principal"} className={field} /><datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lab}>Posição X (%)</label><input name="pos_x" type="number" min="0" max="100" step="0.5" defaultValue={init?.x ?? 50} className={field} /></div>
            <div><label className={lab}>Posição Y (%)</label><input name="pos_y" type="number" min="0" max="100" step="0.5" defaultValue={init?.y ?? 50} className={field} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">Guardar mesa</button>
        </div>
      </form>
    </Modal>
  );
}

function AvailabilityModal({ tables, reservations, today, onClose }: { tables: TableVM[]; reservations: RResVM[]; today: string; onClose: () => void }) {
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("20:00");
  const [people, setPeople] = useState(2);
  const start = Date.parse(`${date}T${time}:00+01:00`);
  const free = tables.filter((t) => t.status !== "bloqueada" && t.capacity >= people &&
    !reservations.some((r) => r.table_id === t.id && ACTIVE.includes(r.status) && Date.parse(r.starts_at) < start + 120 * 60000 && Date.parse(r.starts_at) + r.duration_min * 60000 > start));
  return (
    <Modal title="Disponibilidade" subtitle="Mesas livres para a data, hora e número de pessoas." onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={lab}>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} [color-scheme:dark]`} /></div>
        <div><label className={lab}>Hora</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} [color-scheme:dark]`} /></div>
        <div><label className={lab}>Pessoas</label><input type="number" min="1" value={people} onChange={(e) => setPeople(Math.max(1, Number(e.target.value)))} className={field} /></div>
      </div>
      {free.length === 0 ? <p className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-red-200">Sem mesas livres para este horário.</p> : (
        <ul className="flex flex-wrap gap-2">{free.map((t) => <li key={t.id} className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 ring-1 ring-inset ring-emerald-400/25">{t.code} · {t.capacity} lugares</li>)}</ul>
      )}
      <Link href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="text-xs text-slate-400 hover:text-white">Fechar</Link>
    </Modal>
  );
}
