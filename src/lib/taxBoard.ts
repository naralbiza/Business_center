import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";

export type TaxState = "pago" | "aberto" | "atraso" | "preparacao";
export interface TaxVM {
  id: string; kind: string; label: string; reference: string | null; period: string; competence: string; due_date: string;
  amount: number; paid: boolean; paid_at: string | null; in_preparation: boolean; state: TaxState;
}
export interface TaxBoardData { taxes: TaxVM[]; today: string; canEdit: boolean; needsMigration: boolean }

const MON = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function getTaxBoard(): Promise<TaxBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const today = new Date().toISOString().slice(0, 10);

  let needsMigration = false;
  const meP = getMe();
  let res = await sb.from("tax_obligations").select("id,kind,label,reference,period_label,competence,due_date,amount,paid,paid_at,in_preparation").order("due_date");
  if (res.error) {
    // Migração 0012 ainda não aplicada: usa só as colunas antigas
    needsMigration = true;
    const base = await sb.from("tax_obligations").select("id,kind,label,competence,due_date,amount,paid,paid_at").order("due_date");
    if (base.error) throw new Error("Não foi possível carregar os impostos.");
    res = { ...base, data: (base.data ?? []).map((t) => ({ ...t, reference: null, period_label: null, in_preparation: false })) } as unknown as typeof res;
  }
  const me = await meP;

  const taxes: TaxVM[] = (res.data ?? []).map((t) => {
    const c = new Date(t.competence + "T00:00:00Z");
    const state: TaxState = t.paid ? "pago" : t.in_preparation ? "preparacao" : t.due_date < today ? "atraso" : "aberto";
    return {
      id: t.id, kind: t.kind, label: t.label, reference: t.reference, competence: t.competence, due_date: t.due_date,
      period: t.period_label || `${MON[c.getUTCMonth()]}/${c.getUTCFullYear()}`, amount: Number(t.amount), paid: t.paid, paid_at: t.paid_at,
      in_preparation: Boolean(t.in_preparation), state,
    };
  });
  return { taxes, today, canEdit: canDo(me?.perms, "financeiro"), needsMigration };
}
