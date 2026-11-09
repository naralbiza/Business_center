"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Building, CompanyFull, OfficeVM } from "@/lib/offices";
import { createCompanyBoard, createOfficeBoard, deactivateOffice, deleteOffice, saveOfficeLayout, setOfficeStatus, updateOfficeBoard, type ActionResult } from "@/app/actions";
import { datePt, kz } from "@/lib/format";
import * as I from "@/components/icons";

type Rect = { x: number; y: number; w: number; h: number };
type Toast = { tone: "ok" | "erro"; text: string } | null;

const STATUS: Record<string, { label: string; tile: string; dot: string; pill: string }> = {
  ocupado: { label: "Ocupado", tile: "from-[#23a95c] to-[#14793f]", dot: "#22a35a", pill: "border-ok/40 bg-ok/20 text-emerald-300" },
  livre: { label: "Livre", tile: "from-[#3b82f6] to-[#1f5fd8]", dot: "#2f7bf5", pill: "border-sky/40 bg-sky/20 text-blue-300" },
  reservado: { label: "Reservado", tile: "from-[#e0a122] to-[#b57a10]", dot: "#d99a1f", pill: "border-warn/50 bg-warn/20 text-amber-300" },
  manutencao: { label: "Em Manutenção", tile: "from-[#ee4a50] to-[#b8272c]", dot: "#e5484d", pill: "border-bad/50 bg-bad/20 text-red-300" },
  bloqueado: { label: "Bloqueado", tile: "from-[#6b7a90] to-[#475569]", dot: "#64748b", pill: "border-slate-400/40 bg-slate-500/20 text-slate-300" },
};
const LEGEND = ["ocupado", "livre", "reservado", "manutencao"] as const;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAX_COLS = 24;

function stats(list: OfficeVM[]) {
  const count = (s: string) => list.filter((o) => o.status === s).length;
  const total = list.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const occupied = count("ocupado");
  return { total, occupied, free: count("livre"), reserved: count("reservado"), maint: count("manutencao"), pct, rate: total ? Math.round((occupied / total) * 1000) / 10 : 0 };
}

export default function OfficesBoard({ buildings, offices, companies, canEdit, openNew, openCompany }: { buildings: Building[]; offices: OfficeVM[]; companies: CompanyFull[]; canEdit: boolean; openNew: boolean; openCompany: boolean }) {
  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState("todos");
  const [buildingF, setBuildingF] = useState("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Rect>>({});
  const [moving, setMoving] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Record<string, number>>({});
  const [lists, setLists] = useState<Record<string, boolean>>({});
  const [showNew, setShowNew] = useState(openNew && canEdit);
  const [showNewCompany, setShowNewCompany] = useState(openCompany && canEdit);
  const [toast, setToast] = useState<Toast>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const run = (p: Promise<ActionResult>, ok: string, then?: (r: ActionResult) => void) =>
    start(async () => {
      try {
        const r = await p;
        if (r.ok) { setToast({ tone: "ok", text: ok }); then?.(r); } else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." });
      } catch {
        setToast({ tone: "erro", text: "Erro de ligação. Tente novamente." });
      }
    });

  const q = norm(query.trim());
  const matches = (o: OfficeVM) =>
    (statusF === "todos" || o.status === statusF) &&
    (buildingF === "todos" || o.building_id === buildingF) &&
    (!q || [o.number, o.company?.name, o.company?.nif, o.contract?.number].some((v) => v && norm(String(v)).includes(q)));
  const filtering = Boolean(q) || statusF !== "todos" || buildingF !== "todos";
  const matchCount = offices.filter(matches).length;

  const all = stats(offices);
  const pos = (o: OfficeVM): Rect => draft[o.id] ?? { x: o.x, y: o.y, w: o.w, h: o.h };
  const selected = offices.find((o) => o.id === selectedId) ?? null;

  const move = (id: string, x: number, y: number, bId: string) => {
    const list = offices.filter((o) => o.building_id === bId);
    const me = list.find((o) => o.id === id);
    if (!me) return;
    const cur = pos(me);
    const target: Rect = { x, y, w: cur.w, h: cur.h };
    if (x < 0 || y < 0 || x + cur.w > MAX_COLS) return setToast({ tone: "erro", text: "Fora dos limites da planta." });
    const hits = list.filter((o) => o.id !== id && overlaps(pos(o), target));
    if (hits.length === 0) setDraft((d) => ({ ...d, [id]: target }));
    else if (hits.length === 1 && pos(hits[0]).w === cur.w && pos(hits[0]).h === cur.h) setDraft((d) => ({ ...d, [id]: target, [hits[0].id]: { ...pos(hits[0]), x: cur.x, y: cur.y } }));
    else setToast({ tone: "erro", text: "Essa posição já está ocupada." });
    setMoving(null);
  };

  const saveLayout = (bId: string) => {
    const items = offices.filter((o) => o.building_id === bId).map((o) => ({ id: o.id, ...pos(o) }));
    run(saveOfficeLayout(bId, items), "Planta guardada.", () => { setEditing(null); setDraft({}); setMoving(null); });
  };
  const cancelLayout = () => { setEditing(null); setDraft({}); setMoving(null); };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      {/* ───── Abertura com a foto aérea ───── */}
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] min-h-[460px] overflow-hidden px-4 pb-6 pt-[calc(4rem+1.5rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:min-h-[490px] md:px-6">
        <Image src="/aerial.jpg" alt="Vista aérea do Business Center Esperança" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "center 40%" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#020b13]/50 via-transparent to-[#020b13]" />

        <div className="flex items-start gap-3">
          <I.Pin className="mt-1 size-10 text-gold" />
          <div className="leading-none">
            <div className="font-serif text-2xl text-white">Business Center</div>
            <div className="font-serif text-5xl text-white">Esperança</div>
            <div className="mt-2 text-sm text-slate-200">Moçâmedes, Namibe</div>
          </div>
        </div>

        <div className="mt-5 w-full max-w-[250px] space-y-1 rounded-xl border border-white/10 bg-[#07121b]/90 p-2.5 backdrop-blur">
          {[
            { n: all.total, t: "Total de Escritórios", pct: null, icon: I.Building, c: "from-[#c99a3d] to-[#7a5a1c]", col: "" },
            { n: all.occupied, t: "Ocupados", pct: all.pct(all.occupied), icon: I.Check, c: "from-[#23a95c] to-[#14793f]", col: "text-emerald-400" },
            { n: all.free, t: "Livres", pct: all.pct(all.free), icon: I.Building, c: "from-[#3b82f6] to-[#1f5fd8]", col: "text-sky" },
            { n: all.reserved, t: "Reservados", pct: all.pct(all.reserved), icon: I.Clock, c: "from-[#e0a122] to-[#b57a10]", col: "text-amber-400" },
            { n: all.maint, t: "Em Manutenção", pct: all.pct(all.maint), icon: I.Wrench, c: "from-[#ee4a50] to-[#b8272c]", col: "text-red-400" },
          ].map((k) => (
            <div key={k.t} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-xl font-semibold">{k.n}</div>
                <div className="truncate text-xs text-slate-300">{k.t}</div>
              </div>
              {k.pct !== null && <span className={`text-sm font-medium ${k.col}`}>{k.pct}%</span>}
            </div>
          ))}
          <div className="border-t border-white/10 px-1.5 pt-2 text-xs text-slate-300">Taxa de ocupação <b className="text-white">{String(all.rate).replace(".", ",")}%</b></div>
        </div>

        {buildings.map((b, i) => {
          const n = offices.filter((o) => o.building_id === b.id).length;
          return (
            <button key={b.id} onClick={() => scrollTo(`ed-${b.id}`)}
              className="absolute hidden items-center gap-3 rounded-xl border border-white/15 bg-[#07121b]/90 px-3.5 py-2.5 text-left backdrop-blur transition hover:border-gold/60 md:flex"
              style={i === 0 ? { left: "34%", top: "56%" } : { left: "74%", top: "44%" }}>
              <I.Building className="size-7 text-gold" />
              <span className="leading-tight"><span className="block font-serif text-lg">{b.name}</span><span className="text-xs text-slate-300">Piso 1 • {n} escritórios</span></span>
            </button>
          );
        })}
      </section>

      {/* ───── Pesquisa, filtros e novo escritório ───── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <I.Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar por número, empresa, NIF ou contrato…"
            className="h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-3 text-sm outline-none placeholder:text-slate-500 focus:border-gold" />
        </div>
        <select value={buildingF} onChange={(e) => setBuildingF(e.target.value)} className="h-11 rounded-xl border border-line bg-panel px-3 text-sm outline-none focus:border-gold" aria-label="Edifício">
          <option value="todos">Todos os edifícios</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="h-11 rounded-xl border border-line bg-panel px-3 text-sm outline-none focus:border-gold" aria-label="Estado">
          <option value="todos">Todos os estados</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {filtering && (
          <button onClick={() => { setQuery(""); setStatusF("todos"); setBuildingF("todos"); }} className="h-11 rounded-xl border border-gold/40 px-3 text-xs text-gold hover:bg-gold/10">
            Limpar filtros · {matchCount} resultado{matchCount === 1 ? "" : "s"}
          </button>
        )}
        {canEdit && (
          <button onClick={() => setShowNew(true)} className="btn-gold flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold hover:brightness-105">
            <I.Plus className="size-4" />Novo Escritório
          </button>
        )}
        {canEdit && (
          <button onClick={() => setShowNewCompany(true)} className="flex h-11 items-center gap-2 rounded-xl border border-gold/50 px-4 text-sm font-semibold text-gold-soft hover:bg-gold/10">
            <I.Plus className="size-4" />Nova Empresa
          </button>
        )}
      </div>

      {/* ───── Edifícios: resumo + planta ───── */}
      {buildings.filter((b) => buildingF === "todos" || b.id === buildingF).map((b, bi) => {
        const list = offices.filter((o) => o.building_id === b.id);
        const s = stats(list);
        const cell = zoom[b.id] ?? 64;
        const isEdit = editing === b.id;
        const cols = Math.min(MAX_COLS, Math.max(12, ...list.map((o) => pos(o).x + pos(o).w)));
        const rows = Math.max(1, ...list.map((o) => pos(o).y + pos(o).h)) + (isEdit ? 1 : 0);
        const covered = new Set<string>();
        list.forEach((o) => { const p = pos(o); for (let yy = p.y; yy < p.y + p.h; yy++) for (let xx = p.x; xx < p.x + p.w; xx++) covered.add(`${xx},${yy}`); });
        const asList = lists[b.id];
        return (
          <div key={b.id} id={`ed-${b.id}`} className="grid scroll-mt-20 gap-4 xl:grid-cols-[400px_1fr]">
            {/* Resumo do edifício */}
            <section className="self-start rounded-2xl border border-line bg-panel/90 p-3">
              <div className="flex gap-3">
                <div className="relative h-[170px] w-[138px] shrink-0 overflow-hidden rounded-xl border border-line">
                  <Image src={bi % 2 === 0 ? "/ed1.jpg" : "/ed2.jpg"} alt={b.name} fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <I.Building className="size-8 text-gold" />
                    <div className="leading-tight"><div className="font-serif text-2xl">{b.name}</div><div className="text-xs text-slate-300">Piso 1 • {s.total} escritórios</div></div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    {[
                      ["Total", s.total, "", "#7aa2d6"], ["Ocupados", s.occupied, `${s.pct(s.occupied)}%`, "#22a35a"],
                      ["Livres", s.free, "", "#2f7bf5"], ["Reservados", s.reserved, `${s.pct(s.reserved)}%`, "#d99a1f"],
                      ["Em Manutenção", s.maint, `${s.pct(s.maint)}%`, "#e5484d"],
                    ].map(([t, n, p, c]) => (
                      <div key={String(t)} className="flex items-center gap-2">
                        <i className="size-6 shrink-0 rounded-md" style={{ background: String(c) }} />
                        <div className="leading-tight"><div className="text-base font-semibold">{n}{p && <span className="ml-1 text-[10px] font-medium text-emerald-400">{p}</span>}</div><div className="text-[10px] text-slate-300">{t}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => scrollTo(`plan-${b.id}`)} className="btn-gold flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold hover:brightness-105">Ver Detalhes do Edifício <I.Arrow className="size-4" /></button>
                <button onClick={() => { setLists((l) => ({ ...l, [b.id]: false })); scrollTo(`plan-${b.id}`); }} aria-label="Ver planta" className="grid h-11 w-24 place-items-center rounded-lg border border-line text-slate-200 hover:border-gold/50"><I.MapIcon className="size-5" /></button>
              </div>
            </section>

            {/* Planta e empresas */}
            <div className="min-w-0 space-y-4">
            <section id={`plan-${b.id}`} className="scroll-mt-20 rounded-2xl border border-line bg-panel/90 p-4">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 className="mr-2 text-xl font-semibold">Piso 1 - {b.name}</h2>
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-[#041019] px-4 py-2 text-xs text-slate-200">
                  {LEGEND.map((k) => <span key={k} className="flex items-center gap-2"><i className="size-3.5 rounded-full" style={{ background: STATUS[k].dot }} />{k === "manutencao" ? "Em Manutenção" : STATUS[k].label}</span>)}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {!asList && (
                    <div className="flex items-center rounded-lg border border-line">
                      <button onClick={() => setZoom((z) => ({ ...z, [b.id]: Math.max(48, cell - 8) }))} aria-label="Reduzir" className="grid size-9 place-items-center hover:text-gold"><I.Minus className="size-4" /></button>
                      <button onClick={() => setZoom((z) => ({ ...z, [b.id]: Math.min(128, cell + 8) }))} aria-label="Ampliar" className="grid size-9 place-items-center hover:text-gold"><I.Plus className="size-4" /></button>
                    </div>
                  )}
                  {canEdit && !asList && !isEdit && (
                    <button onClick={() => { setEditing(b.id); setDraft({}); setMoving(null); }} className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs hover:border-gold/50"><I.Pencil className="size-4" />Editar planta</button>
                  )}
                  <button onClick={() => setLists((l) => ({ ...l, [b.id]: !asList }))} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-[#041019] px-3 text-xs hover:border-gold/50">
                    {asList ? <><I.MapIcon className="size-4" />Ver Planta</> : <><I.List className="size-4" />Ver em Lista</>}
                  </button>
                </div>
              </div>

              {isEdit && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs text-gold-soft">
                  <span className="flex-1">Modo de edição: arraste um escritório (ou toque nele e depois numa célula vazia) para o mover. Largura e altura editam-se na ficha.</span>
                  <button onClick={cancelLayout} className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10">Cancelar</button>
                  <button disabled={pending} onClick={() => saveLayout(b.id)} className="btn-gold rounded-lg px-3 py-1.5 font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar planta"}</button>
                </div>
              )}

              {list.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">Este edifício ainda não tem escritórios.{canEdit && " Use “Novo Escritório” para adicionar."}</p>
              ) : asList ? (
                <div className="overflow-x-auto">
                  <table>
                    <thead><tr><th>Nº</th><th>Empresa</th><th>NIF</th><th>Área</th><th>Contrato</th><th>Término</th><th>Renda</th><th>Estado</th></tr></thead>
                    <tbody>
                      {list.filter(matches).sort((a, c) => a.number.localeCompare(c.number, "pt", { numeric: true })).map((o) => (
                        <tr key={o.id} onClick={() => setSelectedId(o.id)} className="cursor-pointer border-t border-line/70">
                          <td className="font-semibold">{o.number}</td><td>{o.company?.name ?? "—"}</td><td className="text-slate-400">{o.company?.nif ?? "—"}</td>
                          <td>{o.area_m2} m²</td><td>{o.contract?.number ?? "—"}</td><td className="whitespace-nowrap">{o.contract ? datePt(o.contract.end_date) : "—"}</td>
                          <td className="whitespace-nowrap">{o.monthly_value != null ? kz(o.monthly_value) : "—"}</td>
                          <td><span className={`rounded-md border px-2 py-0.5 text-xs ${STATUS[o.status].pill}`}>{STATUS[o.status].label}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-auto rounded-xl border border-line bg-[#041019] p-3">
                  <div className="grid w-max gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${Math.round(cell * 0.95)}px` }}>
                    {isEdit && Array.from({ length: rows * cols }, (_, i) => ({ x: i % cols, y: Math.floor(i / cols) })).filter((c) => !covered.has(`${c.x},${c.y}`)).map((c) => (
                      <button key={`c${c.x}-${c.y}`} aria-label={`Mover para ${c.x + 1},${c.y + 1}`} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}
                        onClick={() => moving && move(moving, c.x, c.y, b.id)}
                        onDragOver={(e) => e.preventDefault()} onDrop={() => dragId && move(dragId, c.x, c.y, b.id)}
                        className={`rounded-md border border-dashed ${moving ? "border-gold/60 hover:bg-gold/10" : "border-white/10"}`} />
                    ))}
                    {list.map((o) => {
                      const p = pos(o);
                      const ok = matches(o);
                      const st = STATUS[o.status];
                      return (
                        <button key={o.id} draggable={isEdit}
                          onDragStart={() => setDragId(o.id)} onDragEnd={() => setDragId(null)}
                          onDragOver={(e) => isEdit && e.preventDefault()} onDrop={() => isEdit && dragId && move(dragId, p.x, p.y, b.id)}
                          onClick={() => {
                            if (!isEdit) return setSelectedId(o.id);
                            if (moving && moving !== o.id) move(moving, p.x, p.y, b.id); else setMoving(moving === o.id ? null : o.id);
                          }}
                          title={`${o.number}${o.company ? " · " + o.company.name : " · " + st.label}`}
                          style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}` }}
                          className={`flex flex-col items-center justify-center overflow-hidden rounded-md bg-gradient-to-b px-1 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition ${st.tile}
                            ${ok ? "hover:brightness-110" : "opacity-20 grayscale"} ${selectedId === o.id ? "ring-2 ring-gold" : ""} ${moving === o.id ? "ring-2 ring-white" : ""} ${isEdit ? "cursor-grab" : ""}`}>
                          <span className="text-[15px] font-semibold leading-none">{o.number}</span>
                          <span className="mt-1 line-clamp-2 w-full break-words text-center text-[9.5px] leading-[1.1] text-white/90">{o.company ? o.company.name : o.status === "livre" ? "Disponível" : st.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
            <CompanyCards list={list} matches={matches} onOpen={setSelectedId} title={`Empresas — ${b.name}`} />
            </div>
          </div>
        );
      })}

      <AllCompanies companies={companies} offices={offices} buildings={buildings} matches={matches} q={q} filtering={statusF !== "todos" || buildingF !== "todos"} onOpen={setSelectedId} />

      {selected && (
        <OfficeDrawer key={selected.id} office={selected} building={buildings.find((b) => b.id === selected.building_id)} canEdit={canEdit}
          pending={pending} onClose={() => setSelectedId(null)} run={run} />
      )}
      {showNewCompany && <NewCompanyModal pending={pending} onClose={() => setShowNewCompany(false)} run={run} onCreated={(id) => { setShowNewCompany(false); if (id) router.push(`/escritorios/empresa/${id}`); }} />}
      {showNew && <NewOfficeModal buildings={buildings} pending={pending} onClose={() => setShowNew(false)} run={run} onCreated={(id) => { setShowNew(false); if (id) setSelectedId(id); }} />}

      {toast && (
        <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>
          {toast.text}
        </div>
      )}
    </>
  );
}

function CompanyCards({ list, matches, onOpen, title }: { list: OfficeVM[]; matches: (o: OfficeVM) => boolean; onOpen: (id: string) => void; title: string }) {
  const groups = new Map<string, { company: NonNullable<OfficeVM['company']>; offices: OfficeVM[] }>();
  for (const o of list) {
    if (!o.company) continue;
    const g = groups.get(o.company.id) ?? { company: o.company, offices: [] };
    g.offices.push(o);
    groups.set(o.company.id, g);
  }
  const cards = [...groups.values()].filter((g) => g.offices.some(matches)).sort((a, b) => a.company.name.localeCompare(b.company.name, 'pt'));
  return (
    <section className="rounded-2xl border border-line bg-panel/90 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg">{title}</h2>
        <span className="text-xs text-slate-400">{cards.length} empresa{cards.length === 1 ? '' : 's'}</span>
      </div>
      {cards.length === 0 ? <p className="py-6 text-center text-sm text-muted">Sem empresas neste edifício{list.length ? ' para os filtros atuais' : ''}.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {cards.map(({ company: c, offices }) => {
            const rent = offices.reduce((t, o) => t + (o.monthly_value ?? (o.contract ? o.contract.total_value / Math.max(1, o.contract.installments_count) : 0)), 0);
            const late = offices.some((o) => o.overdue > 0);
            const ending = offices.some((o) => o.contract?.status === 'a_terminar');
            const next = offices.map((o) => o.contract?.end_date).filter(Boolean).sort()[0];
            const tag = late ? ['Em atraso', 'border-bad/50 bg-bad/20 text-red-300'] : ending ? ['A terminar', 'border-warn/50 bg-warn/20 text-amber-300'] : ['Em dia', 'border-ok/40 bg-ok/20 text-emerald-300'];
            return (
              <article key={c.id} className="rounded-xl border border-line bg-[#041019] p-3.5 transition hover:border-gold/40">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-gold/40 bg-panel2 text-sm font-semibold text-gold-soft">{c.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-slate-400">NIF {c.nif ?? '—'}</div>
                  </div>
                  <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] ${tag[1]}`}>{tag[0]}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {offices.map((o) => (
                    <button key={o.id} onClick={() => onOpen(o.id)} className={`rounded-md bg-gradient-to-b px-2 py-0.5 text-xs font-semibold text-white ${STATUS[o.status].tile}`}>{o.number}</button>
                  ))}
                </div>
                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><dt className="text-slate-400">Renda mensal</dt><dd>{kz(rent)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Término</dt><dd>{next ? datePt(next) : '—'}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AllCompanies({ companies, offices, buildings, matches, q, filtering, onOpen }: { companies: CompanyFull[]; offices: OfficeVM[]; buildings: Building[]; matches: (o: OfficeVM) => boolean; q: string; filtering: boolean; onOpen: (id: string) => void }) {
  const bname = new Map(buildings.map((b) => [b.id, b.name]));
  const rows = companies.map((c) => ({ c, offs: offices.filter((o) => o.company?.id === c.id) })).filter(({ c, offs }) => {
    const textHit = q && [c.name, c.nif, c.sector, c.phone, c.email, c.rep].some((v) => v && norm(v).includes(q));
    if (!q && !filtering) return true;
    return Boolean(textHit) || offs.some(matches);
  });
  return (
    <section id="empresas" className="scroll-mt-20 rounded-2xl border border-line bg-panel/90 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-xl">Empresas</h2>
        <span className="text-xs text-slate-400">{rows.length} de {companies.length}</span>
      </div>
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted">{companies.length === 0 ? "Ainda não há empresas registadas." : "Nenhuma empresa corresponde aos filtros."}</p> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ c, offs }) => {
            const rent = offs.reduce((t, o) => t + (o.monthly_value ?? (o.contract ? o.contract.total_value / Math.max(1, o.contract.installments_count) : 0)), 0);
            const late = offs.some((o) => o.overdue > 0);
            const tag = offs.length === 0 ? ["Sem escritório", "border-slate-400/40 bg-slate-500/20 text-slate-300"] : late ? ["Em atraso", "border-bad/50 bg-bad/20 text-red-300"] : ["Em dia", "border-ok/40 bg-ok/20 text-emerald-300"];
            return (
              <article key={c.id} className="flex flex-col rounded-xl border border-line bg-[#041019] p-3.5 transition hover:border-gold/40">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-gold/40 bg-panel2 text-sm font-semibold text-gold-soft">{c.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="truncate text-xs text-slate-400">NIF {c.nif ?? "—"}{c.sector ? ` · ${c.sector}` : ""}</div>
                  </div>
                  <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] ${tag[1]}`}>{tag[0]}</span>
                </div>
                <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
                  {offs.map((o) => (
                    <button key={o.id} onClick={() => onOpen(o.id)} title={bname.get(o.building_id)} className={`rounded-md bg-gradient-to-b px-2 py-0.5 text-xs font-semibold text-white ${STATUS[o.status].tile}`}>{o.number}</button>
                  ))}
                </div>
                <dl className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between gap-3"><dt className="text-slate-400">Contacto</dt><dd className="truncate">{c.phone ?? c.email ?? "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-400">Representante</dt><dd className="truncate">{c.rep ?? "—"}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-400">Renda mensal</dt><dd>{offs.length ? kz(rent) : "—"}</dd></div>
                </dl>
                <Link href={`/escritorios/empresa/${c.id}`} className="mt-3 text-xs text-gold hover:underline">Abrir ficha da empresa →</Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function NewCompanyModal({ pending, onClose, run, onCreated }: { pending: boolean; onClose: () => void; run: RunFn; onCreated: (id?: string) => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Nova empresa" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(createCompanyBoard(fd), "Empresa criada.", (r) => onCreated(r.id)); }}
        className="w-full max-w-2xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h2 className="font-serif text-3xl">Nova empresa</h2><p className="text-sm text-slate-400">Depois de criada, associe-a a um escritório através de um contrato.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={lab}>Nome *</label><input name="name" required className={field} /></div>
          <div><label className={lab}>NIF</label><input name="nif" className={field} /></div>
          <div><label className={lab}>Sector</label><input name="sector" className={field} /></div>
          <div><label className={lab}>Telefone</label><input name="phone" className={field} /></div>
          <div><label className={lab}>Email</label><input name="email" type="email" className={field} /></div>
          <div className="sm:col-span-2"><label className={lab}>Representante legal</label><input name="legal_rep_name" className={field} /></div>
          <div className="sm:col-span-2"><label className={lab}>Endereço</label><input name="address" className={field} /></div>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar empresa"}</button>
        </div>
      </form>
    </div>
  );
}

type RunFn = (p: Promise<ActionResult>, ok: string, then?: (r: ActionResult) => void) => void;

const field = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-slate-500 focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";

function OfficeDrawer({ office: o, building, canEdit, pending, onClose, run }: { office: OfficeVM; building?: Building; canEdit: boolean; pending: boolean; onClose: () => void; run: RunFn }) {
  const [tab, setTab] = useState<"geral" | "empresa" | "contrato" | "financeiro" | "historico">("geral");
  const [status, setStatus] = useState(o.status);
  const st = STATUS[o.status];
  const tabs = [["geral", "Visão geral"], ["empresa", "Empresa"], ["contrato", "Contrato"], ["financeiro", "Financeiro"], ["historico", "Histórico"]] as const;
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 border-b border-line/70 py-2.5 text-sm"><dt className="text-slate-400">{k}</dt><dd className="text-right">{v}</dd></div>;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-label={`Escritório ${o.number}`} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-[#06111a] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <div className="text-xs text-slate-400">{building?.name}</div>
            <h2 className="font-serif text-3xl">Escritório {o.number}</h2>
            <span className={`mt-2 inline-block rounded-md border px-2 py-0.5 text-xs ${st.pill}`}>{st.label}</span>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs ${tab === k ? "border-b-2 border-gold text-gold-soft" : "text-slate-400 hover:text-slate-200"}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "geral" && (
            <div className="space-y-5">
              <dl>
                {row("Edifício", building?.name ?? "—")}{row("Código", o.code)}{row("Área", `${o.area_m2} m²`)}
                {row("Renda mensal", o.monthly_value != null ? kz(o.monthly_value) : "Conforme configuração comercial")}
                {row("Observações", o.notes ?? "—")}
              </dl>
              {canEdit && (
                <>
                  <div>
                    <label className={lab}>Estado</label>
                    <div className="flex gap-2">
                      <select value={status} onChange={(e) => setStatus(e.target.value as OfficeVM["status"])} className={field}>
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <button disabled={pending || status === o.status} onClick={() => run(setOfficeStatus(o.id, status), "Estado atualizado.")} className="btn-gold rounded-lg px-4 text-sm font-semibold disabled:opacity-50">Guardar</button>
                    </div>
                    {o.contract && status !== "ocupado" && <p className="mt-1.5 text-xs text-amber-300">Atenção: existe um contrato ativo neste escritório.</p>}
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); run(updateOfficeBoard(new FormData(e.currentTarget)), "Escritório atualizado."); }} className="space-y-3 rounded-xl border border-line p-4">
                    <input type="hidden" name="id" value={o.id} />
                    <div className="text-sm font-medium">Editar dados</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={lab}>Área (m²)</label><input name="area_m2" type="number" step="0.01" min="0.01" required defaultValue={o.area_m2} className={field} /></div>
                      <div><label className={lab}>Renda mensal (Kz)</label><input name="monthly_value" type="number" min="0" defaultValue={o.monthly_value ?? ""} className={field} /></div>
                      <div><label className={lab}>Largura (células)</label><input name="width" type="number" min="1" max="6" defaultValue={o.w} className={field} /></div>
                      <div><label className={lab}>Altura (células)</label><input name="height" type="number" min="1" max="6" defaultValue={o.h} className={field} /></div>
                    </div>
                    <div><label className={lab}>Observações</label><textarea name="notes" rows={2} defaultValue={o.notes ?? ""} className={field} /></div>
                    <button disabled={pending} className="btn-gold rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60">Guardar alterações</button>
                  </form>
                  <button disabled={pending} onClick={() => { if (confirm(`Desativar o escritório ${o.number}? Deixa de aparecer na planta; o histórico é preservado.`)) run(deactivateOffice(o.id), "Escritório desativado.", onClose); }}
                    className="text-xs text-amber-300 hover:underline">Desativar escritório</button>
                  <button disabled={pending} onClick={() => { if (confirm(`Eliminar definitivamente o escritório ${o.number}? Esta ação não pode ser desfeita.`)) run(deleteOffice(o.id), "Escritório eliminado.", onClose); }}
                    className="ml-4 text-xs text-red-400 hover:underline">Eliminar escritório</button>
                </>
              )}
            </div>
          )}

          {tab === "empresa" && (o.company ? (
            <dl>
              {row("Nome", o.company.name)}{row("NIF", o.company.nif ?? "—")}{row("Telefone", o.company.phone ?? "—")}
              {row("Email", o.company.email ?? "—")}{row("Representante", o.company.rep ?? "—")}
              <div className="pt-4"><Link href={`/escritorios/empresa/${o.company.id}`} className="text-sm text-gold hover:underline">Abrir ficha da empresa →</Link></div>
            </dl>
          ) : <Empty text="Nenhuma empresa associada." officeId={o.id} canEdit={canEdit} />)}

          {tab === "contrato" && (o.contract ? (
            <dl>
              {row("Contrato", o.contract.number)}{row("Estado", o.contract.status === "a_terminar" ? "A terminar" : "Ativo")}
              {row("Início", datePt(o.contract.start_date))}{row("Término", datePt(o.contract.end_date))}{row("Dias restantes", o.contract.days_left)}
              {row("Prestações", o.contract.installments_count)}
              <div className="pt-4"><Link href={`/contratos/${o.contract.id}`} className="text-sm text-gold hover:underline">Abrir contrato →</Link></div>
            </dl>
          ) : <Empty text="Nenhum contrato ativo." officeId={o.id} canEdit={canEdit} />)}

          {tab === "financeiro" && (o.contract ? (
            <dl>
              {row("Total contratado", kz(o.contract.total_value))}{row("Total pago", kz(o.contract.paid_total))}{row("Saldo em falta", kz(o.contract.remaining_total))}
              {row("Próximo vencimento", o.contract.next_due_date ? datePt(o.contract.next_due_date) : "—")}
              {row("Em atraso", o.overdue > 0 ? <span className="font-medium text-red-400">{kz(o.overdue)}</span> : "Sem atrasos")}
            </dl>
          ) : <p className="text-sm text-slate-400">Sem contrato ativo, não há dados financeiros em curso.</p>)}

          {tab === "historico" && (o.history.length === 0 ? <p className="text-sm text-slate-400">Sem contratos anteriores neste escritório.</p> : (
            <ul className="space-y-3">
              {o.history.map((h) => (
                <li key={h.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex justify-between"><b>{h.company}</b><span className="text-xs text-slate-400">{h.status === "cancelado" ? "Cancelado" : "Expirado"}</span></div>
                  <div className="text-xs text-slate-400">{h.number} · {datePt(h.start_date)} → {datePt(h.end_date)}</div>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </aside>
    </>
  );
}

function Empty({ text, officeId, canEdit }: { text: string; officeId: string; canEdit: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-400">{text}</p>
      {canEdit && <Link href={`/contratos/novo?office=${officeId}`} className="btn-gold inline-block rounded-lg px-4 py-2.5 font-semibold">Atribuir empresa / criar contrato</Link>}
    </div>
  );
}

function NewOfficeModal({ buildings, pending, onClose, run, onCreated }: { buildings: Building[]; pending: boolean; onClose: () => void; run: RunFn; onCreated: (id?: string) => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Novo escritório" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(createOfficeBoard(fd), "Escritório criado.", (r) => onCreated(r.id)); }}
        className="w-full max-w-2xl space-y-5 rounded-2xl border border-line bg-[#06111a] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h2 className="font-serif text-3xl">Novo escritório</h2><p className="text-sm text-slate-400">A posição na planta é atribuída automaticamente se a deixar em branco.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-300 hover:bg-white/5"><I.Close className="size-5" /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={lab}>Edifício *</label><select name="building_id" required className={field}>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><label className={lab}>Número / código *</label><input name="number" required placeholder="ex.: 125" className={field} /></div>
          <div><label className={lab}>Área (m²) *</label><input name="area_m2" type="number" step="0.01" min="0.01" required className={field} /></div>
          <div><label className={lab}>Estado inicial</label><select name="status" defaultValue="livre" className={field}>{Object.entries(STATUS).filter(([k]) => k !== "ocupado").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label className={lab}>Renda mensal (Kz)</label><input name="monthly_value" type="number" min="0" className={field} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lab}>Largura</label><input name="width" type="number" min="1" max="6" defaultValue={1} className={field} /></div>
            <div><label className={lab}>Altura</label><input name="height" type="number" min="1" max="6" defaultValue={1} className={field} /></div>
          </div>
          <div><label className={lab}>Coluna na planta (opcional)</label><input name="position_x" type="number" min="0" max="23" placeholder="auto" className={field} /></div>
          <div><label className={lab}>Linha na planta (opcional)</label><input name="position_y" type="number" min="0" placeholder="auto" className={field} /></div>
        </div>
        <div><label className={lab}>Observações</label><textarea name="notes" rows={2} className={field} /></div>
        <p className="text-xs text-slate-400">Para ligar uma empresa, crie depois o contrato: o escritório passa a ocupado e mostra os dados da empresa na planta.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-white/5">Cancelar</button>
          <button disabled={pending} className="btn-gold rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar escritório"}</button>
        </div>
      </form>
    </div>
  );
}
