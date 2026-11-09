import UsersBoard from "@/components/users/UsersBoard";
import { getUsersBoard } from "@/lib/usersBoard";

export const instant = false;

export default async function Utilizadores() {
  const d = await getUsersBoard();
  if ((d.perms.administracao ?? 0) < 1) {
    return <p className="rounded-xl border border-line bg-panel p-6 text-sm text-slate-300">Não tem permissão para aceder a esta página.</p>;
  }
  return <UsersBoard users={d.users} rolePerms={d.rolePerms} groups={d.groups} logs={d.logs} sessions={d.sessions} fails={d.fails}
    meId={d.meId} canManage={d.canManage} isSuper={d.isSuper} needsMigration={d.needsMigration} />;
}
