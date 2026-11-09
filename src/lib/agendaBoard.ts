import { connection } from "next/server";
import { canDo } from "./permissions";
import { getCompanies, getLead, getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";

export interface ResVM {
  id: string; title: string; client: string; starts_at: string; ends_at: string; guests: number | null;
  status: "pendente" | "confirmada" | "cancelada"; price: number; paid_total: number; venue_id: string; venue: string;
}
export interface AgendaBoardData {
  reservations: ResVM[]; venues: { id: string; name: string; capacity: number | null }[]; companies: { id: string; name: string }[];
  lead: { id: string; name: string; event_type: string; guests: number | null; budget: number | null } | null;
  canEdit: boolean; today: string;
}

export async function getAgendaBoard(leadId?: string): Promise<AgendaBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const [resR, venR, companies, me, lead] = await Promise.all([
    sb.from("reservation_summary").select("id,title,client,starts_at,ends_at,guests,status,price,paid_total,venue_id").order("starts_at").limit(3000),
    sb.from("venues").select("id,name,capacity").order("name"),
    getCompanies(),
    getMe(),
    leadId ? getLead(leadId) : Promise.resolve(null),
  ]);
  if (resR.error) throw new Error("Não foi possível carregar a agenda.");
  const venues = (venR.data ?? []).map((v) => ({ id: v.id, name: v.name, capacity: v.capacity }));
  const vname = new Map(venues.map((v) => [v.id, v.name]));
  const reservations: ResVM[] = (resR.data ?? []).map((r) => ({
    id: r.id, title: r.title, client: r.client, starts_at: r.starts_at, ends_at: r.ends_at, guests: r.guests,
    status: r.status as ResVM["status"], price: Number(r.price), paid_total: Number(r.paid_total), venue_id: r.venue_id, venue: vname.get(r.venue_id) ?? "—",
  }));
  return {
    reservations, venues, companies,
    lead: lead ? { id: lead.id, name: lead.name, event_type: lead.event_type, guests: lead.guests, budget: lead.budget } : null,
    canEdit: canDo(me?.perms, "eventos"),
    today: new Date(Date.now() + 3600e3).toISOString().slice(0, 10), // data em Luanda (UTC+1)
  };
}
