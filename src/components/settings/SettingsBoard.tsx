"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { SECTIONS, sectionDefaults, type Field } from "@/lib/settings";
import { saveSettingsBoard } from "@/app/actions";
import * as I from "@/components/icons";

type Vals = Record<string, string | boolean>;
type Ico = React.ComponentType<{ className?: string }>;
const ICONS: Record<string, Ico> = { gear: I.Gear, building: I.Building, receipt: I.Receipt, bell: I.Bell, shield: I.Shield, sun: I.Sun, list: I.List, folder: I.Folder, wrench: I.Wrench };
const TONES = ["#d6b06a", "#7cc4f5", "#6fd3a4", "#f0b95a", "#f0817a", "#b79cff", "#f49ab0", "#7cc4f5", "#9aa7bd"];
const fld = "w-full rounded-lg border border-white/10 bg-black/25 px-3.5 py-2.5 text-sm outline-none transition focus:border-gold/60 focus:ring-2 focus:ring-gold/10 disabled:opacity-60";

export default function SettingsBoard({ saved, canEdit, me }: { saved: Record<string, Vals>; canEdit: boolean; me: { name: string; email: string; role: string } }) {
  const [current, setCurrent] = useState(SECTIONS[0].id);
  const [values, setValues] = useState<Record<string, Vals>>(() => Object.fromEntries(SECTIONS.map((s) => [s.id, { ...sectionDefaults(s), ...(saved[s.id] ?? {}) }])));
  const [base, setBase] = useState(values);
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const sec = SECTIONS.find((s) => s.id === current)!;
  const Icon = ICONS[sec.icon] ?? I.Gear;
  const v = values[current];
  const dirty = useMemo(() => SECTIONS.filter((s) => JSON.stringify(values[s.id]) !== JSON.stringify(base[s.id])).map((s) => s.id), [values, base]);
  const set = (key: string, val: string | boolean) => setValues((p) => ({ ...p, [current]: { ...p[current], [key]: val } }));

  const save = () => start(async () => {
    const r = await saveSettingsBoard(current, values[current]).catch(() => ({ ok: false, error: "Não foi possível guardar." }));
    if (r.ok) { setBase((p) => ({ ...p, [current]: values[current] })); setToast({ tone: "ok", text: "Alterações guardadas." }); }
    else setToast({ tone: "erro", text: r.error ?? "Não foi possível guardar." });
  });
  const discard = () => setValues((p) => ({ ...p, [current]: base[current] }));

  const input = (f: Field) => {
    const val = v[f.key];
    if (f.type === "select") return <select value={String(val)} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)} className={fld}>{f.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>;
    return <input type={f.type === "number" ? "text" : f.type} inputMode={f.type === "number" ? "decimal" : undefined} value={String(val)} disabled={!canEdit} onChange={(e) => set(f.key, e.target.value)} required={f.required} className={fld} />;
  };

  return (
    <>
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-6 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13] via-[#020b13]/80 to-[#020b13]/10" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/50" />
        <p className="flex items-center gap-2 text-sm text-slate-400"><I.Shield className="size-4" />Administração <span className="text-slate-600">›</span> Configurações</p>
        <h1 className="mt-2 text-5xl leading-none md:text-6xl">Configurações</h1>
        <p className="mt-3 max-w-xl text-sm text-slate-200">Personalize o sistema do Business Center Esperança de acordo com as suas necessidades.</p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-24">
          <nav className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#07131b]" aria-label="Secções">
            {SECTIONS.map((s, i) => {
              const Ic = ICONS[s.icon] ?? I.Gear, on = s.id === current, tone = TONES[i % TONES.length];
              return (
                <button key={s.id} onClick={() => setCurrent(s.id)} aria-current={on}
                  className={`relative flex w-full items-center gap-3.5 border-b border-white/[0.05] px-4 py-3.5 text-left transition last:border-0 ${on ? "bg-gradient-to-r from-gold/[0.14] to-transparent" : "hover:bg-white/[0.03]"}`}>
                  {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-gold" />}
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 28%, transparent)` }}><Ic className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className={`truncate text-[14.5px] ${on ? "text-white" : "text-slate-100"}`}>{s.title}</span>{dirty.includes(s.id) && <span className="size-1.5 rounded-full bg-gold" title="Alterações por guardar" />}</span>
                    <span className="block truncate text-xs text-slate-400">{s.subtitle}</span>
                  </span>
                  <I.ChevR className={`size-4 shrink-0 ${on ? "text-gold" : "text-slate-500"}`} />
                </button>
              );
            })}
          </nav>
          <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#0d1b26] to-[#07131b] p-5">
            <h3 className="font-serif text-lg">Precisa de ajuda?</h3>
            <p className="mt-1 text-sm text-slate-400">Consulte a documentação ou contacte o suporte técnico.</p>
            <Link href="/notificacoes" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gold/40 px-4 py-2 text-sm text-gold-soft transition hover:bg-gold/10">Aceder ao suporte <I.Arrow className="size-4" /></Link>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (canEdit) save(); }} className="rounded-2xl border border-white/[0.07] bg-[#07131b] p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-gold"><Icon className="size-3.5" />{sec.title}</p>
              <h2 className="mt-2 text-4xl leading-tight">{sec.heading}</h2>
              <p className="mt-1 text-sm text-slate-400">{sec.description}</p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                {dirty.includes(current) && <button type="button" onClick={discard} className="rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:text-white">Descartar</button>}
                <button disabled={pending || !dirty.includes(current)} className="btn-gold flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-lg transition hover:brightness-105 disabled:opacity-50">
                  <I.Check className="size-4" />{pending ? "A guardar…" : "Guardar alterações"}
                </button>
              </div>
            )}
          </div>
          {!canEdit && <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300">Está em modo de leitura. Apenas administradores podem alterar as configurações.</p>}

          <div className="mt-6 grid gap-4">
            {current === "geral" && (
              <div className="rounded-xl border border-white/[0.07] bg-black/15 p-5">
                <h3 className="font-serif text-lg">A minha conta</h3>
                <p className="text-sm text-slate-400">Sessão iniciada neste momento.</p>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-slate-500">Nome</dt><dd>{me.name}</dd></div>
                  <div><dt className="text-slate-500">Email</dt><dd className="truncate">{me.email || "—"}</dd></div>
                  <div><dt className="text-slate-500">Cargo</dt><dd>{me.role}</dd></div>
                </dl>
              </div>
            )}
            {sec.groups.map((g) => (
              <div key={g.title} className="rounded-xl border border-white/[0.07] bg-black/15 p-5">
                <h3 className="font-serif text-lg">{g.title}</h3>
                {g.subtitle && <p className="text-sm text-slate-400">{g.subtitle}</p>}
                {g.layout === "toggles" ? (
                  <ul className="mt-3 divide-y divide-white/[0.06]">
                    {g.fields.map((f) => {
                      const on = Boolean(v[f.key]);
                      return (
                        <li key={f.key} className="flex items-center justify-between gap-4 py-3">
                          <div><div className="text-sm text-slate-100">{f.label}</div>{f.hint && <div className="text-xs text-slate-500">{f.hint}</div>}</div>
                          <button type="button" role="switch" aria-checked={on} aria-label={f.label} disabled={!canEdit} onClick={() => set(f.key, !on)}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-gold" : "bg-white/15"}`}>
                            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {g.fields.map((f) => (
                      <label key={f.key} className={f.span === 2 ? "sm:col-span-2" : ""}>
                        <span className="mb-1.5 block text-[13px] text-slate-300">{f.label}{f.required && <span className="text-red-400"> *</span>}</span>
                        {input(f)}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </form>
      </div>
      {toast && <div role="status" className={`fixed bottom-5 right-5 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toast.tone === "ok" ? "border-ok/50 bg-[#062417]/95 text-emerald-200" : "border-bad/50 bg-[#2a0b0d]/95 text-red-200"}`}>{toast.text}</div>}
    </>
  );
}
