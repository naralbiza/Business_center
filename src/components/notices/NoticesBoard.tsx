"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { NoticeCat, NoticeVM } from "@/lib/noticesBoard";
import { markAllNoticesBoard, setNoticeReadBoard } from "@/app/actions";
import * as I from "@/components/icons";

type Ico = React.ComponentType<{ className?: string }>;
const CAT: Record<NoticeCat, { label: string; color: string; icon: Ico; open: string }> = {
  eventos: { label: "Eventos", color: "#b79cff", icon: I.Calendar, open: "Abrir na agenda" },
  contratos: { label: "Contratos", color: "#7cc4f5", icon: I.File, open: "Ver contratos" },
  financeiro: { label: "Financeiro", color: "#6fd3a4", icon: I.Coins, open: "Ver pagamentos" },
  operacoes: { label: "Operações", color: "#f0b95a", icon: I.Wrench, open: "Ver operações" },
  rh: { label: "Recursos Humanos", color: "#f49ab0", icon: I.Users, open: "Ver equipa" },
  seguranca: { label: "Segurança", color: "#f0817a", icon: I.Shield, open: "Ver utilizadores" },
};
const TABS: (NoticeCat | "todas")[] = ["todas", "eventos", "contratos", "financeiro", "operacoes", "rh"];
const tint = (c: string, a: number) => `color-mix(in srgb, ${c} ${a}%, transparent)`;
const TZ = "Africa/Luanda";
const dayKey = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: TZ });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60e3));
  if (m < 1) return "Agora";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
}
function groupOf(iso: string, now: number) {
  const k = dayKey(Date.parse(iso));
  if (k === dayKey(now)) return "Hoje";
  if (k === dayKey(now - 864e5)) return "Ontem";
  return Date.parse(iso) > now - 7 * 864e5 ? "Esta semana" : "Mais antigas";
}
// Extrai factos úteis do texto (datas, horas, valores, referências) para mostrar como contexto estruturado
function facts(n: NoticeVM): [string, string][] {
  const b = n.body, out: [string, string][] = [];
  const add = (k: string, re: RegExp, f: (m: RegExpMatchArray) => string = (m) => m[0]) => { const m = b.match(re); if (m) out.push([k, f(m)]); };
  add("Referência", /#[A-Z]+-\d{4}-\d+/);
  add("Empresa", /empresa ([A-ZÀ-Ú][^.,]*?)(?= vence| foi|\.|,|$)/, (m) => m[1]);
  add("Valor", /[\d.]+\s?Kz/);
  add("Data", /\d{2}\/\d{2}\/\d{4}/);
  add("Hora", /\d{1,2}:\d{2}/);
  add("Origem", /IP [\d.]+/, (m) => m[0].slice(3));
  add("Prazo", /em \d+ dias/, (m) => m[0].slice(3));
  return out;
}

export default function NoticesBoard({ items: initial }: { items: NoticeVM[] }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<NoticeCat | "todas">("todas");
  const [oldest, setOldest] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60e3); return () => clearInterval(t); }, []);

  const unread = (c: NoticeCat | "todas") => items.filter((n) => !n.read && (c === "todas" || n.cat === c)).length;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = items.filter((n) => (tab === "todas" || n.cat === tab) && (!onlyUnread || !n.read) && (!s || `${n.title} ${n.body}`.toLowerCase().includes(s)));
    return [...l].sort((a, b) => (oldest ? 1 : -1) * (Date.parse(a.at) - Date.parse(b.at)));
  }, [items, tab, oldest, onlyUnread, q]);
  const groups = useMemo(() => {
    const m = new Map<string, NoticeVM[]>();
    for (const n of list) { const g = groupOf(n.at, now); m.set(g, [...(m.get(g) ?? []), n]); }
    return [...m.entries()];
  }, [list, now]);
  const sel = items.find((n) => n.id === selId) ?? null;
  const idx = list.findIndex((n) => n.id === selId);

  const setRead = (id: string, read: boolean) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read } : n)));
    start(async () => { await setNoticeReadBoard(id, read).catch(() => null); });
  };
  const open = (n: NoticeVM) => { setSelId(n.id); if (!n.read) setRead(n.id, true); };
  const markAll = () => { setItems((p) => p.map((n) => ({ ...n, read: true }))); start(async () => { await markAllNoticesBoard().catch(() => null); }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      const move = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
      if (move && list.length) {
        e.preventDefault();
        const n = list[Math.min(list.length - 1, Math.max(0, idx + move))];
        setSelId(n.id);
        if (!n.read) { setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x))); void setNoticeReadBoard(n.id, true).catch(() => null); }
      }
      if (e.key === "u" && sel) setRead(sel.id, !sel.read);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = unread("todas");

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold/80">Administração</p>
          <h1 className="mt-1 text-[44px] leading-[1.05] tracking-tight text-balance">Notificações</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            {total > 0 ? <><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/60" /><span className="relative inline-flex size-2 rounded-full bg-gold" /></span><span><b className="font-medium tabular-nums text-slate-100">{total}</b> por ler</span></> : <span className="flex items-center gap-1.5"><I.Check className="size-4 text-emerald-400" />Tudo em dia</span>}
            <span className="text-slate-600">·</span><span className="tabular-nums">{items.length} no total</span>
          </p>
        </div>
        <button onClick={markAll} disabled={pending || total === 0}
          className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-200 transition hover:border-gold/50 hover:bg-gold/[0.06] disabled:pointer-events-none disabled:opacity-40">
          <I.Check className="size-4 text-gold transition group-hover:scale-110" />Marcar todas como lidas
        </button>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#0a1721] to-[#07121a] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
          <div className="border-b border-white/[0.06] px-2">
            <div className="flex gap-1 overflow-x-auto px-2 pt-1 [scrollbar-width:none]" role="tablist">
              {TABS.map((k) => {
                const on = tab === k, n = unread(k);
                return (
                  <button key={k} role="tab" aria-selected={on} onClick={() => setTab(k)}
                    className={`relative whitespace-nowrap px-3.5 py-3.5 text-[13px] transition ${on ? "text-white" : "text-slate-400 hover:text-slate-200"}`}>
                    {k === "todas" ? "Todas" : CAT[k].label}
                    {n > 0 && <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10.5px] font-semibold tabular-nums ${on ? "bg-gold text-[#1a1305]" : "bg-white/10 text-slate-300"}`}>{n}</span>}
                    {on && <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-gold" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <label className="relative flex-1">
              <I.Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar notificações" aria-label="Pesquisar notificações"
                className="w-full rounded-lg border border-white/[0.07] bg-black/20 py-2 pl-9 pr-9 text-sm outline-none transition placeholder:text-slate-500 focus:border-gold/50" />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 text-[10px] text-slate-500">/</kbd>
            </label>
            <div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-0.5 text-xs">
              {([[false, "Todas"], [true, "Por ler"]] as const).map(([v, l]) => (
                <button key={l} onClick={() => setOnlyUnread(v)} className={`rounded-md px-3 py-1.5 transition ${onlyUnread === v ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => setOldest((v) => !v)} title="Alterar ordenação" aria-label="Alterar ordenação"
              className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-xs text-slate-300 transition hover:text-white">{oldest ? "↑ Antigas" : "↓ Recentes"}</button>
          </div>

          <div className="max-h-[calc(100vh-300px)] min-h-[360px] overflow-y-auto">
            {groups.map(([g, rows]) => (
              <div key={g}>
                <div className="sticky top-0 z-10 flex items-center gap-3 bg-[#08141d]/95 px-5 py-2 backdrop-blur">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-500">{g}</span><span className="h-px flex-1 bg-white/[0.05]" />
                </div>
                <ul>
                  {rows.map((n) => {
                    const c = CAT[n.cat], Icon = c.icon, on = sel?.id === n.id;
                    return (
                      <li key={n.id} className="group relative">
                        <button onClick={() => open(n)} aria-current={on}
                          className={`flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors ${on ? "bg-white/[0.055]" : "hover:bg-white/[0.03]"}`}>
                          {on && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gold" />}
                          <span className="relative grid size-11 shrink-0 place-items-center rounded-full" style={{ background: tint(c.color, 12), boxShadow: `inset 0 0 0 1px ${tint(c.color, 30)}`, color: c.color }}>
                            <Icon className="size-[19px]" />
                            {!n.read && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-[#08141d] bg-gold" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className={`truncate text-[14.5px] ${n.read ? "text-slate-300" : "font-semibold text-white"}`}>{n.title}</span>
                            </span>
                            <span className={`mt-0.5 line-clamp-1 text-[13px] ${n.read ? "text-slate-500" : "text-slate-400"}`}>{n.body}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-[11.5px] tabular-nums text-slate-500">{ago(n.at, now)}</span>
                            <span className="text-[10px] uppercase tracking-wider" style={{ color: tint(c.color, 85) }}>{c.label.split(" ")[0]}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {list.length === 0 && (
              <div className="grid place-items-center gap-3 px-6 py-20 text-center">
                <span className="grid size-14 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-slate-400"><I.Bell className="size-6" /></span>
                <div><p className="font-medium">{q || onlyUnread || tab !== "todas" ? "Nada corresponde aos filtros" : "Sem notificações"}</p>
                  <p className="mt-1 text-sm text-slate-500">{q || onlyUnread || tab !== "todas" ? "Experimente limpar a pesquisa ou mudar de separador." : "Quando houver novidades, aparecem aqui."}</p></div>
                {(q || onlyUnread || tab !== "todas") && <button onClick={() => { setQ(""); setOnlyUnread(false); setTab("todas"); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">Limpar filtros</button>}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-2.5 text-[11px] text-slate-500">
            <span className="tabular-nums">{list.length} de {items.length}</span>
            <span className="hidden gap-3 sm:flex"><span><kbd className="rounded border border-white/10 px-1">↑</kbd> <kbd className="rounded border border-white/10 px-1">↓</kbd> navegar</span><span><kbd className="rounded border border-white/10 px-1">U</kbd> lida/por ler</span></span>
          </div>
        </section>

        <aside className="xl:sticky xl:top-24">
          {!sel ? (
            <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-slate-500">Seleccione uma notificação</div>
          ) : (() => {
            const c = CAT[sel.cat], Icon = c.icon, fs = facts(sel);
            return (
              <article className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#0b1822] to-[#07121a] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
                <div className="relative px-6 pb-5 pt-6" style={{ background: `radial-gradient(120% 90% at 0% 0%, ${tint(c.color, 14)}, transparent 60%)` }}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: tint(c.color, 14), color: c.color, boxShadow: `inset 0 0 0 1px ${tint(c.color, 30)}` }}>
                      <Icon className="size-3.5" />{c.label}
                    </span>
                    <div className="flex items-center gap-1 text-slate-400">
                      <button onClick={() => list[idx - 1] && open(list[idx - 1])} disabled={idx <= 0} aria-label="Anterior" className="rounded-md p-1.5 hover:bg-white/5 disabled:opacity-30"><I.ChevL className="size-4" /></button>
                      <button onClick={() => list[idx + 1] && open(list[idx + 1])} disabled={idx < 0 || idx >= list.length - 1} aria-label="Seguinte" className="rounded-md p-1.5 hover:bg-white/5 disabled:opacity-30"><I.ChevR className="size-4" /></button>
                    </div>
                  </div>
                  <h2 className="mt-4 font-serif text-[28px] leading-tight text-balance">{sel.title}</h2>
                  <p className="mt-1.5 text-[13px] text-slate-400">
                    {new Date(sel.at).toLocaleDateString("pt-PT", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" })} às {hm(sel.at)}
                  </p>
                </div>

                <div className="space-y-5 px-6 pb-6">
                  <p className="text-[15px] leading-relaxed text-slate-200 text-pretty">{sel.body || "Sem detalhes adicionais."}</p>

                  {fs.length > 0 && (
                    <dl className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-black/20">
                      {fs.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"><dt className="text-slate-500">{k}</dt><dd className="font-medium tabular-nums text-slate-100">{v}</dd></div>
                      ))}
                    </dl>
                  )}

                  <ol className="relative space-y-3 pl-5 text-[13px] before:absolute before:left-[5px] before:top-1.5 before:h-[calc(100%-12px)] before:w-px before:bg-white/10">
                    <li className="relative"><span className="absolute -left-5 top-1.5 size-[11px] rounded-full border-2 border-[#0b1822] bg-slate-500" /><span className="text-slate-300">Recebida</span><span className="ml-2 text-slate-500 tabular-nums">{hm(sel.at)}</span></li>
                    <li className="relative"><span className={`absolute -left-5 top-1.5 size-[11px] rounded-full border-2 border-[#0b1822] ${sel.read ? "bg-emerald-400" : "bg-gold"}`} /><span className="text-slate-300">{sel.read ? "Marcada como lida" : "Por ler"}</span></li>
                  </ol>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {sel.link && <Link href={sel.link} className="btn-gold inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-[0_8px_24px_-10px_rgba(214,176,106,0.6)] transition hover:brightness-105">{c.open}<I.Arrow className="size-4" /></Link>}
                    <button onClick={() => setRead(sel.id, !sel.read)} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/5">{sel.read ? "Marcar como não lida" : "Marcar como lida"}</button>
                  </div>
                </div>
              </article>
            );
          })()}
        </aside>
      </div>
    </>
  );
}
