import { connection } from "next/server";
import { getMe } from "./data";
import { DEFAULT_ROLE_PERMS } from "./permissions";
import { currentUser, requireUser, serverClient } from "./supabase-server";

export interface UserVM {
  id: string; name: string; email: string | null; role: string; department: string | null; phone: string | null;
  group_id: string | null; active: boolean; last_sign_in: string | null; created_at: string | null;
}
export interface GroupVM { id: string; name: string; description: string | null; perms: Record<string, number> }
export interface LogVM { id: number; at: string; user: string; action: string; entity: string; detail: string }
export interface SessionVM { id: string; user_id: string; user: string; created_at: string; updated_at: string; agent: string | null; ip: string | null }
export interface FailVM { id: number; email: string | null; at: string }
export interface UsersBoardData {
  users: UserVM[]; rolePerms: Record<string, Record<string, number>>; groups: GroupVM[]; logs: LogVM[]; sessions: SessionVM[];
  fails: FailVM[]; meId: string; canManage: boolean; isSuper: boolean; needsMigration: boolean; perms: Record<string, number>;
}

export async function getUsersBoard(): Promise<UsersBoardData> {
  await connection();
  await requireUser();
  const user = await currentUser();
  const sb = await serverClient();
  const meP = getMe();
  const prP = Promise.resolve(sb.from("profiles").select("id,full_name,role,active,created_at,department,phone,group_id").order("full_name"));
  let needsMigration = false;

  let pr = await prP;
  if (pr.error) {
    needsMigration = true;
    const base = await sb.from("profiles").select("id,full_name,role,active,created_at").order("full_name");
    if (base.error) throw new Error("Não foi possível carregar os utilizadores.");
    pr = { ...base, data: (base.data ?? []).map((p) => ({ ...p, department: null, phone: null, group_id: null })) } as unknown as typeof pr;
  }
  const [au, rp, gr, gp, lg, se, fl] = await Promise.all([
    sb.rpc("admin_users"),
    sb.from("role_permissions").select("role,module,level"),
    sb.from("permission_groups").select("id,name,description").order("name"),
    sb.from("group_permissions").select("group_id,module,level"),
    sb.from("activity_logs").select("id,user_id,action,entity,detail,created_at").order("created_at", { ascending: false }).limit(300),
    sb.rpc("admin_sessions"),
    sb.from("access_log").select("id,email,created_at").eq("ok", false).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(200),
  ]);
  if (rp.error || gr.error) needsMigration = true;
  const me = await meP;
  const perms = me?.perms ?? {};

  type AuthU = { id: string; email: string; last_sign_in_at: string | null };
  const authBy = new Map(((au.data ?? []) as AuthU[]).map((u) => [u.id, u]));
  const users: UserVM[] = (pr.data ?? []).map((p) => ({
    id: p.id, name: p.full_name, email: authBy.get(p.id)?.email ?? null, role: p.role, department: p.department, phone: p.phone,
    group_id: p.group_id, active: p.active, last_sign_in: authBy.get(p.id)?.last_sign_in_at ?? null, created_at: p.created_at,
  }));
  const uname = new Map(users.map((u) => [u.id, u.name]));

  const rolePerms: Record<string, Record<string, number>> = {};
  for (const [r, m] of Object.entries(DEFAULT_ROLE_PERMS)) rolePerms[r] = { ...m };
  if (!rp.error && (rp.data?.length ?? 0) > 0) {
    for (const r of rp.data!) (rolePerms[r.role] ??= {})[r.module] = r.level;
  }
  const groups: GroupVM[] = (gr.data ?? []).map((g) => {
    const m: Record<string, number> = {};
    (gp.data ?? []).filter((x) => x.group_id === g.id).forEach((x) => { m[x.module] = x.level; });
    return { id: g.id, name: g.name, description: g.description, perms: m };
  });
  const logs: LogVM[] = (lg.data ?? []).map((l) => {
    const d = (l.detail ?? {}) as Record<string, unknown>;
    const label = String(d.full_name ?? d.name ?? d.title ?? d.module ?? d.role ?? "");
    return { id: l.id, at: l.created_at, user: l.user_id ? uname.get(l.user_id) ?? "—" : "Sistema", action: l.action, entity: l.entity, detail: label };
  });
  const sessions: SessionVM[] = ((se.data ?? []) as { id: string; user_id: string; created_at: string; updated_at: string; user_agent: string | null; ip: string | null }[]).map((s) => ({
    id: s.id, user_id: s.user_id, user: uname.get(s.user_id) ?? "—", created_at: s.created_at, updated_at: s.updated_at, agent: s.user_agent, ip: s.ip,
  }));
  const fails: FailVM[] = ((fl.data ?? []) as { id: number; email: string | null; created_at: string }[]).map((f) => ({ id: f.id, email: f.email, at: f.created_at }));

  return { users, rolePerms, groups, logs, sessions, fails, meId: user?.id ?? "", canManage: (perms.administracao ?? 0) >= 2, isSuper: me?.role === "super_admin", needsMigration, perms };
}
