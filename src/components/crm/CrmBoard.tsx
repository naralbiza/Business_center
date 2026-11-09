"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { LeadVM } from "@/lib/crmBoard";
import type { Reservation } from "@/lib/types";
import { createLeadBoard, deleteLead, setLeadStageBoard, updateLeadBoard, type ActionResult } from "@/app/actions";
import { datePt, kz } from "@/lib/format";
import * as I from "@/components/icons";

type TypeKey = "casamento" | "corporativo" | "aniversario" | "infantil" | "outro";
const TYPES: Record<TypeKey, { label: string; plural: string; bg: string; fg: string }> = {
  casamento: { label: "Casamento", plural: "Casamentos", bg: "#c0392b", fg: "#fff" },
  corporativo: { label: "Corporativo", plural: "Corporativos", bg: "#2563eb", fg: "#fff" },
  aniversario: { label: "Aniversário", plural: "Aniversários", bg: "#d99a1f", fg: "#1a1305" },
  infantil: { label: "Infantil", plural: "Infantis", bg: "#eab308", fg: "#1a1305" },
  outro: { label: "Outro", plural: "Outros", bg: "#8b5cf6", fg: "#fff" },
};
const SOFT: Record<TypeKey, string> = { casamento: "#f0817a", corporativo: "#7fb0ff", aniversario: "#f2c166", infantil: "#f5d85a", outro: "#b79cff" };
const typeOf = (t: string): TypeKey => {
  const s = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return s.includes("casam") ? "casamento" : /corpor|empres|confer|lancam|workshop|formatura|reuni|jantar/.test(s) ? "corporativo" : s.includes("anivers") ? "aniversario" : s.includes("infant") ? "infantil" : "outro";
};

const COLS = [
  { key: "novos", title: "Novos Leads", stages: ["novo", "contactado"], target: "novo", color: "#3b82f6" },
  { key: "negociacao", title: "Em Negociação", stages: ["visita", "negociacao"], target: "negociacao", color: "#e0a122" },
  { key: "proposta", title: "Proposta Enviada", stages: ["proposta"], target: "proposta", color: "#8b5cf6" },
  { key: "contrato", title: "Contrato Assinado", stages: ["reserva", "contrato", "pagamento", "confirmado"], target: "contrato", color: "#e5484d" },
  { key: "realizado", title: "Evento Realizado", stages: ["realizado", "posvenda"], target: "realizado", color: "#22a35a" },
] as const;
const STAGE_LABEL: Record<string, string> = { novo: "Novo", contactado: "Contactado", visita: "Visita", proposta: "Proposta", negociacao: "Negociação", reserva: "Reserva", contrato: "Contrato", pagamento: "Pagamento", confirmado: "Confirmado", realizado: "Realizado", posvenda: "Pós-venda", perdido: "Perdido" };
const VIEWS = [
  { key: "pipeline", label: "Pipeline" }, { key: "lista", label: "Lista" }, { key: "calendario", label: "Calendário" },
  { key: "propostas", label: "Propostas" }, { key: "contratos", label: "Contratos" }, { key: "pos", label: "Pós-Evento" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MON3 = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const SOURCES = ["Website", "Instagram", "Indicação", "Google", "Outros"];
const SRC_COLOR: Record<string, string> = { Website: "#2563eb", Instagram: "#ec4899", Indicação: "#22a35a", Google: "#e0a122", Outros: "#22c1c3" };
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials = (n: string) => n.split(/[\s&]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const field = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";
const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { timeZone: "Africa/Luanda", hour: "2-digit", minute: "2-digit" });

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-8 items-end gap-[2px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}</div>;
}
function Donut({ parts, size = 120, stroke = 15 }: { parts: { v: number; c: string }[]; size?: number; stroke?: number }) {
  const R = size / 2 - stroke, C = 2 * Math.PI * R, total = parts.reduce((s, p) => s + p.v, 0);
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#1b2740" strokeWidth={stroke} />
      {total > 0 && parts.filter((p) => p.v > 0).map((p, i) => { const len = (p.v / total) * C; const el = <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={p.c} strokeWidth={stroke} strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />; acc += len; return el; })}
    </svg>
  );
}

export default function CrmBoard({ leads: all, reservations, canEdit, needsMigration, today, monthStart }: { leads: LeadVM[]; reservations: Reservation[]; canEdit: boolean; needsMigration: boolean; today: string; monthStart: string }) {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)) - 1;
  const [view, setView] = useState<ViewKey>("pipeline");
  const [monthF, setMonthF] = useState("todos");
  const [query, setQuery] = useState("");
  const [typeF, setTypeF] = useState("todos");
  const [more, setMore] = useState(false);
  const [minBudget, setMinBudget] = useState("");
  const [year, setYear] = useState(ty);
  const [calM, setCalM] = useState({ y: ty, m: tm });
  const [dragId, setDragId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [overCol, setOverCol] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadVM | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [quote, setQuote] = useState<null | "proposta" | "orcamento">(null);
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuId(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const run = (p: Promise<ActionResult>, ok: string, then?: () => void) =>
    start(async () => {
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });

  const q = norm(query.trim());
  const leads = useMemo(() => all.filter((l) =>
    (monthF === "todos" || (l.desired_date ?? "").startsWith(monthF)) &&
    (typeF === "todos" || typeOf(l.event_type) === typeF) &&
    (!minBudget || (l.budget ?? 0) >= Number(minBudget)) &&
    (!q || [l.name, l.phone, l.email, l.event_type, l.source].some((v) => v && norm(v).includes(q)))), [all, monthF, typeF, minBudget, q]);

  const col = (c: (typeof COLS)[number]) => leads.filter((l) => (c.stages as readonly string[]).includes(l.stage));
  const live = leads.filter((l) => l.stage !== "perdido");
  const won = leads.filter((l) => ["contrato", "pagamento", "confirmado", "reserva", "realizado", "posvenda"].includes(l.stage));
  const confirmedRes = reservations.filter((r) => r.status === "confirmada");
  const pipelineValue = leads.filter((l) => ["visita", "negociacao", "proposta"].includes(l.stage)).reduce((s, l) => s + (l.budget ?? 0), 0);
  const realizados = leads.filter((l) => ["realizado", "posvenda"].includes(l.stage));
  const conv = leads.length ? Math.round((won.length / leads.length) * 100) : 0;

  // variação face ao mês anterior (criação de leads)
  const before = all.filter((l) => l.created_at < monthStart).length;
  const growth = before ? Math.round(((all.length - before) / before) * 100) : null;
  const monthly = (list: LeadVM[]) => { const a = Array.from({ length: 12 }, () => 0); list.forEach((l) => { const d = new Date(l.created_at); if (d.getUTCFullYear() === ty) a[d.getUTCMonth()]++; }); return a; };

  const kpis = [
    { n: String(leads.length), t: "Leads de Eventos", icon: I.Users, c: "from-[#2563eb] to-[#143a8a]", d: growth, bars: monthly(leads), col: "#3b82f6" },
    { n: String(confirmedRes.length), t: "Eventos Confirmados", icon: I.Calendar, c: "from-[#16a34a] to-[#0d5c2b]", d: null, bars: monthly(leads.filter((l) => ["contrato", "pagamento", "confirmado"].includes(l.stage))), col: "#22a35a" },
    { n: kz(pipelineValue), t: "Valor em Propostas", icon: I.Coins, c: "from-[#b8862b] to-[#6a4a12]", d: null, bars: monthly(leads.filter((l) => l.stage === "proposta")), col: "#e0a122" },
    { n: String(realizados.length), t: "Eventos Realizados", icon: I.Check, c: "from-[#7c3aed] to-[#3b1d85]", d: null, bars: monthly(realizados), col: "#8b5cf6" },
    { n: `${conv}%`, t: "Taxa de Conversão", icon: I.Chart, c: "from-[#e5484d] to-[#7a1f23]", d: null, bars: monthly(won), col: "#e5484d" },
  ];

  // Painéis laterais
  const byType = (list: LeadVM[]) => (Object.keys(TYPES) as TypeKey[]).map((k) => ({ k, n: list.filter((l) => typeOf(l.event_type) === k).length }));
  const allTypes = byType(live);
  const revenue = confirmedRes.reduce((s, r) => s + r.price, 0);
  const ticket = confirmedRes.length ? revenue / confirmedRes.length : 0;
  const emNeg = col(COLS[1]).length;
  const upcoming = reservations.filter((r) => r.status !== "cancelada" && r.ends_at.slice(0, 10) >= today).slice(0, 4);
  const monthBars = Array.from({ length: 12 }, (_, m) => {
    const a = reservations.filter((r) => r.status !== "cancelada" && r.starts_at.startsWith(`${year}-${String(m + 1).padStart(2, "0")}`)).length;
    const b = leads.filter((l) => l.desired_date?.startsWith(`${year}-${String(m + 1).padStart(2, "0")}`) && !["reserva", "contrato", "pagamento", "confirmado", "realizado", "posvenda", "perdido"].includes(l.stage)).length;
    return a + b;
  });
  const maxM = Math.max(...monthBars, 1);
  const srcCounts = SOURCES.map((s) => ({ s, n: live.filter((l) => (l.source ?? "") === s).length }));
  const srcTotal = srcCounts.reduce((a, b) => a + b.n, 0);

  const mailtoOf = (l: LeadVM) => l.email ? `mailto:${l.email}?subject=${encodeURIComponent(`Orçamento — ${l.event_type}`)}&body=${encodeURIComponent(`Exmo(a). ${l.name},\n\nSegue o orçamento para o seu ${l.event_type}${l.desired_date ? ` em ${datePt(l.desired_date)}` : ""}${l.guests ? ` (${l.guests} convidados)` : ""}${l.budget ? `, no valor estimado de ${kz(l.budget)}` : ""}.\n\nCom os melhores cumprimentos,\nBusiness Center Esperança`)}` : null;
  const move = (id: string, stage: string, msg = "Lead movido.") => run(setLeadStageBoard(id, stage), msg);
  const exportCsv = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const head = ["Nome", "Tipo", "Etapa", "Data desejada", "Convidados", "Orçamento", "Telefone", "Email", "Origem"];
    const lines = leads.map((l) => [l.name, l.event_type, STAGE_LABEL[l.stage] ?? l.stage, l.desired_date, l.guests, l.budget, l.phone, l.email, l.source].map(esc).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "leads-eventos.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  const renderCard = (l: LeadVM) => {
    const tk = typeOf(l.event_type), t = TYPES[tk], soft = SOFT[tk];
    const colIdx = Math.max(0, COLS.findIndex((c) => (c.stages as readonly string[]).includes(l.stage)));
    const colColor = COLS[colIdx].color;
    const days = l.desired_date ? Math.round((Date.parse(l.desired_date) - Date.parse(today)) / 864e5) : null;
    const when = days === null ? null : days === 0 ? "Hoje" : days > 0 ? `Em ${days} dia${days === 1 ? "" : "s"}` : `Há ${-days} dia${days === -1 ? "" : "s"}`;
    return (
      <article key={l.id} draggable={canEdit} onDragStart={() => setDragId(l.id)} onDragEnd={() => { setDragId(null); setOverCol(null); }}
        onClick={() => setDetail(l)}
        className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.16] hover:shadow-[0_22px_44px_-28px_var(--tc)] ${dragId === l.id ? "opacity-40" : ""}`}
        style={{ ["--tc" as string]: soft }}>
        <span className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-500 group-hover:opacity-25" style={{ background: soft }} />

        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-[12px] font-semibold text-white/95 shadow-inner" style={{ background: `linear-gradient(145deg, ${colorOf(l.name)}d9, ${colorOf(l.name)}40)` }}>{initials(l.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium leading-tight text-slate-50">{l.name}</div>
            <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset" style={{ background: soft + "17", color: soft, ["--tw-ring-color" as string]: soft + "38" }}>
              <i className="size-1.5 shrink-0 rounded-full" style={{ background: soft }} /><span className="truncate">{t.label}</span>
            </div>
          </div>
        </div>

        <dl className="mt-3.5 space-y-1.5 text-[12px]">
          <div className="flex items-center gap-2 text-slate-300">
            <I.Calendar className="size-3.5 shrink-0 text-gold/80" />
            <span className="truncate">{l.desired_date ? datePt(l.desired_date) : "Data por definir"}</span>
            {when && <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${days !== null && days >= 0 && days <= 14 ? "bg-amber-500/10 text-amber-300" : "bg-white/[0.06] text-slate-400"}`}>{when}</span>}
          </div>
          <div className="flex items-center gap-2 text-slate-400"><I.Users className="size-3.5 shrink-0 text-slate-500" /><span>{l.guests ? `${l.guests} convidados` : "Convidados por definir"}</span></div>
          <div className="flex items-center gap-2 text-slate-400"><I.Phone className="size-3.5 shrink-0 text-slate-500" /><span className="truncate">{l.phone ?? l.email ?? "Sem contacto"}</span></div>
        </dl>

        <div className="mt-3.5 flex items-end justify-between border-t border-white/[0.06] pt-3">
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.14em] text-slate-500">Orçamento</div>
            <div className="text-[16px] font-semibold tracking-tight text-gold-soft">{l.budget != null ? kz(l.budget) : "—"}</div>
          </div>
          <div className="flex items-center gap-[3px]" title={`Etapa: ${STAGE_LABEL[l.stage] ?? l.stage}`} aria-label={`Etapa ${colIdx + 1} de ${COLS.length}`}>
            {COLS.map((c, i) => <i key={c.key} className="h-1 w-3.5 rounded-full" style={{ background: i <= colIdx ? colColor : "rgba(255,255,255,0.1)" }} />)}
          </div>
        </div>

        <div className="relative mt-2.5 flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {l.phone ? <a href={`tel:${l.phone}`} aria-label="Ligar" className="grid size-8 place-items-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"><I.Phone className="size-4" /></a> : null}
          {l.email ? <a href={mailtoOf(l) ?? "#"} aria-label="Enviar email" className="grid size-8 place-items-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"><I.Chat className="size-4" /></a> : null}
          <button onClick={() => setMenuId(menuId === l.id ? null : l.id)} aria-label="Mais ações" className="grid size-8 place-items-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"><I.Dots className="size-4" /></button>
          {menuId === l.id && (
            <div className="absolute bottom-9 right-0 z-30 w-52 overflow-hidden rounded-xl border border-white/10 bg-panel text-sm shadow-2xl">
              <button onClick={() => { setMenuId(null); setDetail(l); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Abrir / editar</button>
              {canEdit && COLS.filter((c) => !(c.stages as readonly string[]).includes(l.stage)).map((c) => (
                <button key={c.key} disabled={pending} onClick={() => { setMenuId(null); move(l.id, c.target, `Movido para ${c.title}.`); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Mover para {c.title}</button>
              ))}
              <Link href={`/agenda?lead=${l.id}${l.desired_date ? `&m=${l.desired_date.slice(0, 7)}&d=${l.desired_date.slice(0, 10)}` : ""}#nova`} className="block px-4 py-2.5 hover:bg-white/5">Reservar salão</Link>
              {canEdit && l.stage !== "perdido" && <button disabled={pending} onClick={() => { setMenuId(null); move(l.id, "perdido", "Marcado como perdido."); }} className="block w-full px-4 py-2.5 text-left text-red-400 hover:bg-white/5">Marcar como perdido</button>}
            </div>
          )}
        </div>
      </article>
    );
  };

  const table = (list: LeadVM[]) => (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel/90 p-3" ref={menuRef}>
      {list.length === 0 ? <p className="py-14 text-center text-sm text-muted">Sem leads nesta vista.</p> : (
        <table className="min-w-[760px]">
          <thead className="bg-white/[0.04]"><tr><th className="pl-3 pt-3">Cliente</th><th className="pt-3">Tipo</th><th className="pt-3">Etapa</th><th className="pt-3">Data</th><th className="pt-3">Convidados</th><th className="pt-3">Orçamento</th><th className="pt-3">Origem</th><th className="pt-3" /></tr></thead>
          <tbody>
            {list.map((l) => { const t = TYPES[typeOf(l.event_type)]; return (
              <tr key={l.id} onClick={() => setDetail(l)} className="cursor-pointer border-t border-line/70">
                <td className="pl-3"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: colorOf(l.name) }}>{initials(l.name)}</span><div><div className="text-[13px]">{l.name}</div><div className="text-xs text-slate-400">{l.phone ?? l.email ?? ""}</div></div></div></td>
                <td><span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: t.bg, color: t.fg }}>{t.label}</span></td>
                <td className="text-[13px]">{STAGE_LABEL[l.stage] ?? l.stage}</td>
                <td className="whitespace-nowrap text-[13px]">{l.desired_date ? datePt(l.desired_date) : "—"}</td>
                <td className="text-[13px]">{l.guests ?? "—"}</td>
                <td className="whitespace-nowrap text-[13px]">{l.budget != null ? kz(l.budget) : "—"}</td>
                <td className="text-[13px] text-slate-300">{l.source ?? "—"}</td>
                <td className="pr-2 text-right text-xs text-gold">Abrir →</td>
              </tr>); })}
          </tbody>
        </table>
      )}
    </div>
  );

  // Calendário mensal
  const cal = (() => {
    const first = new Date(Date.UTC(calM.y, calM.m, 1)), days = new Date(Date.UTC(calM.y, calM.m + 1, 0)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7;
    const key = (d: number) => `${calM.y}-${String(calM.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { offset, days, key };
  })();

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-crm.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/80 via-[#020b13]/20 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"><I.ChevL className="size-3.5" />CRM de Eventos</Link>
            <h1 className="mt-1 text-5xl leading-none md:text-6xl">CRM de Eventos</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Gestão completa de eventos, desde o primeiro contacto até à realização e pós-evento.</p>
          </div>
          {canEdit && <button onClick={() => setShowNew(true)} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Novo Evento</button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold leading-tight">{k.n}</div>
                <div className="truncate text-xs text-slate-200">{k.t}</div>
                <div className="mb-1 h-4 text-[11px]">{k.d !== null && <><span className={k.d >= 0 ? "text-emerald-400" : "text-red-400"}>{k.d >= 0 ? "↑" : "↓"} {Math.abs(k.d)}%</span> <span className="text-slate-400">vs. mês anterior</span></>}</div>
                <Spark values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {needsMigration && <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-amber-200">Para registar a origem dos leads (Website, Instagram…), execute a migração <b>0014_lead_source.sql</b> no Supabase.</p>}

      {/* ───── Vistas e filtros ───── */}
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`rounded-lg border px-6 py-2.5 text-sm transition-colors ${view === v.key ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>{v.label}</button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-panel/80 px-3 text-sm"><I.Calendar className="size-4 text-slate-300" />
            <select value={monthF} onChange={(e) => setMonthF(e.target.value)} aria-label="Mês" className="bg-transparent pr-1 outline-none">
              <option value="todos" className="bg-[#07121b]">Todos os meses</option>
              {Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(ty, tm - 3 + i, 1)); const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; return <option key={k} value={k} className="bg-[#07121b]">{MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}</option>; })}
            </select>
          </label>
          <button onClick={() => setMore(!more)} className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm ${more ? "border-gold bg-gold/10 text-gold-soft" : "border-gold/50 text-gold-soft hover:bg-gold/10"}`}><I.Filter className="size-4" />Mais filtros</button>
          <div className="flex overflow-hidden rounded-lg border border-line">
            <button onClick={() => setView("pipeline")} aria-label="Quadro" className={`grid size-11 place-items-center ${view === "pipeline" ? "bg-gold/20 text-gold-soft" : "hover:bg-white/5"}`}><I.MapIcon className="size-4" /></button>
            <button onClick={() => setView("lista")} aria-label="Lista" className={`grid size-11 place-items-center ${view === "lista" ? "bg-gold/20 text-gold-soft" : "hover:bg-white/5"}`}><I.List className="size-4" /></button>
          </div>
        </div>
      </div>
      {more && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4">
          <label className="min-w-[14rem] flex-1 text-xs text-slate-400">Pesquisar<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, contacto, tipo, origem…" className="mt-1 block h-10 w-full rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
          <label className="text-xs text-slate-400">Tipo de evento
            <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100"><option value="todos">Todos</option>{(Object.keys(TYPES) as TypeKey[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}</select></label>
          <label className="text-xs text-slate-400">Orçamento mínimo (Kz)<input type="number" min="0" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} className="mt-1 block h-10 w-40 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
          <button onClick={() => { setQuery(""); setTypeF("todos"); setMinBudget(""); setMonthF("todos"); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar tudo</button>
          <button onClick={exportCsv} className="flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm hover:border-gold/40"><I.Download className="size-4" />Exportar</button>
        </div>
      )}

      <section className="rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.035] to-transparent p-4">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-gold/10 text-gold ring-1 ring-inset ring-gold/25"><I.Calendar className="size-4" /></span>
            <div className="leading-tight"><h2 className="text-[15px] font-medium text-slate-50">Próximos Eventos</h2><p className="text-[11px] text-slate-500">Reservas confirmadas e a decorrer nos próximos dias</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!canEdit} onClick={() => setShowNew(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold/10 px-3.5 text-xs font-medium text-gold-soft ring-1 ring-inset ring-gold/30 transition hover:bg-gold/20 disabled:opacity-40"><I.Plus className="size-3.5" />Novo Lead</button>
            <button disabled={!canEdit} onClick={() => setQuote("proposta")} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs text-slate-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.06] disabled:opacity-40"><I.File className="size-3.5" />Nova Proposta</button>
            <Link href="/contratos/novo" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs text-slate-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.06]"><I.File className="size-3.5" />Gerar Contrato</Link>
            <button onClick={() => setQuote("orcamento")} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs text-slate-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.06]"><I.Chat className="size-3.5" />Enviar Orçamento</button>
            <Link href="/agenda" className="inline-flex h-9 items-center rounded-full px-3.5 text-xs text-gold ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.06]">Ver agenda</Link>
          </div>
        </div>
        {upcoming.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 py-7 text-center text-xs text-slate-500">Sem eventos marcados.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {upcoming.map((r, i) => {
              const d = new Date(r.starts_at);
              const ok = r.status === "confirmada";
              return (
                <Link key={r.id} href={`/agenda/${r.id}`} className="group flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.05]">
                  <div className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl">
                    <Image src={`/ev${(i % 4) + 1}.jpg`} alt="" fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-center leading-none backdrop-blur">
                      <span className="text-[13px] font-bold text-white">{d.toLocaleDateString("pt-PT", { day: "2-digit", timeZone: "Africa/Luanda" })}</span>
                      <span className="ml-1 text-[9px] font-semibold uppercase text-gold-soft">{MON3[Number(d.toLocaleDateString("en-GB", { month: "numeric", timeZone: "Africa/Luanda" })) - 1]}</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-slate-50">{r.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-400">{r.venue}{r.guests ? ` · ${r.guests} pax` : ""}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <I.Clock className="size-3.5" />{hm(r.starts_at)} – {hm(r.ends_at)}
                      <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${ok ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25" : "bg-amber-500/10 text-amber-300 ring-amber-400/25"}`}>
                        <i className={`size-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />{ok ? "Confirmado" : "Pendente"}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="space-y-4">
        <div className="min-w-0 space-y-4">
          {view === "pipeline" && (
            <div className="space-y-3">
              {/* Indicadores do funil, integrados no próprio pipeline */}
              <div className="flex flex-wrap items-stretch rounded-2xl border border-white/[0.07] bg-white/[0.025] px-1 py-2">
                {[
                  { k: "Receita total", v: kz(revenue), c: "text-gold-soft" },
                  { k: "Ticket médio", v: kz(ticket), c: "text-gold-soft" },
                  { k: "Eventos confirmados", v: String(won.length), c: "text-slate-50" },
                  { k: "Eventos realizados", v: String(realizados.length), c: "text-emerald-300" },
                  { k: "Em negociação", v: String(emNeg), c: "text-amber-300" },
                ].map((m, i) => (
                  <div key={m.k} className={`min-w-[8.5rem] flex-1 px-4 py-1 ${i ? "border-l border-white/[0.07]" : ""}`}>
                    <div className="text-[10.5px] uppercase tracking-[0.12em] text-slate-500">{m.k}</div>
                    <div className={`mt-0.5 text-base font-semibold tracking-tight ${m.c}`}>{m.v}</div>
                  </div>
                ))}
              </div>

              <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2" ref={menuRef}>
                {COLS.map((c) => {
                  const items = col(c);
                  const sum = items.reduce((s2, l) => s2 + (l.budget ?? 0), 0);
                  const avg = items.length ? sum / items.length : 0;
                  const share = leads.length ? Math.round((items.length / leads.length) * 100) : 0;
                  const isCollapsed = collapsed[c.key];
                  return (
                    <section key={c.key} onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOverCol(c.key); } }} onDragLeave={() => setOverCol(null)}
                      onDrop={() => { if (canEdit && dragId) { const l = all.find((x) => x.id === dragId); if (l && !(c.stages as readonly string[]).includes(l.stage)) move(dragId, c.target, `Movido para ${c.title}.`); } setDragId(null); setOverCol(null); }}
                      className={`flex min-w-0 flex-col rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-2.5 transition ${overCol === c.key ? "border-gold/40 bg-gold/[0.04]" : ""}`}>
                      <header className="px-2.5 pb-3 pt-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <i className="size-2 shrink-0 rounded-full" style={{ background: c.color, boxShadow: `0 0 10px ${c.color}99` }} />
                            <h3 className="truncate text-[13px] font-medium tracking-wide text-slate-100">{c.title}</h3>
                            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-slate-300">{items.length}</span>
                          </div>
                          <button onClick={() => setCollapsed((m) => ({ ...m, [c.key]: !m[c.key] }))} aria-label={isCollapsed ? "Expandir coluna" : "Recolher coluna"} className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={isCollapsed ? "rotate-180" : ""} aria-hidden><path d="M6 15l6-6 6 6" /></svg>
                          </button>
                        </div>
                        <div className="mt-2 text-[17px] font-semibold tracking-tight" style={{ color: c.color }}>{kz(sum)}</div>
                        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.07]"><i className="block h-full rounded-full" style={{ width: `${Math.max(share, items.length ? 4 : 0)}%`, background: c.color }} /></div>
                        <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500"><span>{share}% dos leads</span><span>{items.length ? `Média ${kz(avg)}` : "—"}</span></div>
                      </header>
                      {!isCollapsed && (
                        <div className="max-h-[640px] space-y-2.5 overflow-y-auto px-0.5 pb-1">
                          {items.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-xs text-slate-500">Sem leads</p> : items.map((l) => renderCard(l))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {view === "lista" && table([...leads].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)))}
          {view === "propostas" && table(leads.filter((l) => ["visita", "negociacao", "proposta"].includes(l.stage)))}
          {view === "contratos" && table(leads.filter((l) => ["reserva", "contrato", "pagamento", "confirmado"].includes(l.stage)))}
          {view === "pos" && table(leads.filter((l) => ["realizado", "posvenda"].includes(l.stage)))}

          {view === "calendario" && (
            <section className="rounded-2xl border border-line bg-panel/90 p-4">
              <div className="mb-3 flex items-center justify-between">
                <button onClick={() => setCalM((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))} aria-label="Mês anterior" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.ChevL className="size-4" /></button>
                <h2 className="font-serif text-xl">{MONTHS[calM.m]} {calM.y}</h2>
                <button onClick={() => setCalM((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))} aria-label="Mês seguinte" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.ChevR className="size-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase text-slate-400">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d}>{d}</div>)}</div>
              <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                {Array.from({ length: cal.offset }, (_, i) => <div key={`o${i}`} />)}
                {Array.from({ length: cal.days }, (_, i) => {
                  const k = cal.key(i + 1);
                  const rs = reservations.filter((r) => r.status !== "cancelada" && r.starts_at.slice(0, 10) === k);
                  const ls = leads.filter((l) => l.desired_date === k && l.stage !== "perdido");
                  return (
                    <div key={k} className={`min-h-[84px] rounded-lg border p-1.5 ${k === today ? "border-gold/60 bg-gold/5" : "border-line bg-[#041019]"}`}>
                      <div className="text-xs text-slate-400">{i + 1}</div>
                      {rs.map((r) => <Link key={r.id} href={`/agenda/${r.id}`} className="mt-1 block truncate rounded bg-[#16a34a] px-1.5 py-0.5 text-[10px] text-white">{r.title}</Link>)}
                      {ls.map((l) => <button key={l.id} onClick={() => setDetail(l)} className="mt-1 block w-full truncate rounded bg-[#2563eb] px-1.5 py-0.5 text-left text-[10px] text-white">{l.name}</button>)}
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 flex gap-4 text-xs text-slate-400"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#16a34a]" />Reservas</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#2563eb]" />Leads com data desejada</span></p>
            </section>
          )}

          {/* ───── Gráficos inferiores ───── */}
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
            <section className="rounded-2xl border border-line bg-panel/90 p-4">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Eventos por mês</h2>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano" className="rounded-lg border border-line bg-panel2 px-2.5 py-1 text-xs outline-none">{[ty + 1, ty, ty - 1].map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
              <div className="flex h-36 items-end gap-2">
                {monthBars.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${MONTHS[i]}: ${n}`}>
                    <span className="text-[10px] text-slate-400">{n || ""}</span>
                    <div className="w-full rounded-t-sm bg-gradient-to-t from-[#1d4ed8] to-[#3b82f6]" style={{ height: `${Math.max(3, (n / maxM) * 100)}%`, opacity: n ? 1 : 0.25 }} />
                    <span className="text-[10px] text-slate-400">{MON3[i]}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-line bg-panel/90 p-4">
              <h2 className="mb-3 font-medium">Tipos de Eventos</h2>
              <div className="flex items-center gap-3">
                <div className="relative size-[110px] shrink-0"><Donut size={110} stroke={14} parts={allTypes.map((t) => ({ v: t.n, c: TYPES[t.k].bg }))} />
                  <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-xl font-semibold">{live.length}</div><div className="text-[10px] text-slate-400">Total</div></div></div></div>
                <ul className="flex-1 space-y-1.5 text-xs">{allTypes.map((t) => <li key={t.k} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: TYPES[t.k].bg }} /><span className="flex-1 text-slate-200">{TYPES[t.k].plural}</span><span className="text-slate-300">{live.length ? Math.round((t.n / live.length) * 100) : 0}% ({t.n})</span></li>)}</ul>
              </div>
            </section>
            <section className="rounded-2xl border border-line bg-panel/90 p-4">
              <h2 className="mb-3 font-medium">Origem dos Leads</h2>
              {srcTotal === 0 ? <p className="py-8 text-center text-xs text-muted">Sem dados de origem.</p> : (
                <ul className="space-y-2.5 text-xs">{srcCounts.map(({ s, n }) => (
                  <li key={s} className="flex items-center gap-3"><span className="w-20 shrink-0 text-slate-200">{s}</span>
                    <span className="h-2 flex-1 rounded-full bg-white/10"><i className="block h-2 rounded-full" style={{ width: `${(n / srcTotal) * 100}%`, background: SRC_COLOR[s] }} /></span>
                    <b className="w-9 text-right">{Math.round((n / srcTotal) * 100)}%</b></li>))}</ul>
              )}
            </section>
          </div>
        </div>

      </div>

      {showNew && (
        <Modal title="Novo lead" subtitle="Registe o primeiro contacto do cliente." onClose={() => setShowNew(false)}>
          <LeadForm submitLabel="Guardar lead" pending={pending} onCancel={() => setShowNew(false)}
            onSubmit={(fd) => run(createLeadBoard(fd), "Lead criado.", () => setShowNew(false))} />
        </Modal>
      )}
      {detail && (
        <Modal title={`${TYPES[typeOf(detail.event_type)].label} – ${detail.name}`} subtitle={`Etapa: ${STAGE_LABEL[detail.stage] ?? detail.stage}`} onClose={() => setDetail(null)}>
          <LeadForm lead={detail} submitLabel="Guardar alterações" pending={pending} readOnly={!canEdit} onCancel={() => setDetail(null)}
            onSubmit={(fd) => { fd.set("id", detail.id); run(updateLeadBoard(fd), "Lead atualizado.", () => setDetail(null)); }} />
          {canEdit && (
            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex flex-wrap gap-2 text-xs">
                {COLS.filter((c) => !(c.stages as readonly string[]).includes(detail.stage)).map((c) => (
                  <button key={c.key} disabled={pending} onClick={() => run(setLeadStageBoard(detail.id, c.target), `Movido para ${c.title}.`, () => setDetail(null))} className="rounded-lg border border-line px-3 py-2 hover:border-gold/50">→ {c.title}</button>
                ))}
                <Link href={`/agenda?lead=${detail.id}${detail.desired_date ? `&m=${detail.desired_date.slice(0, 7)}&d=${detail.desired_date.slice(0, 10)}` : ""}#nova`} className="rounded-lg border border-ok/50 px-3 py-2 text-emerald-300 hover:bg-ok/10">Reservar salão</Link>
                {detail.stage !== "perdido" && <button disabled={pending} onClick={() => run(setLeadStageBoard(detail.id, "perdido"), "Marcado como perdido.", () => setDetail(null))} className="rounded-lg border border-bad/50 px-3 py-2 text-red-300 hover:bg-bad/10">Perdido</button>}
              </div>
              <button disabled={pending} onClick={() => { if (confirm(`Eliminar o lead “${detail.name}”?`)) run(deleteLead(detail.id), "Lead eliminado.", () => setDetail(null)); }} className="text-xs text-red-400 hover:underline">Eliminar lead</button>
            </div>
          )}
        </Modal>
      )}
      {quote && (
        <Modal title={quote === "proposta" ? "Nova proposta" : "Enviar orçamento"} subtitle={quote === "proposta" ? "Escolha o lead e marque a proposta como enviada." : "Escolha o lead; abre o seu email com o orçamento preparado."} onClose={() => setQuote(null)}>
          <QuoteForm leads={all.filter((l) => l.stage !== "perdido")} mode={quote} pending={pending} mailtoOf={mailtoOf} onCancel={() => setQuote(null)}
            onPick={(id) => run(setLeadStageBoard(id, "proposta"), "Proposta marcada como enviada.", () => setQuote(null))} />
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

function LeadForm({ lead, submitLabel, pending, readOnly, onCancel, onSubmit }: { lead?: LeadVM; submitLabel: string; pending: boolean; readOnly?: boolean; onCancel: () => void; onSubmit: (fd: FormData) => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={lab}>Nome do cliente *</label><input name="name" required defaultValue={lead?.name} disabled={readOnly} className={field} /></div>
        <div><label className={lab}>Telefone</label><input name="phone" defaultValue={lead?.phone ?? ""} disabled={readOnly} className={field} /></div>
        <div><label className={lab}>Email</label><input name="email" type="email" defaultValue={lead?.email ?? ""} disabled={readOnly} className={field} /></div>
        <div><label className={lab}>Tipo de evento</label>
          <select name="event_type" defaultValue={lead?.event_type ?? "Casamento"} disabled={readOnly} className={field}>
            {["Casamento", "Corporativo", "Aniversário", "Infantil", "Batizado", "Outro"].map((t) => <option key={t} value={t}>{t}</option>)}
            {lead && !["Casamento", "Corporativo", "Aniversário", "Infantil", "Batizado", "Outro"].includes(lead.event_type) && <option value={lead.event_type}>{lead.event_type}</option>}
          </select></div>
        <div><label className={lab}>Data desejada</label><input name="desired_date" type="date" defaultValue={lead?.desired_date ?? ""} disabled={readOnly} className={`${field} [color-scheme:dark]`} /></div>
        <div><label className={lab}>Convidados</label><input name="guests" type="number" min="0" defaultValue={lead?.guests ?? ""} disabled={readOnly} className={field} /></div>
        <div><label className={lab}>Orçamento (Kz)</label><input name="budget" type="number" min="0" defaultValue={lead?.budget ?? ""} disabled={readOnly} className={field} /></div>
        <div className="sm:col-span-2"><label className={lab}>Origem do lead</label>
          <select name="source" defaultValue={lead?.source ?? ""} disabled={readOnly} className={field}><option value="">—</option>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="sm:col-span-2"><label className={lab}>Notas</label><textarea name="notes" rows={2} defaultValue={lead?.notes ?? ""} disabled={readOnly} className={field} /></div>
      </div>
      {!readOnly && (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : submitLabel}</button>
        </div>
      )}
    </form>
  );
}

function QuoteForm({ leads, mode, pending, mailtoOf, onCancel, onPick }: { leads: LeadVM[]; mode: "proposta" | "orcamento"; pending: boolean; mailtoOf: (l: LeadVM) => string | null; onCancel: () => void; onPick: (id: string) => void }) {
  const [id, setId] = useState(leads[0]?.id ?? "");
  const l = leads.find((x) => x.id === id);
  const href = l ? mailtoOf(l) : null;
  return (
    <div className="space-y-5">
      {leads.length === 0 ? <p className="text-sm text-slate-300">Não há leads ativos.</p> : (
        <div><label className={lab}>Lead</label>
          <select value={id} onChange={(e) => setId(e.target.value)} className={field}>{leads.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.event_type}{x.budget ? ` · ${kz(x.budget)}` : ""}</option>)}</select></div>
      )}
      {mode === "orcamento" && l && !href && <p className="text-xs text-amber-300">Este lead não tem email registado.</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
        {mode === "proposta"
          ? <button disabled={pending || !l} onClick={() => l && onPick(l.id)} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">Marcar proposta enviada</button>
          : href ? <a href={href} onClick={onCancel} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold">Abrir email</a>
            : <span className="rounded-lg border border-line px-5 py-2.5 text-sm text-slate-500">Abrir email</span>}
      </div>
    </div>
  );
}
