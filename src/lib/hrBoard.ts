import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";

export type EmpStatus = "ativo" | "ferias" | "suspenso" | "desligado";
export type AttStatus = "presente" | "atraso" | "falta" | "justificada" | "ferias" | "folga";
export interface EmpVM {
  id: string; name: string; position: string; department: string; hire_date: string | null; contract_type: string; contract_end: string | null;
  salary: number | null; status: EmpStatus; birth_date: string | null; phone: string | null; email: string | null; bi: string | null; nif: string | null;
}
export interface AttVM { id: string; employee_id: string; day: string; status: AttStatus; check_in: string | null; check_out: string | null }
export interface HrBoardData { employees: EmpVM[]; attendance: AttVM[]; canEdit: boolean; today: string; monthStart: string; needsMigration: boolean }

export async function getHrBoard(): Promise<HrBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const now = new Date();
  const today = new Date(now.getTime() + 3600e3).toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 75 * 864e5).toISOString().slice(0, 10);

  let needsMigration = false;
  const meP = getMe();
  const aP = Promise.resolve(sb.from("attendance").select("id,employee_id,day,status,check_in,check_out").gte("day", since).order("day", { ascending: false }).limit(6000));
  let eRes = await sb.from("employees").select("id,full_name,position,department,hire_date,contract_type,contract_end,salary,status,birth_date,phone,email,bi,nif").order("full_name");
  if (eRes.error) {
    needsMigration = true;
    const base = await sb.from("employees").select("id,full_name,position,department,hire_date,contract_type,salary,status,phone,email,bi,nif").order("full_name");
    if (base.error) throw new Error("Não foi possível carregar os funcionários.");
    eRes = { ...base, data: (base.data ?? []).map((e) => ({ ...e, contract_end: null, birth_date: null })) } as unknown as typeof eRes;
  }
  let aRes = await aP;
  if (aRes.error) {
    needsMigration = true;
    const base = await sb.from("attendance").select("id,employee_id,day,status").gte("day", since).order("day", { ascending: false }).limit(6000);
    aRes = { ...base, data: (base.data ?? []).map((a) => ({ ...a, check_in: null, check_out: null })) } as unknown as typeof aRes;
  }
  const me = await meP;

  const employees: EmpVM[] = (eRes.data ?? []).map((e) => ({
    id: e.id, name: e.full_name, position: e.position, department: e.department, hire_date: e.hire_date, contract_type: e.contract_type,
    contract_end: e.contract_end, salary: e.salary == null ? null : Number(e.salary), status: e.status as EmpStatus, birth_date: e.birth_date,
    phone: e.phone, email: e.email, bi: e.bi, nif: e.nif,
  }));
  const attendance: AttVM[] = (aRes.data ?? []).map((a) => ({ id: a.id, employee_id: a.employee_id, day: a.day, status: a.status as AttStatus, check_in: a.check_in?.slice(0, 5) ?? null, check_out: a.check_out?.slice(0, 5) ?? null }));
  return {
    employees, attendance, needsMigration, today,
    canEdit: canDo(me?.perms, "rh"),
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
  };
}
