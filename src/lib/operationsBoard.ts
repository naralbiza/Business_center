import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";

export type EqStatus = "operacional" | "manutencao" | "inativo" | "fora_servico";
export type CostCat = "manutencao" | "compras" | "servicos" | "energia" | "outros";
export interface ItemVM { id: string; name: string; category: string; quantity: number; min: number; unit: string; location: string | null; supplier_id: string | null; created_at: string }
export interface MoveVM { id: string; item_id: string; item: string; kind: string; quantity: number; destination: string | null; note: string | null; created_at: string }
export interface SupplierVM { id: string; name: string; category: string | null; phone: string | null; email: string | null; nif: string | null; rating: number | null; status: "ativo" | "avaliacao" | "inativo"; created_at: string }
export interface TicketVM { id: string; code: string; title: string; area: string; priority: string; status: "aberto" | "em_curso" | "concluido"; cost: number | null; supplier_id: string | null; equipment_id: string | null; opened_at: string; closed_at: string | null }
export interface EquipVM { id: string; code: string | null; name: string; category: string; location: string | null; status: EqStatus; supplier_id: string | null; value: number | null; created_at: string }
export interface CostVM { id: string; spent_on: string; category: CostCat; description: string; amount: number; supplier_id: string | null }
export interface PlanVM { id: string; equipment_id: string | null; equipment: string | null; title: string; every_days: number; next_due: string }
export interface OperationsBoardData {
  items: ItemVM[]; movements: MoveVM[]; suppliers: SupplierVM[]; tickets: TicketVM[]; equipment: EquipVM[]; costs: CostVM[]; plans: PlanVM[];
  canEdit: boolean; today: string; monthStart: string; needsMigration: boolean;
}

export async function getOperationsBoard(): Promise<OperationsBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const now = new Date();
  const today = new Date(now.getTime() + 3600e3).toISOString().slice(0, 10);

  let needsMigration = false;
  const tkP = Promise.resolve(sb.from("maintenance_tickets").select("id,title,area,priority,status,cost,supplier_id,equipment_id,opened_at,closed_at").order("opened_at", { ascending: false }).limit(500));
  const restP = Promise.all([
    sb.from("logistics_items").select("id,name,category,quantity,min_quantity,unit,location,supplier_id,created_at").order("name"),
    sb.from("logistics_movements").select("id,item_id,kind,quantity,destination,note,created_at").order("created_at", { ascending: false }).limit(120),
    sb.from("equipment").select("id,code,name,category,location,status,supplier_id,value,created_at").order("code"),
    sb.from("operational_costs").select("id,spent_on,category,description,amount,supplier_id").order("spent_on", { ascending: false }).limit(1500),
    sb.from("maintenance_plans").select("id,equipment_id,title,every_days,next_due").eq("active", true).order("next_due"),
    getMe(),
  ]);
  let sup = await sb.from("suppliers").select("id,name,category,phone,email,nif,rating,status,created_at").order("name");
  if (sup.error) {
    needsMigration = true;
    const base = await sb.from("suppliers").select("id,name,category,phone,email,nif,created_at").order("name");
    if (base.error) throw new Error("Não foi possível carregar as operações.");
    sup = { ...base, data: (base.data ?? []).map((s) => ({ ...s, rating: null, status: "ativo" })) } as unknown as typeof sup;
  }
  let tk = await tkP;
  if (tk.error) {
    needsMigration = true;
    const base = await sb.from("maintenance_tickets").select("id,title,area,priority,status,cost,supplier_id,opened_at,closed_at").order("opened_at", { ascending: false }).limit(500);
    if (base.error) throw new Error("Não foi possível carregar as operações.");
    tk = { ...base, data: (base.data ?? []).map((t) => ({ ...t, equipment_id: null })) } as unknown as typeof tk;
  }
  const [itR, mvR, eqR, coR, plR, me] = await restP;
  if (itR.error) throw new Error("Não foi possível carregar as operações.");
  if (eqR.error || coR.error || plR.error) needsMigration = true;

  const items: ItemVM[] = (itR.data ?? []).map((i) => ({ id: i.id, name: i.name, category: i.category, quantity: Number(i.quantity), min: Number(i.min_quantity), unit: i.unit, location: i.location, supplier_id: i.supplier_id, created_at: i.created_at }));
  const iname = new Map(items.map((i) => [i.id, i.name]));
  const equipment: EquipVM[] = (eqR.data ?? []).map((e) => ({ id: e.id, code: e.code, name: e.name, category: e.category, location: e.location, status: e.status as EqStatus, supplier_id: e.supplier_id, value: e.value == null ? null : Number(e.value), created_at: e.created_at }));
  const ename = new Map(equipment.map((e) => [e.id, e.name]));
  const ordered = [...(tk.data ?? [])].sort((a, b) => (a.opened_at < b.opened_at ? -1 : 1));
  const perYear = new Map<string, number>();
  const tickets: TicketVM[] = ordered.map((t) => {
    const y = t.opened_at.slice(0, 4), n = (perYear.get(y) ?? 0) + 1;
    perYear.set(y, n);
    return { id: t.id, code: `MAN-${y}-${String(n).padStart(3, "0")}`, title: t.title, area: t.area, priority: t.priority, status: t.status as TicketVM["status"], cost: t.cost == null ? null : Number(t.cost), supplier_id: t.supplier_id, equipment_id: t.equipment_id, opened_at: t.opened_at, closed_at: t.closed_at };
  }).reverse();

  return {
    items, equipment, needsMigration, today,
    movements: (mvR.data ?? []).map((m) => ({ id: m.id, item_id: m.item_id, item: iname.get(m.item_id) ?? "—", kind: m.kind, quantity: Number(m.quantity), destination: m.destination, note: m.note, created_at: m.created_at })),
    suppliers: (sup.data ?? []).map((s) => ({ id: s.id, name: s.name, category: s.category, phone: s.phone, email: s.email, nif: s.nif, rating: s.rating, status: (s.status ?? "ativo") as SupplierVM["status"], created_at: s.created_at })),
    tickets,
    costs: (coR.data ?? []).map((c) => ({ id: c.id, spent_on: c.spent_on, category: c.category as CostCat, description: c.description, amount: Number(c.amount), supplier_id: c.supplier_id })),
    plans: (plR.data ?? []).map((p) => ({ id: p.id, equipment_id: p.equipment_id, equipment: p.equipment_id ? ename.get(p.equipment_id) ?? null : null, title: p.title, every_days: p.every_days, next_due: p.next_due })),
    canEdit: canDo(me?.perms, "operacoes"),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  };
}
