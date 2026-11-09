"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { importPdfsBoard, type ActionResult } from "@/app/actions";
import * as I from "@/components/icons";

export interface CompanyOpt { id: string; name: string; nif?: string | null }
interface Item { key: string; file: File; companyId: string; auto: boolean }

const MAX = 10 * 1024 * 1024;
const CATS: [string, string][] = [["empresa", "Empresa"], ["contrato", "Contrato"], ["financeiro", "Financeiro"], ["fiscal", "Fiscal"], ["operacional", "Operacional"], ["outro", "Outro"]];
const STOP = new Set(["lda", "sa", "de", "da", "do", "das", "dos", "e", "the", "limitada", "comercial", "empresa", "grupo", "angola"]);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fld = "w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none transition focus:border-gold/60";
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

// Sugere a empresa pelo nome do ficheiro: NIF completo ou todas as palavras relevantes do nome da empresa.
function suggest(fileName: string, companies: CompanyOpt[]): string {
  const base = norm(fileName.replace(/\.pdf$/i, ""));
  const digits = base.replace(/\s/g, "");
  let best = "", bestScore = 0, tie = false;
  for (const c of companies) {
    let score = 0;
    const nif = (c.nif ?? "").replace(/\D/g, "");
    if (nif.length >= 6 && digits.includes(nif)) score = 100;
    else {
      const tokens = norm(c.name).split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
      if (tokens.length > 0 && tokens.every((t) => base.includes(t))) score = 10 + tokens.length;
    }
    if (score > bestScore) { best = c.id; bestScore = score; tie = false; } else if (score > 0 && score === bestScore) tie = true;
  }
  return tie ? "" : best;
}

export default function PdfImporter({ companies, fixedCompanyId, onDone, compact = false }: {
  companies: CompanyOpt[]; fixedCompanyId?: string; onDone?: () => void; compact?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [category, setCategory] = useState("empresa");
  const [msg, setMsg] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const sorted = useMemo(() => [...companies].sort((a, b) => a.name.localeCompare(b.name, "pt")), [companies]);

  const add = (list: FileList | File[]) => {
    const next: Item[] = [], problems: string[] = [];
    for (const file of Array.from(list)) {
      if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) { problems.push(`“${file.name}” não é um PDF`); continue; }
      if (file.size > MAX) { problems.push(`“${file.name}” excede 10 MB`); continue; }
      const guess = fixedCompanyId ?? suggest(file.name, companies);
      next.push({ key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, companyId: guess, auto: Boolean(guess) && !fixedCompanyId });
    }
    setItems((p) => [...p, ...next].slice(0, 30));
    setMsg(problems.length ? { tone: "erro", text: problems.join("; ") + "." } : null);
  };
  const setCompany = (key: string, companyId: string) => setItems((p) => p.map((i) => (i.key === key ? { ...i, companyId, auto: false } : i)));
  const missing = items.filter((i) => !i.companyId).length;

  const submit = () => {
    const fd = new FormData();
    items.forEach((it, idx) => { fd.append("files", it.file); fd.set(`company_${idx}`, it.companyId); });
    fd.set("category", category);
    start(async () => {
      const r: ActionResult = await importPdfsBoard(fd).catch(() => ({ ok: false, error: "Não foi possível importar os documentos." }));
      if (r.ok) {
        setMsg({ tone: r.error ? "erro" : "ok", text: r.error ?? `${r.id ?? items.length} PDF(s) importado(s).` });
        setItems([]);
        onDone?.();
      } else setMsg({ tone: "erro", text: r.error ?? "Não foi possível importar os documentos." });
    });
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 text-center transition ${compact ? "py-5" : "py-9"} ${drag ? "border-gold bg-gold/10" : "border-white/15 bg-white/[0.02] hover:border-gold/50"}`}>
        <div>
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-gold/10 text-gold"><I.Download className="size-5 rotate-180" /></span>
          <p className="mt-2 text-sm text-slate-100">Arraste PDFs para aqui ou <span className="text-gold underline">escolha ficheiros</span></p>
          <p className="mt-0.5 text-xs text-slate-500">Até 30 ficheiros · máx. 10 MB cada{fixedCompanyId ? "" : " · a empresa é sugerida pelo nome do ficheiro"}</p>
        </div>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <>
          <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.08] bg-black/20 p-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-red-500/10 text-[10px] font-bold text-red-300">PDF</span>
                <div className="min-w-0 flex-1 basis-40"><div className="truncate text-sm">{it.file.name}</div><div className="text-xs text-slate-500">{size(it.file.size)}</div></div>
                {!fixedCompanyId && (
                  <div className="flex items-center gap-2">
                    <select value={it.companyId} onChange={(e) => setCompany(it.key, e.target.value)} aria-label={`Empresa de ${it.file.name}`} className={`${fld} !w-52 ${it.companyId ? "" : "!border-amber-500/60"}`}>
                      <option value="">Escolher empresa…</option>{sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {it.auto && <span title="Sugerida pelo nome do ficheiro" className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">auto</span>}
                  </div>
                )}
                <button type="button" onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))} aria-label="Remover" className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><I.Close className="size-4" /></button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">Categoria
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${fld} !w-40`}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <div className="flex items-center gap-3">
              {missing > 0 && <span className="text-xs text-amber-300">{missing} sem empresa</span>}
              <button type="button" onClick={() => setItems([])} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">Limpar</button>
              <button type="button" onClick={submit} disabled={pending || missing > 0} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
                {pending ? "A importar…" : `Importar ${items.length} PDF${items.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </>
      )}
      {msg && <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${msg.tone === "ok" ? "border-ok/40 bg-ok/10 text-emerald-200" : "border-bad/40 bg-bad/10 text-red-200"}`}>{msg.text}</p>}
    </div>
  );
}
