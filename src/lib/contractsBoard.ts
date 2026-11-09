import { connection } from "next/server";
import { requireUser, serverClient } from "./supabase-server";
import { officesWithBuilding } from "./officesQuery";

export type ContractDisplay = "ativo" | "a_terminar" | "em_atraso" | "expirado" | "cancelado";

export interface ContractVM {
  id: string; number: string; start_date: string; end_date: string; created_at: string;
  status: string; display: ContractDisplay; months: number;
  total_value: number; monthly: number; installments_count: number; paid_total: number; remaining_total: number;
  next_due_date: string | null; next_due_days: number | null; days_left: number; overdue_amount: number;
  company: { id: string; name: string; nif: string | null; phone: string | null; email: string | null; rep: string | null } | null;
  office: { id: string; number: string; area: number; building: string | null; building_id: string | null } | null;
}
export interface ContractsBoardData { contracts: ContractVM[]; buildings: { id: string; name: string }[]; monthStart: string }

const DAY = 864e5;
const diffDays = (iso: string, today: Date) => Math.round((new Date(iso + "T00:00:00Z").getTime() - today.getTime()) / DAY);

export async function getContractsBoard(): Promise<ContractsBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [{ data: cs, error }, { data: cos }, offRes, bldRes, { data: debts }] = await Promise.all([
    sb.from("contract_summary").select("id,number,office_id,company_id,start_date,end_date,created_at,status,total_value,installments_count,paid_total,remaining_total,next_due_date,days_left").order("number", { ascending: false }),
    sb.from("companies").select("id,name,nif,phone,email,legal_rep_name"),
    officesWithBuilding(sb, true),
    sb.from("buildings").select("id,name"),
    sb.from("debts").select("contract_id,due_date,owed,days_overdue"),
  ]);
  if (error) throw new Error("Não foi possível carregar os contratos.");

  const co = new Map((cos ?? []).map((c) => [c.id, { id: c.id, name: c.name, nif: c.nif, phone: c.phone, email: c.email, rep: c.legal_rep_name }]));
  const bname = new Map((bldRes.data ?? []).map((b) => [b.id, b.name]));
  const bOf = new Map((offRes.data ?? []).map((o) => [o.id, (o as { building_id?: string | null }).building_id ?? null]));
  const of = new Map((offRes.data ?? []).map((o) => [o.id, { id: o.id, number: o.number, area: Number(o.area_m2), building_id: bOf.get(o.id) ?? null }]));

  const late = new Map<string, { amount: number; first: string }>();
  for (const d of debts ?? []) {
    if (d.days_overdue > 0) {
      const cur = late.get(d.contract_id);
      late.set(d.contract_id, { amount: (cur?.amount ?? 0) + Number(d.owed), first: cur && cur.first < d.due_date ? cur.first : d.due_date });
    }
  }

  const contracts: ContractVM[] = (cs ?? []).map((c) => {
    const l = late.get(c.id);
    const o = of.get(c.office_id);
    const display: ContractDisplay = c.status === "cancelado" ? "cancelado" : c.status === "expirado" ? "expirado" : l ? "em_atraso" : c.status === "a_terminar" ? "a_terminar" : "ativo";
    const due = l ? l.first : c.next_due_date;
    return {
      id: c.id, number: c.number, start_date: c.start_date, end_date: c.end_date, created_at: c.created_at, status: c.status, display,
      months: Math.max(1, Math.round((new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / (DAY * 30.44))),
      total_value: Number(c.total_value), monthly: Number(c.total_value) / Math.max(1, c.installments_count), installments_count: c.installments_count,
      paid_total: Number(c.paid_total), remaining_total: Number(c.remaining_total),
      next_due_date: due, next_due_days: due ? diffDays(due, today) : null, days_left: c.days_left, overdue_amount: l?.amount ?? 0,
      company: co.get(c.company_id) ?? null,
      office: o ? { ...o, building: o.building_id ? bname.get(o.building_id) ?? null : null } : null,
    };
  });

  return {
    contracts,
    buildings: (bldRes.data ?? []).map((b) => ({ id: b.id, name: b.name })),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  };
}
