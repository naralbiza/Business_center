"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { DocCategory, DocType, DocVM } from "@/lib/documentsBoard";
import { deleteDocumentBoard, uploadDocumentsBoard, type ActionResult } from "@/app/actions";
import { datePt } from "@/lib/format";
import * as I from "@/components/icons";
import PdfImporter from "./PdfImporter";

const CAT: Record<DocCategory, { label: string; plural: string; bg: string }> = {
  empresa: { label: "Empresa", plural: "Empresas", bg: "#16a34a" },
  contrato: { label: "Contrato", plural: "Contratos", bg: "#a36a12" },
  financeiro: { label: "Financeiro", plural: "Financeiros", bg: "#7c3aed" },
  fiscal: { label: "Fiscal", plural: "Fiscais", bg: "#0f8a8a" },
  operacional: { label: "Operacional", plural: "Operacionais", bg: "#2563eb" },
  rh: { label: "RH", plural: "RH", bg: "#c2377a" },
  outro: { label: "Outro", plural: "Outros", bg: "#64748b" },
};
const TYPE: Record<DocType, { label: string; short: string; bg: string }> = {
  pdf: { label: "PDF", short: "PDF", bg: "#dc2626" },
  doc: { label: "DOC/DOCX", short: "DOC", bg: "#2563eb" },
  xls: { label: "XLS/XLSX", short: "XLS", bg: "#16a34a" },
  img: { label: "Imagens (JPG/PNG)", short: "IMG", bg: "#3b82f6" },
  outro: { label: "Outros", short: "FILE", bg: "#7c3aed" },
};
const STATUS: Record<string, { label: string; solid: string }> = {
  ativo: { label: "Activo", solid: "bg-[#16a34a] text-white" },
  pago: { label: "Pago", solid: "bg-[#16a34a] text-white" },
  pendente: { label: "Pendente", solid: "bg-[#e0a122] text-[#1a1305]" },
  arquivado: { label: "Arquivado", solid: "bg-[#4b5563] text-white" },
};
const TABS = [
  { key: "todos", label: "Todos" }, { key: "empresa", label: "Empresas" }, { key: "contrato", label: "Contratos" }, { key: "financeiro", label: "Financeiros" },
  { key: "fiscal", label: "Fiscais" }, { key: "operacional", label: "Operacionais" }, { key: "rh", label: "RH" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
type SortKey = "name" | "owner" | "date" | "size";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmtSize = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const pagesFor = (total: number, cur: number): (number | "…")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, 2, total, total - 1, cur - 1, cur, cur + 1]);
  const arr = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
};
const field = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";

function FileIcon({ type }: { type: DocType }) {
  const t = TYPE[type];
  return <span className="grid size-9 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: t.bg }}>{t.short}</span>;
}

export default function DocumentsBoard({ docs: all, companies, contracts, canEdit, needsMigration, monthStart }: {
  docs: DocVM[]; companies: { id: string; name: string; nif: string | null }[]; contracts: { id: string; number: string; company: string }[]; canEdit: boolean; needsMigration: boolean; monthStart: string;
}) {
  const [tab, setTab] = useState<TabKey>("todos");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [more, setMore] = useState(false);
  const [minMb, setMinMb] = useState("");
  const [maxMb, setMaxMb] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
      try { const r = await p; if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível concluir." }); }
      catch { setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." }); }
    });

  const total = all.length;
  const of = (c: DocCategory) => all.filter((d) => d.category === c);
  const growth = (list: DocVM[]) => { const before = list.filter((d) => d.created_at < monthStart).length; return before ? Math.round(((list.length - before) / before) * 100) : null; };
  const outros = all.filter((d) => ["fiscal", "operacional", "rh", "outro"].includes(d.category));
  const countTab = (k: TabKey) => (k === "todos" ? total : of(k as DocCategory).length);

  const q = norm(query.trim());
  const filtered = useMemo(() => {
    const list = all.filter((d) =>
      (tab === "todos" || d.category === tab) && (type === "todos" || d.type === type) && (status === "todos" || d.status === status) &&
      (!from || d.created_at.slice(0, 10) >= from) && (!to || d.created_at.slice(0, 10) <= to) &&
      (!minMb || d.size >= Number(minMb) * 1e6) && (!maxMb || d.size <= Number(maxMb) * 1e6) &&
      (!q || [d.name, d.owner, d.ownerSub, d.reference, d.tags].some((v) => v && norm(v).includes(q))));
    return [...list].sort((a, b) => {
      const v = (d: DocVM): string | number => sort.key === "name" ? d.name : sort.key === "owner" ? d.owner : sort.key === "date" ? d.created_at : d.size;
      const x = v(a), y = v(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt", { numeric: true })) * sort.dir;
    });
  }, [all, tab, type, status, from, to, minMb, maxMb, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const resetPage = () => setPage(1);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "date" ? -1 : 1 }));
  const th = (label: string, cls: string, k?: SortKey) => (
    <th className={cls}>{k ? <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-white">{label}<span className={`text-[9px] ${sort.key === k ? "text-gold" : "text-slate-500"}`}>{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}</span></button> : label}</th>
  );

  // Armazenamento, tipos e recentes
  const used = all.reduce((s, d) => s + d.size, 0);
  const capGb = Number(process.env.NEXT_PUBLIC_STORAGE_GB ?? 1) || 1;
  const usedPct = Math.min(100, Math.round((used / (capGb * 1e9)) * 100));
  const storBy = [
    { label: "Contratos", v: of("contrato").reduce((s, d) => s + d.size, 0), c: "#a36a12" },
    { label: "Financeiros", v: of("financeiro").reduce((s, d) => s + d.size, 0), c: "#7c3aed" },
    { label: "Empresas", v: of("empresa").reduce((s, d) => s + d.size, 0), c: "#16a34a" },
    { label: "Fiscais", v: of("fiscal").reduce((s, d) => s + d.size, 0), c: "#0f8a8a" },
    { label: "Outros", v: outros.filter((d) => d.category !== "fiscal").reduce((s, d) => s + d.size, 0), c: "#64748b" },
  ];
  const R = 46, C = 2 * Math.PI * R;
  const typeCounts = (Object.keys(TYPE) as DocType[]).map((t) => ({ t, n: all.filter((d) => d.type === t).length }));
  const maxType = Math.max(...typeCounts.map((x) => x.n), 1);
  const recent = [...all].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5);

  const exportCsv = () => {
    const list = checked.size ? filtered.filter((d) => checked.has(d.id)) : filtered;
    const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/^([=+@])/, "'$1").replace(/"/g, '""')}"`;
    const head = ["Documento", "Categoria", "Empresa", "Contrato", "Referência", "Data de envio", "Tamanho (bytes)", "Estado"];
    const lines = list.map((d) => [d.name, CAT[d.category].label, d.owner, d.ownerSub, d.reference, d.created_at.slice(0, 10), d.size, STATUS[d.status]?.label ?? d.status].map(esc).join(";"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "documentos.csv"; a.click(); URL.revokeObjectURL(a.href);
  };
  const clearFilters = () => { setQuery(""); setType("todos"); setStatus("todos"); setFrom(""); setTo(""); setMinMb(""); setMaxMb(""); setTab("todos"); resetPage(); };
  const delSelected = () => {
    if (!checked.size || !confirm(`Eliminar ${checked.size} documento(s)? Esta ação não pode ser desfeita.`)) return;
    start(async () => {
      let failed = 0;
      for (const d of all.filter((x) => checked.has(x.id))) { const r = await deleteDocumentBoard(d.id, d.path).catch(() => ({ ok: false })); if (!r.ok) failed++; }
      setChecked(new Set());
      setToast(failed ? { tone: "erro", text: `${failed} documento(s) não foram eliminados.` } : { tone: "ok", text: "Documentos eliminados." });
    });
  };

  const kpis = [
    { n: total, t: "Total de Documentos", icon: I.File, c: "from-[#2563eb] to-[#143a8a]", d: growth(all) },
    { n: of("empresa").length, t: "Documentos de Empresas", icon: I.Building, c: "from-[#16a34a] to-[#0d5c2b]", d: growth(of("empresa")) },
    { n: of("contrato").length, t: "Documentos de Contratos", icon: I.File, c: "from-[#b8862b] to-[#6a4a12]", d: growth(of("contrato")) },
    { n: of("financeiro").length, t: "Documentos Financeiros", icon: I.Coins, c: "from-[#7c3aed] to-[#3b1d85]", d: growth(of("financeiro")) },
    { n: outros.length, t: "Outros Documentos", icon: I.Folder, c: "from-[#6b7a90] to-[#3a4658]", d: growth(outros) },
  ];

  return (
    <>
      {/* ───── Abertura ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-5 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-doc.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/85 via-[#020b13]/25 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl leading-none md:text-6xl">Documentos</h1>
            <p className="mt-3 max-w-sm text-sm leading-snug text-slate-100">Gestão centralizada de todos os documentos do Business Center Esperança.</p>
          </div>
          {canEdit && <button onClick={() => setShowUpload(true)} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Enviar Documento</button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#07121b]/85 p-3.5 backdrop-blur">
              <span className={`grid size-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-6" /></span>
              <div className="min-w-0">
                <div className="text-3xl font-semibold leading-none">{k.n.toLocaleString("pt-PT")}</div>
                <div className="mt-1 truncate text-xs text-slate-200">{k.t}</div>
                {k.d !== null && <div className="mt-0.5 text-[11px]"><span className={k.d >= 0 ? "text-emerald-400" : "text-red-400"}>{k.d >= 0 ? "↑" : "↓"} {Math.abs(k.d)}%</span> <span className="text-slate-400">vs. mês anterior</span></div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {needsMigration && <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-amber-200">Para classificar documentos em categorias (Financeiros, Fiscais, Operacionais…), execute a migração <b>0013_documents_board.sql</b> no Supabase.</p>}

      {/* ───── Separadores ───── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); resetPage(); }}
            className={`rounded-lg border px-5 py-2.5 text-sm transition-colors ${tab === t.key ? "border-gold/60 bg-gradient-to-b from-[#f3e2b8] to-[#d6b06a] font-semibold text-[#1a1305]" : "border-line bg-panel/80 text-slate-100 hover:border-gold/40"}`}>
            {t.label} ({countTab(t.key).toLocaleString("pt-PT")})
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <I.Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-300" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); resetPage(); }} placeholder="Pesquisar por nome, empresa, contrato, tag…"
                className="h-11 w-full rounded-lg border border-line bg-panel pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-gold" />
            </div>
            <select value={type} onChange={(e) => { setType(e.target.value); resetPage(); }} aria-label="Tipo" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
              <option value="todos">Todos os tipos</option>{(Object.keys(TYPE) as DocType[]).map((t) => <option key={t} value={t}>{TYPE[t].label}</option>)}
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }} aria-label="Estado" className="h-11 rounded-lg border border-line bg-panel px-3 text-sm outline-none focus:border-gold">
              <option value="todos">Todos os estados</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm"><I.Calendar className="size-4 text-slate-300" />
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); resetPage(); }} aria-label="Enviado de" className="bg-transparent outline-none [color-scheme:dark]" />
              <span className="text-slate-500">—</span>
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); resetPage(); }} aria-label="Enviado até" className="bg-transparent outline-none [color-scheme:dark]" />
            </label>
            <button onClick={() => setMore(!more)} className={`flex h-11 items-center gap-2 rounded-lg border px-4 text-sm ${more ? "border-gold bg-gold/10 text-gold-soft" : "border-line bg-panel hover:border-gold/40"}`}><I.Filter className="size-4" />Mais filtros</button>
          </div>
          {more && (
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-panel/80 p-4">
              <label className="text-xs text-slate-400">Tamanho mínimo (MB)<input type="number" min="0" step="0.1" value={minMb} onChange={(e) => { setMinMb(e.target.value); resetPage(); }} className="mt-1 block h-10 w-36 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
              <label className="text-xs text-slate-400">Tamanho máximo (MB)<input type="number" min="0" step="0.1" value={maxMb} onChange={(e) => { setMaxMb(e.target.value); resetPage(); }} className="mt-1 block h-10 w-36 rounded-lg border border-line bg-panel2 px-3 text-sm text-slate-100" /></label>
              <button onClick={clearFilters} className="h-10 rounded-lg border border-line px-4 text-sm hover:border-gold/40">Limpar tudo</button>
            </div>
          )}

          <section className="rounded-2xl border border-line bg-panel/90 p-3">
            {checked.size > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold-soft">
                <span>{checked.size} selecionado(s)</span>
                <button onClick={exportCsv} className="rounded border border-white/20 px-2.5 py-1 hover:bg-white/10">Exportar lista</button>
                {canEdit && <button disabled={pending} onClick={delSelected} className="rounded border border-bad/50 px-2.5 py-1 text-red-300 hover:bg-bad/10">Eliminar</button>}
                <button onClick={() => setChecked(new Set())} className="ml-auto text-slate-300 hover:text-white">Limpar seleção</button>
              </div>
            )}
            {rows.length === 0 ? <p className="py-16 text-center text-sm text-muted">{total === 0 ? "Ainda não há documentos. Use “Enviar Documento” para adicionar." : "Nenhum documento corresponde aos filtros."}</p> : (
              <div className="overflow-x-auto" ref={menuRef}>
                <table className="min-w-[880px]">
                  <thead className="bg-white/[0.04]">
                    <tr>
                      <th className="w-10 pl-3 pt-3"><input type="checkbox" aria-label="Selecionar todos" checked={rows.length > 0 && rows.every((d) => checked.has(d.id))}
                        onChange={(e) => setChecked((s) => { const n = new Set(s); rows.forEach((d) => (e.target.checked ? n.add(d.id) : n.delete(d.id))); return n; })} className="accent-[#d6b06a]" /></th>
                      {th("Documento", "pt-3", "name")}{th("Categoria", "pt-3")}{th("Empresa / Contrato", "pt-3", "owner")}{th("Referência", "pt-3")}{th("Data de Envio", "pt-3", "date")}{th("Tamanho", "pt-3", "size")}{th("Estado", "pt-3")}{th("Ações", "pt-3")}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => {
                      const st = STATUS[d.status] ?? STATUS.ativo;
                      return (
                        <tr key={d.id} className="border-t border-line/70">
                          <td className="pl-3"><input type="checkbox" aria-label="Selecionar" checked={checked.has(d.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(d.id); else n.delete(d.id); return n; })} className="accent-[#d6b06a]" /></td>
                          <td><div className="flex items-center gap-3"><FileIcon type={d.type} /><span className="max-w-[14rem] truncate text-[13px]" title={d.name}>{d.name}</span></div></td>
                          <td><span className="inline-block rounded px-2.5 py-1 text-xs font-medium text-white" style={{ background: CAT[d.category].bg }}>{CAT[d.category].label}</span></td>
                          <td><div className="max-w-[10rem] truncate text-[13px]">{d.owner}</div>{d.ownerSub && <div className="text-xs text-slate-400">{d.ownerSub}</div>}</td>
                          <td className="whitespace-nowrap text-xs text-slate-300">{d.reference ?? "—"}</td>
                          <td className="whitespace-nowrap text-[13px]">{datePt(d.created_at)}</td>
                          <td className="whitespace-nowrap text-[13px]">{fmtSize(d.size)}</td>
                          <td><span className={`inline-block min-w-[4.6rem] rounded px-2 py-1.5 text-center text-xs font-medium ${st.solid}`}>{st.label}</span></td>
                          <td>
                            <div className="relative flex items-center gap-1.5">
                              {d.url ? <a href={d.url} target="_blank" rel="noreferrer" aria-label="Abrir" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Eye className="size-4" /></a>
                                : <span className="grid size-9 place-items-center rounded-lg border border-line text-slate-600"><I.Eye className="size-4" /></span>}
                              {d.url ? <a href={d.url} download={d.name} target="_blank" rel="noreferrer" aria-label="Descarregar" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Download className="size-4" /></a>
                                : <span className="grid size-9 place-items-center rounded-lg border border-line text-slate-600"><I.Download className="size-4" /></span>}
                              <button onClick={() => setMenuId(menuId === d.id ? null : d.id)} aria-label="Mais ações" className="grid size-9 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Dots className="size-4" /></button>
                              {menuId === d.id && (
                                <div className="absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-xl border border-line bg-panel text-sm shadow-2xl">
                                  {d.url && <button onClick={() => { navigator.clipboard?.writeText(d.url as string); setMenuId(null); setToast({ tone: "ok", text: "Ligação copiada (válida por 1 hora)." }); }} className="block w-full px-4 py-2.5 text-left hover:bg-white/5">Copiar ligação</button>}
                                  {d.contractId && <Link href={`/contratos/${d.contractId}`} className="block px-4 py-2.5 hover:bg-white/5">Abrir contrato</Link>}
                                  {d.companyId && <Link href={`/escritorios/empresa/${d.companyId}`} className="block px-4 py-2.5 hover:bg-white/5">Ver empresa</Link>}
                                  {canEdit && <button disabled={pending} onClick={() => { setMenuId(null); if (confirm(`Eliminar “${d.name}”?`)) run(deleteDocumentBoard(d.id, d.path), "Documento eliminado."); }} className="block w-full px-4 py-2.5 text-left text-red-400 hover:bg-white/5">Eliminar</button>}
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
              <span>A mostrar {filtered.length ? (cur - 1) * pageSize + 1 : 0} a {Math.min(cur * pageSize, filtered.length)} de {filtered.length.toLocaleString("pt-PT")} documentos</span>
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
            <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Folder className="size-4" /></span>Armazenamento</h2>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative size-28 shrink-0">
                <svg viewBox="0 0 120 120" className="-rotate-90" aria-hidden>
                  <circle cx="60" cy="60" r={R} fill="none" stroke="#1b2740" strokeWidth="13" />
                  <circle cx="60" cy="60" r={R} fill="none" stroke="#3b82f6" strokeWidth="13" strokeLinecap="round" strokeDasharray={`${(usedPct / 100) * C} ${C}`} />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="text-lg font-semibold">{usedPct}%</div><div className="text-[10px] text-slate-400">{fmtSize(used)}</div><div className="text-[10px] text-slate-400">de {capGb} GB</div></div></div>
              </div>
              <ul className="flex-1 space-y-1.5 text-xs">
                {storBy.map((s) => <li key={s.label} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ background: s.c }} />{s.label}</span><span className="text-slate-300">{fmtSize(s.v)}</span></li>)}
              </ul>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.File className="size-4" /></span>Tipos de Documento</h2>
            <ul className="mt-3 space-y-2.5">
              {typeCounts.map(({ t, n }) => (
                <li key={t} className="flex items-center gap-3 text-xs">
                  <FileIcon type={t} /><span className="w-28 shrink-0 truncate">{TYPE[t].label}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-white/10"><i className="block h-1.5 rounded-full" style={{ width: `${(n / maxType) * 100}%`, background: TYPE[t].bg }} /></span>
                  <b className="w-8 text-right">{n}</b>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Clock className="size-4" /></span>Documentos Recentes</h2>
              <button onClick={() => { clearFilters(); setSort({ key: "date", dir: -1 }); }} className="rounded-lg border border-line px-2.5 py-1 text-[11px] hover:border-gold/50">Ver Todos</button>
            </div>
            {recent.length === 0 ? <p className="py-4 text-center text-xs text-muted">Sem documentos.</p> : (
              <ul className="mt-3 space-y-3">
                {recent.map((d) => (
                  <li key={d.id} className="flex items-center gap-3">
                    <FileIcon type={d.type} />
                    <div className="min-w-0 flex-1"><div className="truncate text-[13px]">{d.name}</div><div className="text-[11px] text-slate-400">{datePt(d.created_at)} • {fmtSize(d.size)}</div></div>
                    {d.url && <a href={d.url} download={d.name} target="_blank" rel="noreferrer" aria-label="Descarregar" className="grid size-8 place-items-center rounded-lg border border-line hover:border-gold/50"><I.Download className="size-4" /></a>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/90 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><span className="grid size-7 place-items-center rounded-md border border-gold/40 text-gold"><I.Alert className="size-4" /></span>Ações Rápidas</h2>
            <div className="grid grid-cols-3 gap-2">
              <button disabled={!canEdit} onClick={() => setShowImport(true)} className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-[#041019] text-[11px] hover:border-gold/50 disabled:opacity-50"><I.Plus className="size-5 text-slate-200" />Importar PDFs</button>
              <button onClick={exportCsv} className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-[#041019] text-[11px] hover:border-gold/50"><I.Download className="size-5 text-slate-200" />Exportar Lista</button>
              <button onClick={clearFilters} className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-[#041019] text-[11px] hover:border-gold/50"><I.Filter className="size-5 text-slate-200" />Limpar Filtros</button>
            </div>
          </section>
        </div>
      </div>

      {showImport && (
        <div role="dialog" aria-modal="true" aria-label="Importar PDFs" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowImport(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl space-y-4 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><h2 className="font-serif text-3xl">Importar PDFs para empresas</h2><p className="text-sm text-slate-400">Cada ficheiro fica associado à empresa escolhida e aparece na ficha dela.</p></div>
              <button type="button" onClick={() => setShowImport(false)} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
            </div>
            <PdfImporter companies={companies} />
          </div>
        </div>
      )}
      {showUpload && (
        <div role="dialog" aria-modal="true" aria-label="Enviar documento" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowUpload(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); run(uploadDocumentsBoard(new FormData(e.currentTarget)), "Documento(s) enviado(s).", () => setShowUpload(false)); }}
            className="w-full max-w-2xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div><h2 className="font-serif text-3xl">Enviar documento</h2><p className="text-sm text-slate-400">Pode escolher vários ficheiros de uma vez (máx. 10 MB cada).</p></div>
              <button type="button" onClick={() => setShowUpload(false)} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={lab}>Ficheiros *</label><input name="files" type="file" multiple required className={field} /></div>
              <div><label className={lab}>Categoria</label>
                <select name="category" defaultValue="outro" className={field}>{(Object.keys(CAT) as DocCategory[]).map((c) => <option key={c} value={c}>{CAT[c].label}</option>)}</select></div>
              <div><label className={lab}>Estado</label>
                <select name="status" defaultValue="ativo" className={field}><option value="ativo">Activo</option><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="arquivado">Arquivado</option></select></div>
              <div><label className={lab}>Empresa (opcional)</label>
                <select name="company_id" defaultValue="" className={field}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label className={lab}>Contrato (opcional)</label>
                <select name="contract_id" defaultValue="" className={field}><option value="">—</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.company}</option>)}</select></div>
              <div><label className={lab}>Referência</label><input name="reference" className={field} placeholder="ex.: FT-2026-043" /></div>
              <div><label className={lab}>Tags</label><input name="tags" className={field} placeholder="separadas por vírgula" /></div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowUpload(false)} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
              <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A enviar…" : "Enviar"}</button>
            </div>
          </form>
        </div>
      )}
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}
