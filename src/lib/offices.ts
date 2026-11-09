import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";
import type { OfficeStatus } from "./types";

export interface Building { id: string; name: string; code: string; address: string | null }
export interface CompanyInfo { id: string; name: string; nif: string | null; phone: string | null; email: string | null; rep: string | null }
export interface CompanyFull extends CompanyInfo { sector: string | null; address: string | null }
export interface ContractInfo {
  id: string; number: string; start_date: string; end_date: string; status: string; total_value: number; installments_count: number;
  paid_total: number; remaining_total: number; next_due_date: string | null; days_left: number;
}
export interface HistoryItem { id: string; number: string; company: string; start_date: string; end_date: string; status: string }
export interface OfficeVM {
  id: string; building_id: string; number: string; code: string; area_m2: number; status: OfficeStatus;
  monthly_value: number | null; x: number; y: number; w: number; h: number; notes: string | null;
  company: CompanyInfo | null; contract: ContractInfo | null; overdue: number; history: HistoryItem[];
}
export interface OfficesBoardData {
  ready: boolean; buildings: Building[]; offices: OfficeVM[]; companies: CompanyFull[]; canEdit: boolean;
}

const EMPTY: OfficesBoardData = { ready: false, buildings: [], offices: [], companies: [], canEdit: false };

// Tudo vem da base de dados; se a migração 0011 ainda não foi aplicada devolve ready=false.
export async function getOfficesBoard(): Promise<OfficesBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();

  const bP = Promise.resolve(sb.from("buildings").select("id,name,code,address").eq("is_active", true).order("name"));
  const oP = Promise.resolve(sb.from("offices")
    .select("id,building_id,code,number,area_m2,status,monthly_value,position_x,position_y,width,height,notes,is_active")
    .eq("is_active", true).order("number"));
  const restP = Promise.all([
    sb.from("contract_summary").select("id,number,office_id,company_id,start_date,end_date,status,total_value,installments_count,paid_total,remaining_total,next_due_date,days_left").order("end_date", { ascending: false }),
    sb.from("companies").select("id,name,nif,phone,email,legal_rep_name,sector,address").order("name"),
    sb.from("debts").select("office_id,owed,days_overdue"),
    getMe(),
  ]);
  restP.catch(() => undefined); // evita rejeição não tratada se sairmos cedo
  const { data: blds, error: bErr } = await bP;
  if (bErr) return EMPTY;
  const { data: offs, error: oErr } = await oP;
  if (oErr) return EMPTY;
  const [{ data: contracts }, { data: companies }, { data: debts }, me] = await restP;

  const co = new Map((companies ?? []).map((c) => [c.id, { id: c.id, name: c.name, nif: c.nif, phone: c.phone, email: c.email, rep: c.legal_rep_name } as CompanyInfo]));
  const live = new Map<string, NonNullable<typeof contracts>[number]>();
  const hist = new Map<string, HistoryItem[]>();
  for (const c of contracts ?? []) {
    if (c.status === "ativo" || c.status === "a_terminar") { if (!live.has(c.office_id)) live.set(c.office_id, c); }
    else hist.set(c.office_id, [...(hist.get(c.office_id) ?? []), { id: c.id, number: c.number, company: co.get(c.company_id)?.name ?? "—", start_date: c.start_date, end_date: c.end_date, status: c.status }]);
  }
  const overdue = new Map<string, number>();
  for (const d of debts ?? []) if (d.days_overdue > 0) overdue.set(d.office_id, (overdue.get(d.office_id) ?? 0) + Number(d.owed));

  const offices: OfficeVM[] = (offs ?? []).filter((o) => o.building_id).map((o) => {
    const c = live.get(o.id);
    return {
      id: o.id, building_id: o.building_id as string, number: o.number, code: o.code, area_m2: Number(o.area_m2), status: o.status as OfficeStatus,
      monthly_value: o.monthly_value == null ? null : Number(o.monthly_value), x: o.position_x, y: o.position_y, w: o.width, h: o.height, notes: o.notes,
      company: c ? co.get(c.company_id) ?? null : null,
      contract: c ? {
        id: c.id, number: c.number, start_date: c.start_date, end_date: c.end_date, status: c.status, total_value: Number(c.total_value),
        installments_count: c.installments_count, paid_total: Number(c.paid_total), remaining_total: Number(c.remaining_total),
        next_due_date: c.next_due_date, days_left: c.days_left,
      } : null,
      overdue: overdue.get(o.id) ?? 0,
      history: hist.get(o.id) ?? [],
    };
  });

  const companiesFull: CompanyFull[] = (companies ?? []).map((c) => ({ id: c.id, name: c.name, nif: c.nif, phone: c.phone, email: c.email, rep: c.legal_rep_name, sector: c.sector, address: c.address }));

  return { ready: true, buildings: blds ?? [], offices, companies: companiesFull, canEdit: canDo(me?.perms, "escritorios") };
}
