"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AttStatus, AttVM, EmpStatus, EmpVM } from "@/lib/hrBoard";
import { deleteEmployeeBoard, saveAttendanceBoard, saveEmployeeBoard, setEmployeeStatusBoard, type ActionResult } from "@/app/actions";
import { datePt, escHtml, kz } from "@/lib/format";
import * as I from "@/components/icons";

const VIEWS = [["geral", "Visão Geral"], ["funcionarios", "Funcionários"], ["presencas", "Presenças"], ["contratos", "Contratos"], ["departamentos", "Departamentos"], ["cargos", "Cargos"], ["relatorios", "Relatórios"]] as const;
type View = (typeof VIEWS)[number][0];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CTYPES = ["Efetivo", "Termo certo", "Prestação de serviços", "Estágio", "Outros"];
const ESTAT: Record<EmpStatus, { label: string; solid: string }> = {
  ativo: { label: "Activo", solid: "bg-[#16a34a] text-white" }, ferias: { label: "Férias", solid: "bg-[#f0a91c] text-[#1a1305]" },
  suspenso: { label: "Suspenso", solid: "bg-[#8a2a2f] text-white" }, desligado: { label: "Desligado", solid: "bg-[#4b5563] text-white" },
};
const ASTAT: Record<AttStatus, { label: string; solid: string; color: string }> = {
  presente: { label: "Presente", solid: "bg-[#16a34a] text-white", color: "#22a35a" }, atraso: { label: "Atraso", solid: "bg-[#f0a91c] text-[#1a1305]", color: "#e0a122" },
  falta: { label: "Falta", solid: "bg-[#e5484d] text-white", color: "#e5484d" }, justificada: { label: "Justificada", solid: "bg-[#6b7a90] text-white", color: "#8794ad" },
  ferias: { label: "Férias", solid: "bg-[#8b5cf6] text-white", color: "#8b5cf6" }, folga: { label: "Folga", solid: "bg-[#0f8a8a] text-white", color: "#f5c04a" },
};
const DEPT_COLORS = ["#8b5cf6", "#f0643a", "#3b82f6", "#e0a122", "#22a35a", "#6b5cf6", "#8794ad"];
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials = (n: string) => n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const fld = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

function Bars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return <div className="flex h-8 items-end gap-[2px]" aria-hidden>{values.map((v, i) => <i key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: 0.4 + (i / values.length) * 0.6 }} />)}</div>;
}
function Donut({ parts, size = 140, stroke = 18 }: { parts: { v: number; c: string }[]; size?: number; stroke?: number }) {
  const R = size / 2 - stroke, C = 2 * Math.PI * R, total = parts.reduce((s, p) => s + p.v, 0);
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="#1b2740" strokeWidth={stroke} />
      {total > 0 && parts.filter((p) => p.v > 0).map((p, i) => { const len = (p.v / total) * C; const el = <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={p.c} strokeWidth={stroke} strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />; acc += len; return el; })}
    </svg>
  );
}
const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.34, background: `linear-gradient(140deg, ${colorOf(name)}, ${colorOf(name)}66)` }}>{initials(name)}</span>
);

export default function HrBoard({ employees, attendance, canEdit, today, monthStart, needsMigration }: { employees: EmpVM[]; attendance: AttVM[]; canEdit: boolean; today: string; monthStart: string; needsMigration: boolean }) {
  const [view, setView] = useState<View>("geral");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [filters, setFilters] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState<null | { emp?: EmpVM; contract?: boolean }>(null);
  const [attForm, setAttForm] = useState<null | { employee?: string; status?: AttStatus }>(null);
  const [vacations, setVacations] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();
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

  const active = employees.filter((e) => e.status !== "desligado");
  const total = active.length;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const attOn = (day: string) => attendance.filter((a) => a.day === day && byId.get(a.employee_id)?.status !== "desligado");
  const todayAtt = attOn(today);
  const yest = new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10);
  const cnt = (list: AttVM[], ...s: AttStatus[]) => list.filter((a) => s.includes(a.status)).length;
  const presentes = cnt(todayAtt, "presente", "atraso"), faltas = cnt(todayAtt, "falta"), atrasos = cnt(todayAtt, "atraso"), folgas = cnt(todayAtt, "folga", "ferias");
  const rate = total ? Math.round((presentes / total) * 100) : 0;
  const rateY = total ? Math.round((cnt(attOn(yest), "presente", "atraso") / total) * 100) : 0;
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const payroll = active.reduce((s, e) => s + (e.salary ?? 0), 0);
  const prevActive = active.filter((e) => !e.hire_date || e.hire_date < monthStart);
  const payrollPrev = prevActive.reduce((s, e) => s + (e.salary ?? 0), 0);
  const expiring = employees.filter((e) => e.status !== "desligado" && e.contract_end && dayDiff(e.contract_end, today) >= 0 && dayDiff(e.contract_end, today) <= 30);
  const spark = (f: (d: string) => number) => Array.from({ length: 14 }, (_, i) => f(new Date(Date.parse(today) - (13 - i) * 864e5).toISOString().slice(0, 10)));

  const kpis = [
    { n: String(total), t: "Funcionários", icon: I.Users, c: "from-[#1a63e0] to-[#0f3a8a]", d: pct(total, prevActive.length), good: true, note: "vs. mês anterior", bars: spark(() => total), col: "#2f7bf5", sub: null as string | null },
    { n: String(presentes), t: "Presentes Hoje", icon: I.Users, c: "from-[#16a34a] to-[#0d5c2b]", d: null, good: true, note: "", sub: `${rate}% de presença`, bars: spark((d) => cnt(attOn(d), "presente", "atraso")), col: "#22a35a" },
    { n: String(expiring.length), t: "Contratos a Vencer", icon: I.File, c: "from-[#b8862b] to-[#6a4a12]", d: null, good: false, note: "", sub: "nos próximos 30 dias", bars: spark(() => expiring.length), col: "#e0a122" },
    { n: String(faltas), t: "Faltas Hoje", icon: I.Alert, c: "from-[#e5484d] to-[#7a1f23]", d: pct(faltas, cnt(attOn(yest), "falta")), good: false, note: "vs. ontem", sub: null, bars: spark((d) => cnt(attOn(d), "falta")), col: "#e5484d" },
    { n: kz(payroll), t: "Custos com Pessoal (Mês)", icon: I.Coins, c: "from-[#7c3aed] to-[#3b1d85]", d: pct(payroll, payrollPrev), good: false, note: "vs. mês anterior", sub: null, bars: spark(() => payroll), col: "#8b5cf6" },
  ];

  // Departamentos, contratos
  const depts = [...new Set(active.map((e) => e.department))].map((d) => ({ d, n: active.filter((e) => e.department === d).length })).sort((a, b) => b.n - a.n);
  const ctypes = [...new Set(active.map((e) => e.contract_type))].map((c) => ({ c, n: active.filter((e) => e.contract_type === c).length })).sort((a, b) => b.n - a.n);
  const positions = [...new Set(active.map((e) => e.position))].map((p) => { const l = active.filter((e) => e.position === p); const s = l.filter((e) => e.salary); return { p, n: l.length, avg: s.length ? s.reduce((a, e) => a + (e.salary ?? 0), 0) / s.length : null }; }).sort((a, b) => b.n - a.n);

  // Listas
  const q = query.trim().toLowerCase();
  const list = employees.filter((e) => (estado === "todos" ? e.status !== "desligado" || false : e.status === estado) && (dept === "todos" || e.department === dept) &&
    (!q || `${e.name} ${e.position} ${e.department} ${e.contract_type}`.toLowerCase().includes(q)));
  const todayRows = active.map((e) => ({ e, a: todayAtt.find((x) => x.employee_id === e.id) })).sort((a, b) => (a.a ? 0 : 1) - (b.a ? 0 : 1) || a.e.name.localeCompare(b.e.name, "pt"));
  const nowMin = (() => { const d = new Date(Date.now() + 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  const duration = (a?: AttVM) => (a?.check_in ? hhmm(Math.max(0, (a.check_out ? mins(a.check_out) : nowMin) - mins(a.check_in))) : "—");
  const risk = (days: number) => (days <= 7 ? ["Em risco", "bg-[#e5484d] text-white"] : days <= 15 ? ["Atenção", "bg-[#f0a91c] text-[#1a1305]"] : ["Normal", "bg-[#16a34a] text-white"]);
  const contractRows = employees.filter((e) => e.status !== "desligado" && e.contract_end).map((e) => ({ e, days: dayDiff(e.contract_end as string, today) })).sort((a, b) => a.days - b.days);
  const monthNum = Number(today.slice(5, 7));
  const birthdays = active.filter((e) => e.birth_date && Number(e.birth_date.slice(5, 7)) === monthNum).sort((a, b) => Number((a.birth_date as string).slice(8)) - Number((b.birth_date as string).slice(8)));
  const admissions = [...active].filter((e) => e.hire_date).sort((a, b) => ((a.hire_date as string) < (b.hire_date as string) ? 1 : -1));

  // Resumo mensal de presenças
  const monthRows = active.map((e) => {
    const l = attendance.filter((a) => a.employee_id === e.id && a.day.startsWith(month));
    return { e, p: cnt(l, "presente"), at: cnt(l, "atraso"), f: cnt(l, "falta"), j: cnt(l, "justificada"), fe: cnt(l, "ferias") };
  });

  const exportCsv = () => {
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const lines = list.map((e) => [e.name, e.department, e.position, ESTAT[e.status].label, e.contract_type, e.hire_date, e.contract_end, e.salary].map(esc).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [["Nome", "Departamento", "Cargo", "Estado", "Contrato", "Início", "Fim do contrato", "Salário"].map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "funcionarios.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  const report = () => {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return setToast({ tone: "erro", text: "Permita janelas pop-up para gerar o relatório." });
    const row = (a: string, b: string) => `<tr><td>${escHtml(a)}</td><td style="text-align:right">${escHtml(b)}</td></tr>`;
    w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Relatório de RH</title><style>body{font-family:Georgia,serif;margin:44px;color:#111}h2{margin-top:26px;font-size:18px}table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px solid #ddd;font-size:14px}small{color:#555}</style></head><body>
      <small>BUSINESS CENTER ESPERANÇA · Recursos Humanos</small><h1 style="margin:0">Relatório de RH</h1><small>${datePt(today)}</small>
      <h2>Resumo</h2><table>${row("Funcionários activos", String(total))}${row("Presentes hoje", `${presentes} (${rate}%)`)}${row("Faltas hoje", String(faltas))}${row("Atrasos hoje", String(atrasos))}${row("Contratos a vencer (30 dias)", String(expiring.length))}${row("Custos com pessoal (mês)", kz(payroll))}</table>
      <h2>Por departamento</h2><table>${depts.map((x) => row(x.d, String(x.n))).join("")}</table>
      <h2>Contratos a vencer</h2><table>${expiring.map((e) => row(`${e.name} (${e.contract_type})`, datePt(e.contract_end as string))).join("") || row("—", "—")}</table>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  const kebab = (id: string, children: React.ReactNode) => (
    <div className="relative">
      <button onClick={() => setMenu(menu === id ? null : id)} aria-label="Mais ações" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>
      {menu === id && <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">{children}</div>}
    </div>
  );
  const mi = "block w-full px-4 py-2.5 text-left hover:bg-white/5";
  const panel = "rounded-2xl border border-line bg-panel/90 p-4";
  const empRowActions = (e: EmpVM) => (
    <div className="flex items-center gap-1.5">
      <button onClick={() => setEmpForm({ emp: e })} aria-label="Ver / editar" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Eye className="size-4" /></button>
      {canEdit && <button onClick={() => setEmpForm({ emp: e })} aria-label="Editar" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Pencil className="size-4" /></button>}
      {canEdit && kebab(`e${e.id}`, <>
        {(["ativo", "ferias", "suspenso", "desligado"] as EmpStatus[]).filter((s) => s !== e.status).map((s) => <button key={s} className={mi} disabled={pending} onClick={() => { setMenu(null); run(setEmployeeStatusBoard(e.id, s), `${e.name}: ${ESTAT[s].label}.`); }}>Marcar como {ESTAT[s].label.toLowerCase()}</button>)}
        <button className={mi} onClick={() => { setMenu(null); setAttForm({ employee: e.id }); }}>Registar presença</button>
        <button className={`${mi} text-red-400`} onClick={() => { setMenu(null); if (confirm(`Eliminar ${e.name}? As presenças deste funcionário também serão apagadas.`)) run(deleteEmployeeBoard(e.id), "Funcionário eliminado."); }}>Eliminar</button></>)}
    </div>
  );

  const empTable = (rows: EmpVM[], showAll: boolean, key: string) => {
    const shown = showAll || expanded[key] ? rows : rows.slice(0, 6);
    return (
      <>
        {shown.length === 0 ? <p className="py-10 text-center text-sm text-muted">{employees.length === 0 ? "Ainda não há funcionários registados." : "Nenhum funcionário corresponde aos filtros."}</p> : (
          <div className="overflow-x-auto"><table className="min-w-[760px]">
            <thead className="bg-white/[0.04]"><tr><th className="pl-3 pt-2.5">Foto</th><th className="pt-2.5">Nome</th><th className="pt-2.5">Departamento</th><th className="pt-2.5">Cargo</th><th className="pt-2.5">Estado</th><th className="pt-2.5">Tipo de Contrato</th><th className="pt-2.5">Data de Início</th><th className="pt-2.5">Ações</th></tr></thead>
            <tbody>{shown.map((e) => (
              <tr key={e.id} className="border-t border-line/70">
                <td className="pl-3"><Avatar name={e.name} /></td><td className="text-[13px] font-medium">{e.name}</td><td className="text-[13px]">{e.department}</td><td className="text-[13px]">{e.position}</td>
                <td><span className={`inline-block min-w-[4.4rem] rounded px-2 py-1.5 text-center text-xs font-medium ${ESTAT[e.status].solid}`}>{ESTAT[e.status].label}</span></td>
                <td className="text-[13px]">{e.contract_type}</td><td className="whitespace-nowrap text-[13px]">{e.hire_date ? datePt(e.hire_date) : "—"}</td><td>{empRowActions(e)}</td>
              </tr>))}</tbody></table></div>
        )}
        {!showAll && rows.length > 6 && <button onClick={() => setExpanded((x) => ({ ...x, [key]: !x[key] }))} className="mt-2 text-xs text-gold hover:underline">{expanded[key] ? "Mostrar menos" : `Ver todos (${rows.length})`}</button>}
      </>
    );
  };

  const presenceTable = (showAll: boolean) => {
    const shown = showAll || expanded.pres ? todayRows : todayRows.slice(0, 6);
    return (
      <>
        {shown.length === 0 ? <p className="py-8 text-center text-xs text-muted">Sem funcionários activos.</p> : (
          <table>
            <thead><tr><th className="pt-1">Funcionário</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Estado</th><th /></tr></thead>
            <tbody>{shown.map(({ e, a }) => (
              <tr key={e.id} className="border-t border-line/70">
                <td><div className="flex items-center gap-2"><Avatar name={e.name} size={28} /><span className="max-w-[7rem] truncate text-[12px] font-medium">{e.name}</span></div></td>
                <td className="text-[12px]">{a?.check_in ?? "-"}</td><td className="text-[12px]">{a?.check_out ?? "-"}</td><td className="whitespace-nowrap text-[12px]">{duration(a)}</td>
                <td>{a ? <span className={`inline-block min-w-[4.6rem] rounded px-2 py-1 text-center text-[11px] font-medium ${ASTAT[a.status].solid}`}>{ASTAT[a.status].label}</span> : <span className="text-[11px] text-slate-500">Sem registo</span>}</td>
                <td>{canEdit && <button onClick={() => setAttForm({ employee: e.id })} aria-label="Registar presença" className="grid size-7 place-items-center rounded-md hover:bg-white/10"><I.Plus className="size-4" /></button>}</td>
              </tr>))}</tbody>
          </table>
        )}
        {!showAll && todayRows.length > 6 && <button onClick={() => setExpanded((x) => ({ ...x, pres: !x.pres }))} className="mt-2 text-xs text-gold hover:underline">{expanded.pres ? "Mostrar menos" : `Ver todos (${todayRows.length})`}</button>}
      </>
    );
  };

  const contractTable = (all: boolean) => {
    const shown = all || expanded.ctr ? contractRows : contractRows.slice(0, 5);
    return shown.length === 0 ? <p className="py-6 text-center text-xs text-muted">Nenhum contrato com data de fim registada.</p> : (
      <>
        <table>
          <thead><tr><th className="pt-1">Funcionário</th><th>Tipo de Contrato</th><th>Data de Fim</th><th>Dias</th><th>Estado</th></tr></thead>
          <tbody>{shown.map(({ e, days }) => { const [l, c] = risk(days); return (
            <tr key={e.id} className="border-t border-line/70"><td className="max-w-[7rem] truncate text-[12px]">{e.name}</td><td className="text-[12px] text-slate-300">{e.contract_type}</td>
              <td className="whitespace-nowrap text-[12px]">{datePt(e.contract_end as string)}</td><td className="text-[12px]">{days}</td>
              <td><span className={`inline-block min-w-[4.4rem] rounded px-2 py-1 text-center text-[11px] font-medium ${days < 0 ? "bg-[#4b5563] text-white" : c}`}>{days < 0 ? "Terminado" : l}</span></td></tr>); })}</tbody>
        </table>
        {!all && contractRows.length > 5 && <button onClick={() => setExpanded((x) => ({ ...x, ctr: !x.ctr }))} className="mt-2 text-xs text-gold hover:underline">{expanded.ctr ? "Mostrar menos" : `Ver todos (${contractRows.length})`}</button>}
      </>
    );
  };

  const deptDonut = (
    <section className={panel}>
      <h2 className="mb-3 flex items-center gap-2 font-medium"><I.Building className="size-4 text-gold" />Funcionários por Departamento</h2>
      <div className="flex items-center gap-4">
        <div className="relative size-[140px] shrink-0"><Donut parts={depts.map((x, i) => ({ v: x.n, c: DEPT_COLORS[i % DEPT_COLORS.length] }))} />
          <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-2xl font-semibold">{total}</div><div className="text-[10px] text-slate-400">Total</div></div></div></div>
        <ul className="flex-1 space-y-1.5 text-xs">{depts.slice(0, 7).map((x, i) => <li key={x.d} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length] }} /><span className="flex-1 truncate text-slate-200">{x.d}</span><b>{x.n}</b><span className="w-10 text-right text-slate-400">({total ? Math.round((x.n / total) * 100) : 0}%)</span></li>)}</ul>
      </div>
    </section>
  );
  const rateDonut = (
    <section className={panel}>
      <h2 className="mb-3 flex items-center gap-2 font-medium"><I.Clock className="size-4 text-gold" />Taxa de Presença</h2>
      <div className="flex items-center gap-4">
        <div className="relative size-[140px] shrink-0"><Donut parts={[{ v: presentes - atrasos, c: "#22a35a" }, { v: faltas, c: "#e5484d" }, { v: atrasos, c: "#e0a122" }, { v: folgas, c: "#f5c04a" }]} />
          <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-2xl font-semibold">{rate}%</div>{pct(rate, rateY) !== null && <div className={`text-[10px] ${(pct(rate, rateY) as number) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{(pct(rate, rateY) as number) >= 0 ? "↑" : "↓"} {Math.abs(pct(rate, rateY) as number)}%</div>}</div></div></div>
        <ul className="flex-1 space-y-2 text-xs">
          {([["Presentes", presentes, "#22a35a"], ["Faltas", faltas, "#e5484d"], ["Atrasos", atrasos, "#e0a122"], ["Folgas / Férias", folgas, "#f5c04a"]] as const).map(([l, n, c]) => (
            <li key={l} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: c }} /><span className="flex-1 text-slate-200">{l}</span><b>{n}</b><span className="w-10 text-right text-slate-400">({total ? Math.round((n / total) * 100) : 0}%)</span></li>))}
        </ul>
      </div>
    </section>
  );
  const typeDonut = (
    <section className={panel}>
      <h2 className="mb-3 flex items-center gap-2 font-medium"><I.File className="size-4 text-gold" />Tipos de Contrato</h2>
      <div className="flex items-center gap-4">
        <div className="relative size-[140px] shrink-0"><Donut parts={ctypes.map((x, i) => ({ v: x.n, c: DEPT_COLORS[(i + 2) % DEPT_COLORS.length] }))} />
          <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-2xl font-semibold">{total}</div><div className="text-[10px] text-slate-400">Total</div></div></div></div>
        <ul className="flex-1 space-y-1.5 text-xs">{ctypes.map((x, i) => <li key={x.c} className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: DEPT_COLORS[(i + 2) % DEPT_COLORS.length] }} /><span className="flex-1 truncate text-slate-200">{x.c}</span><b>{x.n}</b><span className="w-10 text-right text-slate-400">({total ? Math.round((x.n / total) * 100) : 0}%)</span></li>)}</ul>
      </div>
    </section>
  );

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-4 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-rh.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/15 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl leading-none md:text-6xl">Recursos Humanos</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Gestão completa de funcionários, presenças e contratos do Business Center Esperança.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-[#07121b]/85 px-3.5 py-2 text-sm backdrop-blur"><I.Calendar className="size-5 text-slate-200" /><div className="leading-tight"><div className="text-[13px]">{Number(today.slice(8))} {MONTHS[monthNum - 1]} {today.slice(0, 4)}</div><div className="text-[11px] text-slate-400">{["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][new Date(today + "T00:00:00Z").getUTCDay()]}</div></div></div>
            {canEdit && <button onClick={() => setEmpForm({})} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Novo Funcionário</button>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xl font-semibold leading-tight">{k.n}</div>
                <div className="truncate text-xs text-slate-200">{k.t}</div>
                <div className="mb-1 h-4 truncate text-[11px]">{k.d !== null ? <><span className={(k.good ? k.d >= 0 : k.d <= 0) ? "text-emerald-400" : "text-red-400"}>{k.d >= 0 ? "↑" : "↓"} {Math.abs(k.d)}%</span> <span className="text-slate-400">{k.note}</span></> : <span className="text-amber-300">{k.sub}</span>}</div>
                <Bars values={k.bars} color={k.col} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {needsMigration && <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-amber-200">Para horas de entrada/saída, fim de contrato e aniversários, execute a migração <b>0017_hr.sql</b> no Supabase.</p>}
      {employees.length === 0 && <p className="rounded-xl border border-line bg-panel/80 px-4 py-3 text-sm text-slate-300">Sem funcionários visíveis. Apenas os papéis RH e super admin acedem a esta área.</p>}

      {/* ───── Separadores ───── */}
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`rounded-lg border px-5 py-2.5 text-sm transition-colors ${view === k ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>{l}</button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-panel/80 px-3 text-sm"><I.Calendar className="size-4 text-slate-300" />
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês" className="bg-transparent pr-1 outline-none">
              {Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), monthNum - 1 - i, 1)); const k = d.toISOString().slice(0, 7); return <option key={k} value={k} className="bg-[#07121b]">{MONTHS[d.getUTCMonth()]} {d.getUTCFullYear()}</option>; })}
            </select></label>
          <button onClick={() => setFilters(!filters)} className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm ${filters ? "border-gold bg-gold/10 text-gold-soft" : "border-gold/50 text-gold-soft hover:bg-gold/10"}`}><I.Filter className="size-4" />Filtros</button>
        </div>
      </div>
      {filters && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4" ref={boxRef}>
          <label className="min-w-[14rem] flex-1 text-xs text-slate-400">Pesquisar<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, cargo, departamento…" className="mt-1 block h-10 w-full rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
          <label className="text-xs text-slate-400">Departamento<select value={dept} onChange={(e) => setDept(e.target.value)} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100"><option value="todos">Todos</option>{[...new Set(employees.map((e) => e.department))].map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label className="text-xs text-slate-400">Estado<select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block h-10 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100"><option value="todos">Todos (sem desligados)</option>{(Object.keys(ESTAT) as EmpStatus[]).map((s) => <option key={s} value={s}>{ESTAT[s].label}</option>)}</select></label>
          <button onClick={() => { setQuery(""); setDept("todos"); setEstado("todos"); }} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar</button>
        </div>
      )}

      {/* ───── Visão geral ───── */}
      {view === "geral" && (
        <div ref={boxRef} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">{deptDonut}{rateDonut}{typeDonut}</div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className={panel}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-medium"><I.Users className="size-4 text-gold" />Funcionários ({list.length})</h2>
                <div className="flex gap-2">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar funcionário…" className="h-9 w-44 rounded-lg border border-line bg-panel pl-3 text-xs outline-none focus:border-gold" />
                  <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Departamento" className="h-9 rounded-lg border border-line bg-panel px-2 text-xs outline-none"><option value="todos">Todos os departamentos</option>{[...new Set(employees.map((e) => e.department))].map((d) => <option key={d} value={d}>{d}</option>)}</select>
                </div></div>
              {empTable(list, false, "emp")}
            </section>
            <section className={panel}>
              <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><I.Clock className="size-4 text-gold" />Presenças de Hoje ({presentes}/{total})</h2>
                {canEdit && <button onClick={() => setAttForm({})} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-gold/50">Registar</button>}</div>
              {presenceTable(false)}
            </section>
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[1.25fr_1fr_1fr_1fr]">
            <section className={panel}><h2 className="mb-3 flex items-center gap-2 font-medium"><I.File className="size-4 text-gold" />Contratos a Vencer ({expiring.length})</h2>{contractTable(false)}</section>
            <section className={panel}>
              <h2 className="mb-3 flex items-center gap-2 font-medium"><I.Heart className="size-4 text-gold" />Aniversariantes do Mês ({birthdays.length})</h2>
              {birthdays.length === 0 ? <p className="py-6 text-center text-xs text-muted">Sem aniversários este mês.</p> : (
                <ul className="space-y-2.5">{birthdays.slice(0, 5).map((e) => <li key={e.id} className="flex items-center gap-2.5 text-xs"><Avatar name={e.name} size={30} /><span className="min-w-0 flex-1 truncate text-[12px] font-medium">{e.name}</span><span className="text-slate-300">{dm(e.birth_date as string)}</span><span className="hidden max-w-[5rem] truncate text-slate-500 2xl:block">{e.department}</span><I.Heart className="size-4 text-gold" /></li>)}</ul>
              )}
            </section>
            <section className={panel}>
              <h2 className="mb-3 flex items-center gap-2 font-medium"><I.Users className="size-4 text-gold" />Admissões Recentes ({Math.min(4, admissions.length)})</h2>
              {admissions.length === 0 ? <p className="py-6 text-center text-xs text-muted">Sem admissões registadas.</p> : (
                <ul className="space-y-2.5">{admissions.slice(0, 4).map((e) => <li key={e.id} className="flex items-center gap-2.5 text-xs"><Avatar name={e.name} size={30} /><span className="min-w-0 flex-1 truncate text-[12px] font-medium">{e.name}</span><span className="text-slate-300">{dm(e.hire_date as string)}</span><span className="hidden max-w-[5rem] truncate text-slate-500 2xl:block">{e.department}</span></li>)}</ul>
              )}
            </section>
            <section className={panel}>
              <h2 className="mb-3 flex items-center gap-2 font-medium"><I.Alert className="size-4 text-gold" />Ações Rápidas</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Novo Funcionário", icon: I.Plus, f: () => setEmpForm({}), edit: true, gold: true }, { l: "Registar Presença", icon: I.Clock, f: () => setAttForm({}), edit: true },
                  { l: "Novo Contrato", icon: I.File, f: () => setEmpForm({ contract: true }), edit: true }, { l: "Gerar Relatório", icon: I.Chart, f: report },
                  { l: "Calendário de Férias", icon: I.Calendar, f: () => setVacations(true) }, { l: "Exportar Dados", icon: I.Download, f: exportCsv },
                ].map((a) => (
                  <button key={a.l} onClick={a.f} disabled={a.edit && !canEdit} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-center text-[11px] transition disabled:opacity-40 ${a.gold ? "border-gold/40 bg-gold/10 text-gold-soft hover:bg-gold/20" : "border-line bg-[#041019] hover:border-gold/50"}`}><a.icon className="size-4 shrink-0" />{a.l}</button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {view === "funcionarios" && <section className={panel} ref={boxRef}><div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Funcionários ({list.length})</h2><button onClick={exportCsv} className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Download className="size-4" />Exportar</button></div>{empTable(list, true, "emp")}</section>}

      {view === "presencas" && (
        <div className="space-y-4" ref={boxRef}>
          <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Presenças de Hoje ({presentes}/{total})</h2>{canEdit && <button onClick={() => setAttForm({})} className="btn-gold rounded-lg px-4 py-2 text-xs font-semibold">Registar presença</button>}</div>{presenceTable(true)}</section>
          <section className={panel}>
            <h2 className="mb-3 font-medium">Resumo de {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</h2>
            <div className="overflow-x-auto"><table className="min-w-[560px]">
              <thead><tr><th>Funcionário</th><th>Presentes</th><th>Atrasos</th><th>Faltas</th><th>Justificadas</th><th>Férias</th></tr></thead>
              <tbody>{monthRows.map((r) => <tr key={r.e.id} className="border-t border-line/70"><td className="text-[13px]">{r.e.name}</td><td>{r.p}</td><td className={r.at ? "text-amber-300" : ""}>{r.at}</td><td className={r.f ? "text-red-400" : ""}>{r.f}</td><td>{r.j}</td><td>{r.fe}</td></tr>)}</tbody>
            </table></div>
          </section>
        </div>
      )}

      {view === "contratos" && (
        <div className="space-y-4">
          <section className={panel}><div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Contratos RH ({contractRows.length})</h2>{canEdit && <button onClick={() => setEmpForm({ contract: true })} className="btn-gold rounded-lg px-4 py-2 text-xs font-semibold">Novo contrato</button>}</div>{contractTable(true)}</section>
          <section className={panel}><h2 className="mb-3 font-medium">Sem data de fim ({employees.filter((e) => e.status !== "desligado" && !e.contract_end).length})</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{employees.filter((e) => e.status !== "desligado" && !e.contract_end).map((e) => <li key={e.id} className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 text-xs"><Avatar name={e.name} size={30} /><span className="flex-1 truncate">{e.name}<br /><span className="text-slate-500">{e.contract_type}</span></span>{canEdit && <button onClick={() => setEmpForm({ emp: e, contract: true })} className="text-gold hover:underline">Definir</button>}</li>)}</ul></section>
        </div>
      )}

      {view === "departamentos" && (
        <section className={panel}><h2 className="mb-3 font-medium">Departamentos</h2>
          <div className="overflow-x-auto"><table className="min-w-[560px]"><thead><tr><th>Departamento</th><th>Funcionários</th><th>Presentes hoje</th><th>Massa salarial</th></tr></thead>
            <tbody>{depts.map((x) => { const ids = active.filter((e) => e.department === x.d); return <tr key={x.d} className="border-t border-line/70"><td className="text-[13px] font-medium">{x.d}</td><td>{x.n}</td><td>{todayAtt.filter((a) => ids.some((e) => e.id === a.employee_id) && (a.status === "presente" || a.status === "atraso")).length}</td><td>{kz(ids.reduce((s, e) => s + (e.salary ?? 0), 0))}</td></tr>; })}</tbody></table></div></section>
      )}
      {view === "cargos" && (
        <section className={panel}><h2 className="mb-3 font-medium">Cargos</h2>
          <div className="overflow-x-auto"><table className="min-w-[480px]"><thead><tr><th>Cargo</th><th>Funcionários</th><th>Salário médio</th></tr></thead>
            <tbody>{positions.map((x) => <tr key={x.p} className="border-t border-line/70"><td className="text-[13px] font-medium">{x.p}</td><td>{x.n}</td><td>{x.avg != null ? kz(x.avg) : "—"}</td></tr>)}</tbody></table></div></section>
      )}
      {view === "relatorios" && (
        <section className={panel}><h2 className="mb-3 font-medium">Relatórios</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <button onClick={report} className="flex h-20 items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 text-sm text-gold-soft hover:bg-gold/20"><I.Chart className="size-5" />Relatório geral (imprimir / PDF)</button>
            <button onClick={exportCsv} className="flex h-20 items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-sm hover:border-gold/50"><I.Download className="size-5" />Exportar funcionários (CSV)</button>
            <button onClick={() => setVacations(true)} className="flex h-20 items-center justify-center gap-2 rounded-xl border border-line bg-[#041019] text-sm hover:border-gold/50"><I.Calendar className="size-5" />Calendário de férias</button>
          </div></section>
      )}

      {empForm && <EmployeeModal init={empForm} pending={pending} canEdit={canEdit} onClose={() => setEmpForm(null)} onSubmit={(fd) => run(saveEmployeeBoard(fd), empForm.contract ? "Contrato guardado." : "Funcionário guardado.", () => setEmpForm(null))} />}
      {attForm && <AttendanceModal init={attForm} employees={active} today={today} existing={todayAtt} pending={pending} onClose={() => setAttForm(null)} onSubmit={(fd) => run(saveAttendanceBoard(fd), "Presença registada.", () => setAttForm(null))} />}
      {vacations && (
        <Modal title="Calendário de férias" subtitle={`${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`} onClose={() => setVacations(false)}>
          {(() => {
            const rows = active.map((e) => ({ e, days: attendance.filter((a) => a.employee_id === e.id && a.status === "ferias" && a.day.startsWith(month)).map((a) => Number(a.day.slice(8))).sort((a, b) => a - b) })).filter((r) => r.days.length || r.e.status === "ferias");
            return rows.length === 0 ? <p className="text-sm text-slate-300">Sem férias registadas neste mês.</p> : (
              <ul className="space-y-2">{rows.map(({ e, days }) => <li key={e.id} className="flex items-center justify-between rounded-xl border border-line p-3 text-sm"><span>{e.name}<br /><span className="text-xs text-slate-400">{e.department}</span></span><span className="text-xs text-slate-300">{days.length ? `Dias: ${days.join(", ")}` : "Em férias (estado actual)"}</span></li>)}</ul>
            );
          })()}
        </Modal>
      )}
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 className="font-serif text-3xl">{title}</h2>{subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function EmployeeModal({ init, pending, canEdit, onClose, onSubmit }: { init: { emp?: EmpVM; contract?: boolean }; pending: boolean; canEdit: boolean; onClose: () => void; onSubmit: (fd: FormData) => void }) {
  const e = init.emp;
  return (
    <Modal title={init.contract ? "Contrato" : e ? e.name : "Novo funcionário"} subtitle={init.contract ? "Tipo, datas e salário do contrato." : "Os mesmos dados servem presenças e contratos."} onClose={onClose}>
      <form onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); if (e) fd.set("id", e.id); onSubmit(fd); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {init.contract && !e ? (
            <p className="sm:col-span-2 rounded-lg border border-line p-3 text-xs text-slate-300">Para definir o contrato de um funcionário existente, abra-o na lista e use “Definir”. Para um novo funcionário, preencha os dados abaixo.</p>
          ) : null}
          <div className="sm:col-span-2"><label className={lab}>Nome completo *</label><input name="full_name" required defaultValue={e?.name} disabled={!canEdit} className={fld} /></div>
          <div><label className={lab}>Cargo *</label><input name="position" required defaultValue={e?.position} disabled={!canEdit} className={fld} /></div>
          <div><label className={lab}>Departamento</label><input name="department" defaultValue={e?.department ?? "Geral"} disabled={!canEdit} className={fld} /></div>
          <div><label className={lab}>Tipo de contrato</label>
            <select name="contract_type" defaultValue={e?.contract_type ?? "Efetivo"} disabled={!canEdit} className={fld}>{CTYPES.map((c) => <option key={c} value={c}>{c}</option>)}{e && !CTYPES.includes(e.contract_type) && <option value={e.contract_type}>{e.contract_type}</option>}</select></div>
          <div><label className={lab}>Estado</label><select name="status" defaultValue={e?.status ?? "ativo"} disabled={!canEdit} className={fld}>{(Object.keys(ESTAT) as EmpStatus[]).map((s) => <option key={s} value={s}>{ESTAT[s].label}</option>)}</select></div>
          <div><label className={lab}>Data de início</label><input name="hire_date" type="date" defaultValue={e?.hire_date ?? ""} disabled={!canEdit} className={`${fld} [color-scheme:dark]`} /></div>
          <div><label className={lab}>Fim do contrato</label><input name="contract_end" type="date" defaultValue={e?.contract_end ?? ""} disabled={!canEdit} className={`${fld} [color-scheme:dark]`} /></div>
          <div><label className={lab}>Salário mensal (Kz)</label><input name="salary" type="number" min="0" defaultValue={e?.salary ?? ""} disabled={!canEdit} className={fld} /></div>
          <div><label className={lab}>Data de nascimento</label><input name="birth_date" type="date" defaultValue={e?.birth_date ?? ""} disabled={!canEdit} className={`${fld} [color-scheme:dark]`} /></div>
          <div><label className={lab}>Telefone</label><input name="phone" defaultValue={e?.phone ?? ""} disabled={!canEdit} className={fld} /></div>
          <div><label className={lab}>Email</label><input name="email" type="email" defaultValue={e?.email ?? ""} disabled={!canEdit} className={fld} /></div>
          <div><label className={lab}>BI</label><input name="bi" defaultValue={e?.bi ?? ""} disabled={!canEdit} className={fld} /></div>
          <div><label className={lab}>NIF</label><input name="nif" defaultValue={e?.nif ?? ""} disabled={!canEdit} className={fld} /></div>
        </div>
        {canEdit && <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar"}</button></div>}
      </form>
    </Modal>
  );
}

function AttendanceModal({ init, employees, today, existing, pending, onClose, onSubmit }: { init: { employee?: string; status?: AttStatus }; employees: EmpVM[]; today: string; existing: AttVM[]; pending: boolean; onClose: () => void; onSubmit: (fd: FormData) => void }) {
  const [emp, setEmp] = useState(init.employee ?? employees[0]?.id ?? "");
  const [day, setDay] = useState(today);
  const cur = existing.find((a) => a.employee_id === emp && a.day === day);
  const [status, setStatus] = useState<AttStatus>(cur?.status ?? init.status ?? "presente");
  const needsTimes = status === "presente" || status === "atraso";
  return (
    <Modal title="Registar presença" subtitle="Cria ou atualiza o registo do funcionário nesse dia." onClose={onClose}>
      <form onSubmit={(ev) => { ev.preventDefault(); onSubmit(new FormData(ev.currentTarget)); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={lab}>Funcionário *</label><select name="employee_id" value={emp} onChange={(e) => setEmp(e.target.value)} required className={fld}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.department}</option>)}</select></div>
          <div><label className={lab}>Dia</label><input name="day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={`${fld} [color-scheme:dark]`} /></div>
          <div><label className={lab}>Estado</label><select name="status" value={status} onChange={(e) => setStatus(e.target.value as AttStatus)} className={fld}>{(Object.keys(ASTAT) as AttStatus[]).map((s) => <option key={s} value={s}>{ASTAT[s].label}</option>)}</select></div>
          {needsTimes && <>
            <div><label className={lab}>Entrada</label><input name="check_in" type="time" defaultValue={cur?.check_in ?? "08:00"} className={`${fld} [color-scheme:dark]`} /></div>
            <div><label className={lab}>Saída</label><input name="check_out" type="time" defaultValue={cur?.check_out ?? ""} className={`${fld} [color-scheme:dark]`} /></div>
          </>}
        </div>
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending || employees.length === 0} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Registar"}</button></div>
      </form>
    </Modal>
  );
}
