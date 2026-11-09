"use client";
import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { FailVM, GroupVM, LogVM, SessionVM, UserVM } from "@/lib/usersBoard";
import { LEVELS, MODULES, ROLES, roleLabel } from "@/lib/permissions";
import {
  createUserBoard, deleteGroupBoard, revokeSessionsBoard, saveGroupBoard, setGroupPermission, setRolePermission, setUserActiveBoard, updateUserBoard,
  type ActionResult,
} from "@/app/actions";
import * as I from "@/components/icons";

const TABS = [["utilizadores", "Utilizadores"], ["cargos", "Cargos e Permissões"], ["grupos", "Grupos de Permissões"], ["atividade", "Registo de Actividade"], ["acesso", "Configurações de Acesso"]] as const;
type Tab = (typeof TABS)[number][0];
const DETAIL = [["info", "Informações"], ["perm", "Permissões"], ["sess", "Sessões"], ["hist", "Histórico"]] as const;
type Detail = (typeof DETAIL)[number][0];
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#4f46e5"];
const colorOf = (s: string) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const initials = (n: string) => n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const fld = "w-full rounded-lg border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-gold";
const lab = "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400";
const LV_COLOR = ["bg-white/5 text-slate-500", "bg-sky-500/15 text-sky-300", "bg-amber-500/15 text-amber-300", "bg-emerald-500/15 text-emerald-300"];
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—");
const ACT: Record<string, string> = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Eliminou" };

const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => (
  <span className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.34, background: `linear-gradient(140deg, ${colorOf(name)}, ${colorOf(name)}66)` }}>{initials(name)}</span>
);

export default function UsersBoard({ users, rolePerms, groups, logs, sessions, fails, meId, canManage, isSuper, needsMigration }: {
  users: UserVM[]; rolePerms: Record<string, Record<string, number>>; groups: GroupVM[]; logs: LogVM[]; sessions: SessionVM[]; fails: FailVM[];
  meId: string; canManage: boolean; isSuper: boolean; needsMigration: boolean;
}) {
  const [tab, setTab] = useState<Tab>("utilizadores");
  const [detail, setDetail] = useState<Detail>("info");
  const [query, setQuery] = useState("");
  const [roleF, setRoleF] = useState("todos");
  const [selId, setSelId] = useState<string | null>(users[0]?.id ?? null);
  const [form, setForm] = useState<null | { user?: UserVM }>(null);
  const [groupForm, setGroupForm] = useState<null | { group?: GroupVM }>(null);
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ tone: "ok" | "erro"; text: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const run = (fn: () => Promise<ActionResult>, okText: string, after?: () => void) =>
    start(async () => {
      const r = await fn().catch(() => ({ ok: false, error: "Não foi possível concluir a operação." }) as ActionResult);
      setToast(r.ok ? { tone: "ok", text: okText } : { tone: "erro", text: r.error ?? "Não foi possível concluir a operação." });
      if (r.ok) after?.();
    });

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => (roleF === "todos" || u.role === roleF) &&
      (!q || [u.name, u.email, u.department, roleLabel(u.role)].some((v) => (v ?? "").toLowerCase().includes(q))));
  }, [users, query, roleF]);
  const sel = users.find((u) => u.id === selId) ?? null;
  const active = users.filter((u) => u.active).length;
  const permsConfigured = Object.values(rolePerms).reduce((s, m) => s + Object.values(m).filter((v) => v > 0).length, 0);
  const kpis = [
    { t: "Utilizadores activos", n: active, sub: `${users.length} no total`, icon: I.Users, c: "from-sky-500 to-blue-700" },
    { t: "Cargos / Funções", n: ROLES.length, sub: `${groups.length} grupos`, icon: I.Shield, c: "from-violet-500 to-purple-700" },
    { t: "Permissões configuradas", n: permsConfigured, sub: "cargo × módulo", icon: I.Check, c: "from-emerald-500 to-green-700" },
    { t: "Sessões activas", n: sessions.length, sub: "neste momento", icon: I.Clock, c: "from-amber-500 to-orange-700" },
    { t: "Acessos bloqueados", n: fails.length, sub: "últimos 30 dias", icon: I.Alert, c: "from-rose-500 to-red-700" },
  ];

  const submitUser = (fd: FormData) => {
    const u = form?.user;
    run(() => (u ? updateUserBoard(fd) : createUserBoard(fd)), u ? "Utilizador actualizado." : "Utilizador criado.", () => setForm(null));
  };

  const matrix = (get: (m: string) => number, set: (m: string, l: number) => void, editable: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <tbody>
          {MODULES.map(([k, label]) => (
            <tr key={k} className="border-t border-white/5">
              <td className="py-2 pr-3 text-slate-200">{label}</td>
              <td className="py-2">
                <div className="flex flex-wrap justify-end gap-1">
                  {LEVELS.map(([lv, ln]) => (
                    <button key={lv} type="button" disabled={!editable || pending} onClick={() => set(k, lv)}
                      className={`rounded-md px-2 py-1 text-[11px] transition ${get(k) === lv ? LV_COLOR[lv] + " ring-1 ring-current" : "text-slate-500 hover:bg-white/5"} disabled:cursor-default`}>{ln}</button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const userSessions = sessions.filter((s) => s.user_id === sel?.id);
  const userLogs = logs.filter((l) => l.user === sel?.name).slice(0, 12);
  const effective = (u: UserVM) => {
    const m: Record<string, number> = { ...(rolePerms[u.role] ?? {}) };
    if (u.role === "super_admin") MODULES.forEach(([k]) => { m[k] = 3; });
    const g = groups.find((x) => x.id === u.group_id);
    if (g) for (const [k, v] of Object.entries(g.perms)) m[k] = Math.max(m[k] ?? 0, v);
    return m;
  };

  return (
    <>
      <section className="relative isolate -mx-4 -mt-[calc(4rem+1rem)] overflow-hidden px-4 pb-4 pt-[calc(4rem+0.75rem)] md:-mx-6 md:-mt-[calc(4rem+1.5rem)] md:px-6">
        <Image src="/hero-rh.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: "right center" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#020b13]/90 via-[#020b13]/30 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#020b13] via-transparent to-[#020b13]/40" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-5xl leading-none md:text-6xl">Utilizadores e Permissões</h1>
            <p className="mt-3 max-w-md text-sm leading-snug text-slate-100">Controlo de acessos, cargos, grupos e sessões. As permissões são aplicadas na base de dados, não apenas na interface.</p>
          </div>
          {canManage && <button onClick={() => setForm({})} className="btn-gold flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-lg hover:brightness-105"><I.Plus className="size-5" />Novo Utilizador</button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#07121b]/85 p-3 backdrop-blur">
              <span className={`grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ${k.c}`}><k.icon className="size-5" /></span>
              <div className="min-w-0"><div className="text-xl font-semibold leading-tight">{k.n}</div><div className="truncate text-xs text-slate-200">{k.t}</div><div className="truncate text-[11px] text-slate-400">{k.sub}</div></div>
            </div>
          ))}
        </div>
      </section>

      {needsMigration && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">Para activar as permissões reais, aplique as migrações 0018_roles_enum.sql e 0019_permissions.sql no Supabase.</p>}

      <nav className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm transition ${tab === k ? "bg-gradient-to-r from-[#5a4a2a] to-[#2a2518] text-white ring-1 ring-gold/50" : "text-slate-300 hover:bg-white/5"}`}>{l}</button>
        ))}
      </nav>

      {tab === "utilizadores" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="rounded-2xl border border-line bg-panel p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <div className="relative min-w-[200px] flex-1"><I.Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar por nome, email, departamento ou cargo" className={fld + " pl-9"} /></div>
              <select value={roleF} onChange={(e) => setRoleF(e.target.value)} className={fld + " !w-auto"}>
                <option value="todos">Todos os cargos</option>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400"><th className="pb-2">Utilizador</th><th>Cargo</th><th>Departamento</th><th>Último acesso</th><th>Estado</th></tr></thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} onClick={() => setSelId(u.id)} className={`cursor-pointer border-t border-white/5 hover:bg-white/[0.03] ${sel?.id === u.id ? "bg-white/[0.05]" : ""}`}>
                      <td className="py-2.5"><div className="flex items-center gap-3"><Avatar name={u.name} /><div className="min-w-0"><div className="truncate font-medium">{u.name}</div><div className="truncate text-xs text-slate-400">{u.email ?? "—"}</div></div></div></td>
                      <td>{roleLabel(u.role)}</td><td className="text-slate-300">{u.department ?? "—"}</td><td className="text-slate-300">{dt(u.last_sign_in)}</td>
                      <td><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${u.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}>{u.active ? "Activo" : "Inactivo"}</span></td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Nenhum utilizador encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-2xl border border-line bg-panel p-4">
            {!sel ? <p className="py-10 text-center text-sm text-slate-400">Seleccione um utilizador.</p> : (
              <>
                <div className="flex items-center gap-3"><Avatar name={sel.name} size={52} />
                  <div className="min-w-0"><div className="truncate font-serif text-xl">{sel.name}</div><div className="truncate text-xs text-slate-400">{roleLabel(sel.role)}</div></div></div>
                <div className="mt-4 flex gap-1 rounded-lg bg-panel2 p-1">
                  {DETAIL.map(([k, l]) => <button key={k} onClick={() => setDetail(k)} className={`flex-1 rounded-md px-2 py-1.5 text-xs ${detail === k ? "bg-white/10 text-white" : "text-slate-400"}`}>{l}</button>)}
                </div>
                <div className="mt-4 text-sm">
                  {detail === "info" && (
                    <dl className="space-y-2">
                      {[["Email", sel.email], ["Telefone", sel.phone], ["Departamento", sel.department], ["Grupo", sel.group_id ? groupName.get(sel.group_id) : null], ["Último acesso", dt(sel.last_sign_in)], ["Criado em", dt(sel.created_at)]].map(([k, v]) => (
                        <div key={k as string} className="flex justify-between gap-3 border-b border-white/5 pb-1.5"><dt className="text-slate-400">{k}</dt><dd className="truncate text-right">{(v as string) || "—"}</dd></div>
                      ))}
                    </dl>
                  )}
                  {detail === "perm" && matrix((m) => effective(sel)[m] ?? 0, () => {}, false)}
                  {detail === "sess" && (userSessions.length === 0 ? <p className="text-slate-400">Sem sessões activas.</p> : (
                    <ul className="space-y-2">{userSessions.map((s) => <li key={s.id} className="rounded-lg border border-line p-2.5 text-xs"><div>{s.agent?.slice(0, 60) ?? "Dispositivo"}</div><div className="text-slate-400">{s.ip ?? "—"} · {dt(s.updated_at)}</div></li>)}</ul>
                  ))}
                  {detail === "hist" && (userLogs.length === 0 ? <p className="text-slate-400">Sem actividade registada.</p> : (
                    <ul className="space-y-2">{userLogs.map((l) => <li key={l.id} className="border-b border-white/5 pb-1.5 text-xs">{ACT[l.action] ?? l.action} {l.entity}{l.detail ? ` · ${l.detail}` : ""}<div className="text-slate-500">{dt(l.at)}</div></li>)}</ul>
                  ))}
                </div>
                {canManage && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button onClick={() => setForm({ user: sel })} className="rounded-lg border border-line px-3 py-2 text-xs hover:bg-white/5"><I.Pencil className="mr-1 inline size-3.5" />Editar</button>
                    {sel.id !== meId && <button disabled={pending} onClick={() => run(() => setUserActiveBoard(sel.id, !sel.active), sel.active ? "Utilizador desactivado." : "Utilizador activado.")} className="rounded-lg border border-line px-3 py-2 text-xs hover:bg-white/5">{sel.active ? "Desactivar" : "Activar"}</button>}
                    {sel.id !== meId && <button disabled={pending} onClick={() => run(() => revokeSessionsBoard(sel.id), "Sessões terminadas.")} className="rounded-lg border border-bad/40 px-3 py-2 text-xs text-red-300 hover:bg-bad/10">Terminar sessões</button>}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {tab === "cargos" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {ROLES.map(([r, label, desc]) => (
            <div key={r} className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-2 flex items-center justify-between"><div><h3 className="font-serif text-xl">{label}</h3><p className="text-xs text-slate-400">{desc}</p></div>
                <span className="text-xs text-slate-400">{users.filter((u) => u.role === r).length} utilizadores</span></div>
              {matrix((m) => (r === "super_admin" ? 3 : rolePerms[r]?.[m] ?? 0), (m, lv) => run(() => setRolePermission(r, m, lv), "Permissão actualizada."), isSuper && r !== "super_admin")}
            </div>
          ))}
          {!isSuper && <p className="text-xs text-slate-400 lg:col-span-2">Apenas o Super Admin pode alterar as permissões dos cargos.</p>}
        </div>
      )}

      {tab === "grupos" && (
        <div className="space-y-4">
          {canManage && isSuper && <button onClick={() => setGroupForm({})} className="btn-gold flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"><I.Plus className="size-4" />Novo grupo</button>}
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <div key={g.id} className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-2 flex items-start justify-between gap-2"><div><h3 className="font-serif text-xl">{g.name}</h3><p className="text-xs text-slate-400">{g.description ?? "—"} · {users.filter((u) => u.group_id === g.id).length} utilizadores</p></div>
                  {isSuper && <div className="flex gap-1">
                    <button onClick={() => setGroupForm({ group: g })} aria-label="Editar" className="rounded-md p-1.5 hover:bg-white/5"><I.Pencil className="size-4" /></button>
                    <button onClick={() => { if (confirm(`Eliminar o grupo "${g.name}"?`)) run(() => deleteGroupBoard(g.id), "Grupo eliminado."); }} aria-label="Eliminar" className="rounded-md p-1.5 text-red-300 hover:bg-bad/10"><I.Close className="size-4" /></button>
                  </div>}
                </div>
                {matrix((m) => g.perms[m] ?? 0, (m, lv) => run(() => setGroupPermission(g.id, m, lv), "Permissão actualizada."), isSuper)}
              </div>
            ))}
            {groups.length === 0 && <p className="text-sm text-slate-400">Ainda não existem grupos.</p>}
          </div>
        </div>
      )}

      {tab === "atividade" && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel p-4">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400"><th className="pb-2">Data</th><th>Utilizador</th><th>Acção</th><th>Módulo</th><th>Detalhe</th></tr></thead>
            <tbody>
              {logs.map((l) => <tr key={l.id} className="border-t border-white/5"><td className="py-2 text-slate-300">{dt(l.at)}</td><td>{l.user}</td><td>{ACT[l.action] ?? l.action}</td><td>{l.entity}</td><td className="text-slate-300">{l.detail || "—"}</td></tr>)}
              {logs.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Sem actividade registada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "acesso" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-panel p-4">
            <h3 className="mb-3 font-serif text-xl">Sessões activas</h3>
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
                  <div className="min-w-0"><div className="truncate">{s.user}</div><div className="truncate text-xs text-slate-400">{s.ip ?? "—"} · {dt(s.updated_at)}</div></div>
                  {canManage && s.user_id !== meId && <button disabled={pending} onClick={() => run(() => revokeSessionsBoard(s.user_id), "Sessões terminadas.")} className="shrink-0 rounded-lg border border-bad/40 px-3 py-1.5 text-xs text-red-300 hover:bg-bad/10">Terminar</button>}
                </li>
              ))}
              {sessions.length === 0 && <li className="text-sm text-slate-400">Sem sessões activas visíveis.</li>}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-panel p-4">
            <h3 className="mb-3 font-serif text-xl">Tentativas de acesso falhadas (30 dias)</h3>
            <ul className="space-y-2">
              {fails.slice(0, 30).map((f) => <li key={f.id} className="flex justify-between gap-3 rounded-lg border border-line p-3 text-sm"><span className="truncate">{f.email || "—"}</span><span className="shrink-0 text-xs text-slate-400">{dt(f.at)}</span></li>)}
              {fails.length === 0 && <li className="text-sm text-slate-400">Nenhuma tentativa falhada registada.</li>}
            </ul>
          </div>
        </div>
      )}

      {form && (
        <Modal title={form.user ? form.user.name : "Novo utilizador"} subtitle="Cargo, departamento e grupo de permissões." onClose={() => setForm(null)}>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (form.user) fd.set("id", form.user.id); submitUser(fd); }} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={lab}>Nome completo *</label><input name="name" required defaultValue={form.user?.name} className={fld} /></div>
              {!form.user && <>
                <div><label className={lab}>Email *</label><input name="email" type="email" required autoComplete="off" className={fld} /></div>
                <div><label className={lab}>Palavra-passe * (mín. 8)</label><input name="password" type="password" required minLength={8} autoComplete="new-password" className={fld} /></div>
              </>}
              <div><label className={lab}>Cargo</label>
                <select name="role" defaultValue={form.user?.role ?? "operador"} className={fld}>{ROLES.filter(([v]) => isSuper || v !== "super_admin").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label className={lab}>Grupo</label>
                <select name="group_id" defaultValue={form.user?.group_id ?? ""} className={fld}><option value="">Sem grupo</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
              <div><label className={lab}>Departamento</label><input name="department" defaultValue={form.user?.department ?? ""} className={fld} /></div>
              <div><label className={lab}>Telefone</label><input name="phone" defaultValue={form.user?.phone ?? ""} className={fld} /></div>
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancelar</button>
              <button disabled={pending} className="btn-gold rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-60">{pending ? "A guardar…" : "Guardar"}</button></div>
          </form>
        </Modal>
      )}
      {groupForm && (
        <Modal title={groupForm.group ? "Editar grupo" : "Novo grupo"} onClose={() => setGroupForm(null)}>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (groupForm.group) fd.set("id", groupForm.group.id); run(() => saveGroupBoard(fd), "Grupo guardado.", () => setGroupForm(null)); }} className="space-y-4">
            <div><label className={lab}>Nome *</label><input name="name" required defaultValue={groupForm.group?.name} className={fld} /></div>
            <div><label className={lab}>Descrição</label><input name="description" defaultValue={groupForm.group?.description ?? ""} className={fld} /></div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setGroupForm(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancelar</button>
              <button disabled={pending} className="btn-gold rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-60">Guardar</button></div>
          </form>
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
