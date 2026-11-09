import { connection } from "next/server";
import SettingsBoard from "@/components/settings/SettingsBoard";
import { getMe } from "@/lib/data";
import { roleLabel } from "@/lib/permissions";
import { currentUser, serverClient } from "@/lib/supabase-server";

export const instant = false;

export default async function Configuracoes() {
  await connection();
  const [me, user, sb] = await Promise.all([getMe(), currentUser(), serverClient()]);
  // Tolerante à migração 0020 ainda não aplicada: usa os valores por omissão
  const { data } = await sb.from("app_settings").select("section,value");
  const saved = Object.fromEntries((data ?? []).map((r) => [r.section, r.value as Record<string, string | boolean>]));
  return (
    <SettingsBoard saved={saved} canEdit={(me?.perms.administracao ?? 0) >= 2}
      me={{ name: me?.name ?? "—", email: user?.email ?? "", role: roleLabel(me?.role ?? "") }} />
  );
}
