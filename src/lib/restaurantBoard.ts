import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";

export type TableStatus = "livre" | "ocupada" | "reservada" | "preparar" | "bloqueada";
export type ResStatus = "confirmada" | "aguardar" | "a_chegar" | "em_curso" | "concluida" | "cancelada";
export interface TableVM { id: string; code: string; area: string; capacity: number; x: number; y: number; status: TableStatus }
export interface RResVM {
  id: string; table_id: string | null; table_code: string | null; client: string; phone: string | null; party_size: number;
  starts_at: string; duration_min: number; status: ResStatus; notes: string | null;
}
export interface RestaurantBoardData { ready: boolean; tables: TableVM[]; reservations: RResVM[]; canEdit: boolean; today: string }

export async function getRestaurantBoard(): Promise<RestaurantBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10); // data em Luanda (UTC+1)
  const from = new Date(Date.now() - 45 * 864e5).toISOString(), to = new Date(Date.now() + 75 * 864e5).toISOString();

  const [tR, rR, me] = await Promise.all([
    sb.from("restaurant_tables").select("id,code,area,capacity,pos_x,pos_y,status").eq("is_active", true).order("code"),
    sb.from("restaurant_reservations").select("id,table_id,client,phone,party_size,starts_at,duration_min,status,notes").gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(3000),
    getMe(),
  ]);
  if (tR.error || rR.error) return { ready: false, tables: [], reservations: [], canEdit: false, today };

  const tables: TableVM[] = (tR.data ?? []).map((t) => ({ id: t.id, code: t.code, area: t.area, capacity: t.capacity, x: Number(t.pos_x), y: Number(t.pos_y), status: t.status as TableStatus }));
  const code = new Map(tables.map((t) => [t.id, t.code]));
  const reservations: RResVM[] = (rR.data ?? []).map((r) => ({
    id: r.id, table_id: r.table_id, table_code: r.table_id ? code.get(r.table_id) ?? null : null, client: r.client, phone: r.phone,
    party_size: r.party_size, starts_at: r.starts_at, duration_min: r.duration_min, status: r.status as ResStatus, notes: r.notes,
  }));
  return { ready: true, tables, reservations, canEdit: canDo(me?.perms, "restaurante"), today };
}
