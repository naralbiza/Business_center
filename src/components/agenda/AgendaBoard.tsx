"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { ResVM } from "@/lib/agendaBoard";
import { createReservationBoard, type ActionResult } from "@/app/actions";
import { kz } from "@/lib/format";
import * as I from "@/components/icons";

type Kind = "casamento" | "corporativo" | "reuniao" | "aniversario" | "formatura" | "governo" | "outro";
const KIND: Record<Kind, { label: string; plural: string; bg: string; border: string; dot: string }> = {
  casamento: { label: "Casamento", plural: "Casamentos", bg: "linear-gradient(160deg,#0f6b46,#0a4a31)", border: "#1fa56a", dot: "#22a35a" },
  corporativo: { label: "Corporativo", plural: "Corporativos", bg: "linear-gradient(160deg,#10408f,#0b2d68)", border: "#3b82f6", dot: "#3b82f6" },
  reuniao: { label: "Reunião", plural: "Reuniões", bg: "linear-gradient(160deg,#124a8c,#0c3563)", border: "#4aa3ff", dot: "#4aa3ff" },
  aniversario: { label: "Aniversário", plural: "Aniversários", bg: "linear-gradient(160deg,#7a5413,#533a0c)", border: "#d99a1f", dot: "#e0a122" },
  formatura: { label: "Formatura / Festa", plural: "Formaturas", bg: "linear-gradient(160deg,#5a2fb0,#3d1f80)", border: "#8b5cf6", dot: "#8b5cf6" },
  governo: { label: "Governo", plural: "Governo", bg: "linear-gradient(160deg,#8a1f27,#5e1219)", border: "#e5484d", dot: "#e5484d" },
  outro: { label: "Outro", plural: "Outros", bg: "linear-gradient(160deg,#245a62,#17393f)", border: "#22c1c3", dot: "#22c1c3" },
};
const kindOf = (title: string): Kind => {
  const s = title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return s.includes("casam") ? "casamento" : /reuni|visita|planeamento/.test(s) ? "reuniao" : s.includes("anivers") ? "aniversario" : /formatura|festa|infantil|jantar/.test(s) ? "formatura" : /govern|minist|provinc|privado/.test(s) ? "governo" : /corpor|confer|empres|workshop|lancam|evento/.test(s) ? "corporativo" : "outro";
};

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MON3 = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const H0 = 8, H1 = 22, ROW = 56; // grelha 08:00–22:00
const field = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";

// Hora local de Luanda (UTC+1, sem horário de verão)
const loc = (iso: string) => new Date(Date.parse(iso) + 3600e3);
const dstr = (d: Date) => d.toISOString().slice(0, 10);
const hours = (iso: string) => { const d = loc(iso); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const hm = (iso: string) => { const d = loc(iso); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const addDays = (s: string, n: number) => dstr(new Date(Date.parse(s + "T00:00:00Z") + n * 864e5));
const monday = (s: string) => { const d = new Date(s + "T00:00:00Z"); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
const dayNum = (s: string) => Number(s.slice(8));
const ym = (s: string) => s.slice(0, 7);

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-7 items-end gap-[2px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.35 + (i / values.length) * 0.65 }} />)}</div>;
}

type Lane = { r: ResVM; lane: number; lanes: number };
function layout(list: ResVM[]): Lane[] {
  const sorted = [...list].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const out: Lane[] = [];
  let group: { r: ResVM; end: number; lane: number }[] = [];
  const flush = () => { const lanes = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => out.push({ r: g.r, lane: g.lane, lanes })); group = []; };
  for (const r of sorted) {
    const s = Date.parse(r.starts_at), e = Date.parse(r.ends_at);
    if (group.length && s >= Math.max(...group.map((g) => g.end))) flush();
    const used = new Set(group.filter((g) => g.end > s).map((g) => g.lane));
    let lane = 0; while (used.has(lane)) lane++;
    group.push({ r, end: e, lane });
  }
  flush();
  return out;
}

export default function AgendaBoard({ reservations: all, venues, companies, lead, canEdit, today, openDate, openNew }: {
  reservations: ResVM[]; venues: { id: string; name: string; capacity: number | null }[]; companies: { id: string; name: string }[];
  lead: { id: string; name: string; event_type: string; guests: number | null; budget: number | null } | null; canEdit: boolean; today: string; openDate: string | null; openNew: boolean;
}) {
  const [view, setView] = useState<"mes" | "semana" | "dia" | "lista">("semana");
  const [anchor, setAnchor] = useState(openDate ?? today);
  const [venueF, setVenueF] = useState("todos");
  const [statusF, setStatusF] = useState("todos");
  const [filters, setFilters] = useState(false);
  const [mini, setMini] = useState(ym(openDate ?? today));
  const [form, setForm] = useState<null | { date: string; start: string; block?: boolean }>(openNew || lead ? { date: openDate ?? today, start: "18:00" } : null);
  const [avail, setAvail] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  const run = (p: Promise<ActionResult>, ok: string, then?: () => void) =>
    start(async () => {
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });

  const active = useMemo(() => all.filter((r) => r.status !== "cancelada"), [all]);
  const visible = useMemo(() => all.filter((r) =>
    (venueF === "todos" || r.venue_id === venueF) && (statusF === "todos" || r.status === statusF) && (statusF === "cancelada" || r.status !== "cancelada" || statusF === "todos" && false)), [all, venueF, statusF]);
  const onDay = (day: string) => visible.filter((r) => dstr(loc(r.starts_at)) <= day && dstr(loc(r.ends_at)) >= day && !(dstr(loc(r.ends_at)) === day && hours(r.ends_at) === 0 && dstr(loc(r.starts_at)) < day));

  // Indicadores do mês de referência
  const month = ym(anchor);
  const inMonth = (r: ResVM, m: string) => ym(dstr(loc(r.starts_at))) === m;
  const prevMonth = ym(addDays(`${month}-01`, -1));
  const mAll = all.filter((r) => inMonth(r, month)), pAll = all.filter((r) => inMonth(r, prevMonth));
  const mAct = mAll.filter((r) => r.status !== "cancelada"), pAct = pAll.filter((r) => r.status !== "cancelada");
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const perDay = (list: ResVM[]) => { const a = Array.from({ length: days }, () => 0); list.forEach((r) => { a[dayNum(dstr(loc(r.starts_at))) - 1]++; }); return a; };
  const hoursBooked = (list: ResVM[]) => list.reduce((s, r) => s + Math.max(0, Math.min(H1, hours(r.ends_at) || 24) - Math.max(H0, hours(r.starts_at))), 0);
  const capHours = Math.max(1, venues.length) * days * (H1 - H0);
  const occ = Math.min(100, Math.round((hoursBooked(mAct) / capHours) * 100));
  const occPrev = Math.min(100, Math.round((hoursBooked(pAct) / capHours) * 100));
  const kpis = [
    { n: mAct.length, t: "Eventos agendados", icon: I.Calendar, c: "from-[#2563eb] to-[#143a8a]", d: pct(mAct.length, pAct.length), bars: perDay(mAct), col: "#3b82f6", good: true },
    { n: mAct.filter((r) => r.status === "confirmada").length, t: "Eventos confirmados", icon: I.Check, c: "from-[#16a34a] to-[#0d5c2b]", d: pct(mAct.filter((r) => r.status === "confirmada").length, pAct.filter((r) => r.status === "confirmada").length), bars: perDay(mAct.filter((r) => r.status === "confirmada")), col: "#22a35a", good: true },
    { n: mAct.filter((r) => r.status === "pendente").length, t: "Em negociação", icon: I.Clock, c: "from-[#b8862b] to-[#6a4a12]", d: pct(mAct.filter((r) => r.status === "pendente").length, pAct.filter((r) => r.status === "pendente").length), bars: perDay(mAct.filter((r) => r.status === "pendente")), col: "#e0a122", good: true },
    { n: mAll.filter((r) => r.status === "cancelada").length, t: "Cancelados", icon: I.Calendar, c: "from-[#e5484d] to-[#7a1f23]", d: pct(mAll.filter((r) => r.status === "cancelada").length, pAll.filter((r) => r.status === "cancelada").length), bars: perDay(mAll.filter((r) => r.status === "cancelada")), col: "#e5484d", good: false },
    { n: `${occ}%`, t: "Taxa de ocupação", icon: I.Users, c: "from-[#7c3aed] to-[#3b1d85]", d: pct(occ, occPrev), bars: perDay(mAct), col: "#8b5cf6", good: true },
  ];

  // Intervalo mostrado
  const weekStart = monday(anchor);
  const shown = view === "dia" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const title = view === "dia"
    ? `${dayNum(anchor)} ${MON3[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`
    : view === "semana"
      ? (() => { const a = weekStart, b = addDays(weekStart, 6); const sm = ym(a) === ym(b); return `${dayNum(a)}${sm ? "" : ` ${MONTHS[Number(a.slice(5, 7)) - 1]}`} - ${dayNum(b)} ${MONTHS[Number(b.slice(5, 7)) - 1]} ${b.slice(0, 4)}`; })()
      : `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const step = (dir: 1 | -1) => setAnchor((a) => view === "dia" ? addDays(a, dir) : view === "semana" ? addDays(a, 7 * dir) : (() => { const d = new Date(a + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + dir, 1); return dstr(d); })());

  // Painéis laterais e inferiores
  const upcoming = active.filter((r) => dstr(loc(r.ends_at)) >= today && (venueF === "todos" || r.venue_id === venueF)).slice(0, 5);
  const [my, mm] = mini.split("-").map(Number);
  const miniOffset = (new Date(Date.UTC(my, mm - 1, 1)).getUTCDay() + 6) % 7;
  const miniDays = new Date(Date.UTC(my, mm, 0)).getUTCDate();
  const busy = new Set(active.map((r) => dstr(loc(r.starts_at))));
  const byKind = (Object.keys(KIND) as Kind[]).map((k) => ({ k, n: mAct.filter((r) => kindOf(r.title) === k).length })).filter((x) => x.n > 0);
  const kindTotal = byKind.reduce((s, x) => s + x.n, 0);
  const revenue = mAct.reduce((s, r) => s + r.price, 0), prevRevenue = pAct.reduce((s, r) => s + r.price, 0);
  const cum = (() => { let acc = 0; const a: number[] = []; for (let d = 1; d <= days; d++) { acc += mAct.filter((r) => dayNum(dstr(loc(r.starts_at))) === d).reduce((s, r) => s + r.price, 0); a.push(acc); } return a; })();
  const venueOcc = venues.map((v) => {
    const list = onDay(anchor).filter((r) => r.venue_id === v.id && r.status !== "cancelada");
    const h = list.reduce((s, r) => s + Math.max(0, Math.min(H1, dstr(loc(r.ends_at)) > anchor ? H1 : hours(r.ends_at)) - Math.max(H0, dstr(loc(r.starts_at)) < anchor ? H0 : hours(r.starts_at))), 0);
    return { v, pct: Math.min(100, Math.round((h / (H1 - H0)) * 100)) };
  });

  const exportCsv = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const lines = visible.map((r) => [r.title, r.client, r.venue, dstr(loc(r.starts_at)), hm(r.starts_at), hm(r.ends_at), r.guests, Math.round(r.price), r.status].map(esc).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [["Evento", "Cliente", "Espaço", "Data", "Início", "Fim", "Convidados", "Valor", "Estado"].map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "agenda.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  const eventBlock = (l: Lane, day: string) => {
    const r = l.r, k = KIND[kindOf(r.title)];
    const s = dstr(loc(r.starts_at)) < day ? H0 : Math.max(H0, hours(r.starts_at));
    const e = dstr(loc(r.ends_at)) > day ? H1 : Math.min(H1, hours(r.ends_at) || 24);
    if (e <= H0 || s >= H1 || e <= s) return null;
    const pend = r.status === "pendente";
    return (
      <Link key={`${r.id}-${day}`} href={`/agenda/${r.id}`} title={`${r.title} — ${r.client}`}
        className="absolute overflow-hidden rounded-lg border p-1.5 text-[11px] leading-tight text-white shadow-[0_8px_18px_-12px_rgba(0,0,0,0.9)] transition hover:z-10 hover:brightness-110"
        style={{ top: (s - H0) * ROW + 1, height: Math.max(28, (e - s) * ROW - 2), left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)`, background: k.bg, borderColor: k.border, borderStyle: pend ? "dashed" : "solid", opacity: r.status === "cancelada" ? 0.45 : 1 }}>
        <div className="truncate font-semibold">{r.title}</div>
        <div className="truncate text-white/80">{hm(r.starts_at)} - {hm(r.ends_at)}</div>
        <div className="truncate text-white/70">{r.venue}</div>
        {r.guests ? <div className="truncate text-white/70">{r.guests} pax</div> : null}
      </Link>
    );
  };

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-agenda.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/80 via-[#020b13]/20 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"><I.ChevL className="size-3.5" />Agenda e Eventos</Link>
            <h1 className="mt-1 text-5xl leading-none md:text-6xl">Agenda e Eventos</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Planeamento, reservas e gestão completa dos eventos do Business Center Esperança.</p>
          </div>
          {canEdit && <button onClick={() => setForm({ date: anchor, start: "18:00" })} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Novo Evento</button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-semibold leading-none">{k.n}</div>
                <div className="mt-1 truncate text-xs text-slate-200">{k.t}</div>
                <div className="mb-1 h-4 text-[11px]">{k.d !== null && <><span className={(k.good ? k.d >= 0 : k.d <= 0) ? "text-emerald-400" : "text-red-400"}>{k.d >= 0 ? "↑" : "↓"} {Math.abs(k.d)}%</span> <span className="text-slate-400">vs. mês anterior</span></>}</div>
                <Spark values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Barra da agenda ───── */}
      <div className="flex flex-wrap items-center gap-2">
        {([["mes", "Mês"], ["semana", "Semana"], ["dia", "Dia"], ["lista", "Lista"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`rounded-lg border px-5 py-2.5 text-sm transition-colors ${view === k ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>{l}</button>
        ))}
        <div className="ml-2 flex items-center gap-1.5">
          <button onClick={() => step(-1)} aria-label="Anterior" className="grid size-10 place-items-center rounded-lg border border-line hover:border-gold/50"><I.ChevL className="size-4" /></button>
          <button onClick={() => step(1)} aria-label="Seguinte" className="grid size-10 place-items-center rounded-lg border border-line hover:border-gold/50"><I.ChevR className="size-4" /></button>
          <button onClick={() => { setAnchor(today); setMini(ym(today)); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/50">Hoje</button>
        </div>
        <h2 className="ml-3 font-serif text-xl">{title}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={venueF} onChange={(e) => setVenueF(e.target.value)} aria-label="Espaço" className="h-10 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
            <option value="todos">Todos os espaços</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button onClick={() => setFilters(!filters)} className={`flex h-10 items-center gap-2 rounded-lg border px-4 text-sm ${filters ? "border-gold bg-gold/10 text-gold-soft" : "border-gold/50 text-gold-soft hover:bg-gold/10"}`}><I.Filter className="size-4" />Filtros</button>
        </div>
      </div>
      {filters && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4">
          <label className="text-xs text-slate-400">Estado
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100"><option value="todos">Ativos (confirmados e pendentes)</option><option value="confirmada">Só confirmados</option><option value="pendente">Só pendentes</option><option value="cancelada">Cancelados</option></select></label>
          <button onClick={exportCsv} className="flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm hover:border-gold/40"><I.Download className="size-4" />Exportar CSV</button>
          <button onClick={() => { setVenueF("todos"); setStatusF("todos"); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar</button>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {/* ───── Semana / Dia ───── */}
          {(view === "semana" || view === "dia") && (
            <section className="overflow-x-auto rounded-2xl border border-line bg-[#05101a] p-3">
              <div className="min-w-[760px]">
                <div className="grid pb-2" style={{ gridTemplateColumns: `52px repeat(${shown.length}, minmax(0, 1fr))` }}>
                  <div />
                  {shown.map((d) => {
                    const dt = new Date(d + "T00:00:00Z"), isToday = d === today;
                    return (
                      <div key={d} className="text-center">
                        <div className="text-[13px] font-medium text-slate-200">{WD[(dt.getUTCDay() + 6) % 7]}</div>
                        <div className="mt-0.5 flex justify-center text-[13px] text-slate-400">
                          {isToday ? <span className="grid size-7 place-items-center rounded-full bg-[#2563eb] font-semibold text-white">{dayNum(d)}</span> : <span className="grid h-7 place-items-center">{dayNum(d)} {MON3[Number(d.slice(5, 7)) - 1]}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid" style={{ gridTemplateColumns: `52px repeat(${shown.length}, minmax(0, 1fr))` }}>
                  <div>{Array.from({ length: H1 - H0 + 1 }, (_, i) => <div key={i} className="pr-2 text-right text-[10px] text-slate-500" style={{ height: i === H1 - H0 ? 0 : ROW }}>{String(H0 + i).padStart(2, "0")}:00</div>)}</div>
                  {shown.map((d) => {
                    const lanes = layout(onDay(d));
                    return (
                      <div key={d} className="relative border-l border-white/[0.06]" style={{ height: (H1 - H0) * ROW }}
                        onClick={(e) => {
                          if (!canEdit || e.target !== e.currentTarget) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const h = Math.max(H0, Math.min(H1 - 1, H0 + Math.floor((e.clientY - rect.top) / ROW)));
                          setForm({ date: d, start: `${String(h).padStart(2, "0")}:00` });
                        }}>
                        {Array.from({ length: H1 - H0 }, (_, i) => <i key={i} className="pointer-events-none absolute inset-x-0 border-t border-white/[0.05]" style={{ top: i * ROW }} />)}
                        {d === today && <i className="pointer-events-none absolute inset-0 bg-[#2563eb]/[0.04]" />}
                        {lanes.map((l) => eventBlock(l, d))}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 px-1 text-[11px] text-slate-500">{canEdit ? "Clique num horário livre para marcar um evento. " : ""}Contorno tracejado = pendente.</p>
            </section>
          )}

          {/* ───── Mês ───── */}
          {view === "mes" && (
            <section className="rounded-2xl border border-line bg-panel/90 p-3">
              <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase text-slate-400">{WD.map((w) => <div key={w}>{w}</div>)}</div>
              <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                {(() => {
                  const [yy, mo] = month.split("-").map(Number);
                  const off = (new Date(Date.UTC(yy, mo - 1, 1)).getUTCDay() + 6) % 7;
                  return [...Array.from({ length: off }, (_, i) => <div key={`o${i}`} />), ...Array.from({ length: days }, (_, i) => {
                    const d = `${month}-${String(i + 1).padStart(2, "0")}`;
                    const list = onDay(d);
                    return (
                      <button key={d} onClick={() => { setAnchor(d); setView("dia"); }} className={`min-h-[92px] rounded-lg border p-1.5 text-left transition hover:border-gold/40 ${d === today ? "border-gold/60 bg-gold/5" : "border-line bg-[#041019]"}`}>
                        <div className="text-xs text-slate-400">{i + 1}</div>
                        {list.slice(0, 3).map((r) => <div key={r.id} className="mt-1 truncate rounded px-1.5 py-0.5 text-[10px] text-white" style={{ background: KIND[kindOf(r.title)].border + (r.status === "pendente" ? "88" : "") }}>{hm(r.starts_at)} {r.title}</div>)}
                        {list.length > 3 && <div className="mt-1 text-[10px] text-slate-400">+{list.length - 3}</div>}
                      </button>
                    );
                  })];
                })()}
              </div>
            </section>
          )}

          {/* ───── Lista ───── */}
          {view === "lista" && (
            <section className="overflow-x-auto rounded-2xl border border-line bg-panel/90 p-3">
              {visible.length === 0 ? <p className="py-14 text-center text-sm text-muted">Sem reservas.</p> : (
                <table className="min-w-[760px]">
                  <thead className="bg-white/[0.04]"><tr><th className="pl-3 pt-3">Data</th><th className="pt-3">Horário</th><th className="pt-3">Evento</th><th className="pt-3">Cliente</th><th className="pt-3">Espaço</th><th className="pt-3">Convidados</th><th className="pt-3">Valor</th><th className="pt-3">Estado</th></tr></thead>
                  <tbody>
                    {[...visible].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)).map((r) => (
                      <tr key={r.id} className="border-t border-line/70">
                        <td className="whitespace-nowrap pl-3 text-[13px]">{dstr(loc(r.starts_at)).split("-").reverse().join("/")}</td>
                        <td className="whitespace-nowrap text-[13px]">{hm(r.starts_at)} – {hm(r.ends_at)}</td>
                        <td className="text-[13px] font-medium"><Link href={`/agenda/${r.id}`} className="hover:text-gold">{r.title}</Link></td>
                        <td className="text-[13px]">{r.client}</td><td className="text-[13px]">{r.venue}</td><td className="text-[13px]">{r.guests ?? "—"}</td>
                        <td className="whitespace-nowrap text-[13px]">{kz(r.price)}</td>
                        <td><span className={`rounded px-2 py-1 text-xs ${r.status === "confirmada" ? "bg-[#16a34a] text-white" : r.status === "pendente" ? "bg-[#e0a122] text-[#1a1305]" : "bg-[#4b5563] text-white"}`}>{r.status === "confirmada" ? "Confirmado" : r.status === "pendente" ? "Pendente" : "Cancelado"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* ───── Painéis inferiores ───── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-line bg-panel/90 p-4">
              <h3 className="mb-3 text-sm font-medium">Espaços e Ocupação ({anchor.split("-").reverse().join("/")})</h3>
              {venueOcc.length === 0 ? <p className="py-6 text-center text-xs text-muted">Sem espaços registados.</p> : (
                <ul className="space-y-3">{venueOcc.map(({ v, pct: p }) => (
                  <li key={v.id} className="flex items-center gap-3 text-xs"><span className="w-28 shrink-0 truncate text-slate-200">{v.name}</span>
                    <span className="h-2 flex-1 rounded-full bg-white/10"><i className="block h-2 rounded-full" style={{ width: `${Math.max(p, p ? 4 : 0)}%`, background: p >= 80 ? "#e5484d" : p >= 50 ? "#22a35a" : "#3b82f6" }} /></span>
                    <b className="w-9 text-right">{p}%</b></li>))}</ul>
              )}
            </section>
            <section className="rounded-2xl border border-line bg-panel/90 p-4">
              <h3 className="mb-3 text-sm font-medium">Eventos por Tipo (Mês)</h3>
              <div className="flex items-center gap-3">
                <div className="relative size-[104px] shrink-0">
                  <svg viewBox="0 0 104 104" className="-rotate-90" aria-hidden>
                    <circle cx="52" cy="52" r="40" fill="none" stroke="#1b2740" strokeWidth="14" />
                    {(() => { const C = 2 * Math.PI * 40; let acc = 0; return byKind.map((x) => { const len = (x.n / kindTotal) * C; const el = <circle key={x.k} cx="52" cy="52" r="40" fill="none" stroke={KIND[x.k].dot} strokeWidth="14" strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />; acc += len; return el; }); })()}
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-xl font-semibold">{kindTotal}</div><div className="text-[10px] text-slate-400">Eventos</div></div></div>
                </div>
                <ul className="flex-1 space-y-1.5 text-xs">
                  {byKind.length === 0 ? <li className="text-muted">Sem eventos.</li> : byKind.map((x) => <li key={x.k} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: KIND[x.k].dot }} /><span className="flex-1 truncate text-slate-200">{KIND[x.k].plural}</span><span className="text-slate-300">{Math.round((x.n / kindTotal) * 100)}% ({x.n})</span></li>)}
                </ul>
              </div>
            </section>
            <section className="rounded-2xl border border-line bg-panel/90 p-4">
              <h3 className="text-sm font-medium">Receita Prevista ({MONTHS[Number(month.slice(5)) - 1]})</h3>
              <div className="mt-2 flex items-baseline justify-between"><span className="text-xl font-semibold text-gold-soft">{kz(revenue)}</span>
                {pct(revenue, prevRevenue) !== null && <span className="text-xs text-emerald-400">{(pct(revenue, prevRevenue) as number) >= 0 ? "↑" : "↓"} {Math.abs(pct(revenue, prevRevenue) as number)}%</span>}</div>
              <svg viewBox="0 0 200 70" preserveAspectRatio="none" className="mt-3 h-20 w-full" aria-hidden>
                {(() => {
                  const max = Math.max(...cum, 1);
                  const pts = cum.map((v, i) => `${(i / Math.max(1, cum.length - 1)) * 200},${66 - (v / max) * 60}`);
                  return <><defs><linearGradient id="rv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity=".35" /><stop offset="1" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs>
                    <polygon points={`0,70 ${pts.join(" ")} 200,70`} fill="url(#rv)" /><polyline points={pts.join(" ")} fill="none" stroke="#4aa3ff" strokeWidth="2" vectorEffect="non-scaling-stroke" /></>;
                })()}
              </svg>
            </section>
          </div>
        </div>

        {/* ───── Coluna lateral ───── */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-medium"><span className="grid size-6 place-items-center rounded-md border border-gold/40 text-gold"><I.Calendar className="size-3.5" /></span>{MONTHS[mm - 1]} {my}</h3>
              <div className="flex gap-1">
                <button onClick={() => setMini(ym(addDays(`${mini}-01`, -1)))} aria-label="Mês anterior" className="grid size-7 place-items-center rounded-md hover:bg-white/10"><I.ChevL className="size-4" /></button>
                <button onClick={() => setMini(ym(addDays(`${mini}-28`, 5)))} aria-label="Mês seguinte" className="grid size-7 place-items-center rounded-md hover:bg-white/10"><I.ChevR className="size-4" /></button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[11px]">
              {WD.map((w) => <div key={w} className="text-slate-500">{w}</div>)}
              {Array.from({ length: miniOffset }, (_, i) => <div key={`o${i}`} />)}
              {Array.from({ length: miniDays }, (_, i) => {
                const d = `${mini}-${String(i + 1).padStart(2, "0")}`;
                const sel = d === anchor, isToday = d === today;
                return (
                  <button key={d} onClick={() => { setAnchor(d); }} className="relative mx-auto grid size-8 place-items-center rounded-full text-[12px] transition hover:bg-white/10"
                    style={sel ? { background: "linear-gradient(180deg,#f3e2b8,#d6b06a)", color: "#1a1305", fontWeight: 600 } : isToday ? { background: "#2563eb", color: "#fff" } : undefined}>
                    {i + 1}
                    {busy.has(d) && !sel && <i className="absolute bottom-0.5 size-1 rounded-full bg-[#3b82f6]" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-medium"><span className="grid size-6 place-items-center rounded-md border border-gold/40 text-gold"><I.Clock className="size-3.5" /></span>Próximos Eventos</h3>
              <button onClick={() => setView("lista")} className="rounded-lg border border-line px-2.5 py-1 text-[11px] hover:border-gold/50">Ver Todos</button></div>
            {upcoming.length === 0 ? <p className="py-5 text-center text-xs text-muted">Sem eventos marcados.</p> : (
              <ul className="mt-3 space-y-2.5">
                {upcoming.map((r, i) => { const d = loc(r.starts_at); return (
                  <li key={r.id}><Link href={`/agenda/${r.id}`} className="flex items-center gap-2.5 rounded-lg transition hover:bg-white/[0.04]">
                    <div className="w-10 shrink-0 rounded-lg bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] py-1 text-center leading-none text-[#1a1305]"><div className="text-[15px] font-bold">{d.getUTCDate()}</div><div className="mt-0.5 text-[9px] font-semibold uppercase">{MON3[d.getUTCMonth()]}</div></div>
                    <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium">{r.title}</div><div className="truncate text-[11px] text-slate-400">{r.venue}{r.guests ? ` • ${r.guests} pax` : ""}</div><div className="text-[11px] text-slate-500">{hm(r.starts_at)} - {hm(r.ends_at)}</div></div>
                    <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md border border-line"><Image src={`/ev${(i % 4) + 1}.jpg`} alt="" fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" /></div>
                  </Link></li>); })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><span className="grid size-6 place-items-center rounded-md border border-gold/40 text-gold"><I.Alert className="size-3.5" /></span>Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={!canEdit} onClick={() => setForm({ date: anchor, start: "18:00" })} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-[11px] hover:border-gold/50 disabled:opacity-50"><I.Calendar className="size-4" />Nova Reserva</button>
              <button disabled={!canEdit} onClick={() => setForm({ date: anchor, start: "08:00", block: true })} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-[11px] hover:border-gold/50 disabled:opacity-50"><I.Shield className="size-4" />Bloquear Espaço</button>
              <button onClick={() => setAvail(true)} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-[11px] hover:border-gold/50"><I.Search className="size-4" />Ver Disponibilidade</button>
              <button onClick={() => window.print()} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-[11px] hover:border-gold/50"><I.File className="size-4" />Imprimir Agenda</button>
            </div>
          </section>
        </div>
      </div>

      {form && (
        <ReservationModal init={form} venues={venues} companies={companies} lead={lead} pending={pending} onClose={() => setForm(null)}
          onSubmit={(fd) => run(createReservationBoard(fd), form.block ? "Espaço bloqueado." : "Reserva criada.", () => setForm(null))} />
      )}
      {avail && <AvailabilityModal venues={venues} reservations={active} anchor={anchor} onClose={() => setAvail(false)} />}
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}

function ReservationModal({ init, venues, companies, lead, pending, onClose, onSubmit }: {
  init: { date: string; start: string; block?: boolean }; venues: { id: string; name: string }[]; companies: { id: string; name: string }[];
  lead: { id: string; name: string; event_type: string; guests: number | null; budget: number | null } | null; pending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void;
}) {
  const startH = Number(init.start.slice(0, 2));
  const endDefault = `${String(Math.min(23, startH + (init.block ? 14 : 4))).padStart(2, "0")}:00`;
  return (
    <div role="dialog" aria-modal="true" aria-label="Nova reserva" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="w-full max-w-2xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h2 className="font-serif text-3xl">{init.block ? "Bloquear espaço" : "Novo evento"}</h2><p className="text-sm text-slate-400">{lead ? `Reserva para o lead ${lead.name} (${lead.event_type})` : init.block ? "Impede novas reservas no período indicado." : "Marque o evento no salão. Conflitos de horário são recusados."}</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
        </div>
        {lead && <input type="hidden" name="lead_id" value={lead.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={lab}>Espaço *</label><select name="venue_id" required className={field}>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
          <div><label className={lab}>Estado</label><select name="status" defaultValue={init.block ? "confirmada" : "pendente"} className={field}><option value="pendente">Pendente</option><option value="confirmada">Confirmado</option></select></div>
          <div><label className={lab}>Evento *</label><input name="title" required defaultValue={init.block ? "Espaço bloqueado" : lead ? `${lead.event_type} ${lead.name}` : ""} placeholder="Casamento Silva" className={field} /></div>
          <div><label className={lab}>Cliente *</label><input name="client" required defaultValue={init.block ? "Business Center" : lead?.name ?? ""} className={field} /></div>
          <div><label className={lab}>Início *</label><input name="starts_at" type="datetime-local" required defaultValue={`${init.date}T${init.start}`} className={`${field} [color-scheme:dark]`} /></div>
          <div><label className={lab}>Fim *</label><input name="ends_at" type="datetime-local" required defaultValue={`${init.date}T${endDefault}`} className={`${field} [color-scheme:dark]`} /></div>
          {!init.block && <>
            <div><label className={lab}>Empresa (opcional)</label><select name="company_id" defaultValue="" className={field}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className={lab}>Convidados</label><input name="guests" type="number" min="0" defaultValue={lead?.guests ?? ""} className={field} /></div>
            <div className="sm:col-span-2"><label className={lab}>Valor do evento (Kz)</label><input name="price" type="number" min="0" step="0.01" defaultValue={lead?.budget ?? ""} className={field} /></div>
          </>}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : init.block ? "Bloquear" : "Marcar no salão"}</button>
        </div>
      </form>
    </div>
  );
}

function AvailabilityModal({ venues, reservations, anchor, onClose }: { venues: { id: string; name: string }[]; reservations: ResVM[]; anchor: string; onClose: () => void }) {
  const [date, setDate] = useState(anchor);
  const free = (vId: string) => {
    const busyList = reservations.filter((r) => r.venue_id === vId && dstr(loc(r.starts_at)) <= date && dstr(loc(r.ends_at)) >= date)
      .map((r) => [dstr(loc(r.starts_at)) < date ? H0 : Math.max(H0, hours(r.starts_at)), dstr(loc(r.ends_at)) > date ? H1 : Math.min(H1, hours(r.ends_at) || 24)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = []; let cur = H0;
    for (const [s, e] of busyList) { if (s > cur) out.push([cur, s]); cur = Math.max(cur, e); }
    if (cur < H1) out.push([cur, H1]);
    return out;
  };
  const fmtH = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  return (
    <div role="dialog" aria-modal="true" aria-label="Disponibilidade" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 className="font-serif text-3xl">Disponibilidade</h2><p className="text-sm text-slate-400">Horários livres entre {String(H0).padStart(2, "0")}:00 e {H1}:00.</p></div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button></div>
        <div><label className={lab}>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} [color-scheme:dark]`} /></div>
        <ul className="space-y-3">
          {venues.map((v) => { const f = free(v.id); return (
            <li key={v.id} className="rounded-xl border border-line p-3"><div className="text-sm font-medium">{v.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{f.length === 0 ? <span className="text-xs text-red-300">Totalmente ocupado</span> : f.map(([s, e], i) => <span key={i} className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 ring-1 ring-inset ring-emerald-400/25">{fmtH(s)} – {fmtH(e)}</span>)}</div></li>); })}
        </ul>
      </div>
    </div>
  );
}
