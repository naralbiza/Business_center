import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe, getReservations } from "./data";
import { requireUser, serverClient } from "./supabase-server";
import type { Reservation } from "./types";

export interface LeadVM {
  id: string; name: string; phone: string | null; email: string | null; event_type: string; desired_date: string | null;
  guests: number | null; budget: number | null; stage: string; created_at: string; notes: string | null; source: string | null;
}
export interface CrmBoardData { leads: LeadVM[]; reservations: Reservation[]; canEdit: boolean; needsMigration: boolean; today: string; monthStart: string }

export async function getCrmBoard(): Promise<CrmBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const now = new Date();

  let needsMigration = false;
  const sideP = Promise.all([getReservations(), getMe()]);
  let res = await sb.from("event_leads").select("id,name,phone,email,event_type,desired_date,guests,budget,stage,created_at,notes,source").order("created_at", { ascending: false }).limit(2000);
  if (res.error) {
    needsMigration = true;
    const base = await sb.from("event_leads").select("id,name,phone,email,event_type,desired_date,guests,budget,stage,created_at,notes").order("created_at", { ascending: false }).limit(2000);
    if (base.error) throw new Error("Não foi possível carregar os leads.");
    res = { ...base, data: (base.data ?? []).map((l) => ({ ...l, source: null })) } as unknown as typeof res;
  }
  const [reservations, me] = await sideP;

  const leads: LeadVM[] = (res.data ?? []).map((l) => ({
    id: l.id, name: l.name, phone: l.phone, email: l.email, event_type: l.event_type, desired_date: l.desired_date,
    guests: l.guests, budget: l.budget == null ? null : Number(l.budget), stage: l.stage, created_at: l.created_at, notes: l.notes, source: l.source,
  }));
  return {
    leads, reservations, needsMigration,
    canEdit: canDo(me?.perms, "eventos"),
    today: now.toISOString().slice(0, 10),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  };
}
