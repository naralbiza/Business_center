import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";
import { officesWithBuilding } from "./officesQuery";

export type InvoiceState = "paga" | "em_aberto" | "vencida" | "cancelada";

export interface InvoiceVM {
  id: string; installmentId: string; number: string; issue_date: string; due_date: string; period_to: string;
  state: InvoiceState; amount: number; paid: number; balance: number; days_overdue: number; seq: number; count: number;
  company: { id: string; name: string; nif: string | null; email: string | null } | null;
  contractId: string | null; contractNumber: string;
  office: { number: string; building: string | null; building_id: string | null } | null;
  payments: { id: string; paid_at: string; amount: number; method: string; reference: string | null }[];
}
export interface InvoicesBoardData { invoices: InvoiceVM[]; buildings: { id: string; name: string }[]; companies: { id: string; name: string }[]; today: string; canEdit: boolean }

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Cada prestação do contrato é a fatura da renda desse mês. O número FT-AAAA-NNN é derivado da ordem de vencimento.
export async function getInvoicesBoard(): Promise<InvoicesBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const today = iso(new Date());

  const [instR, payR, ctrR, coR, offR, bldR, me] = await Promise.all([
    sb.from("installments").select("id,contract_id,seq,due_date,amount,paid_amount,status").order("due_date", { ascending: true }).limit(5000),
    sb.from("payments").select("id,installment_id,amount,paid_at,method,reference").order("paid_at", { ascending: false }).limit(5000),
    sb.from("contract_summary").select("id,number,company_id,office_id,installments_count"),
    sb.from("companies").select("id,name,nif,email"),
    officesWithBuilding(sb),
    sb.from("buildings").select("id,name"),
    getMe(),
  ]);
  if (instR.error) throw new Error("Não foi possível carregar as faturas.");

  const co = new Map((coR.data ?? []).map((c) => [c.id, { id: c.id, name: c.name, nif: c.nif, email: c.email }]));
  const ctr = new Map((ctrR.data ?? []).map((c) => [c.id, c]));
  const bname = new Map((bldR.data ?? []).map((b) => [b.id, b.name]));
  const bOf = new Map((offR.data ?? []).map((o) => [o.id, (o as { building_id?: string | null }).building_id ?? null]));
  const off = new Map((offR.data ?? []).map((o) => [o.id, { number: o.number, building_id: bOf.get(o.id) ?? null, building: bOf.get(o.id) ? bname.get(bOf.get(o.id) as string) ?? null : null }]));
  const payBy = new Map<string, InvoiceVM["payments"]>();
  for (const p of payR.data ?? []) payBy.set(p.installment_id, [...(payBy.get(p.installment_id) ?? []), { id: p.id, paid_at: p.paid_at, amount: Number(p.amount), method: p.method, reference: p.reference }]);

  // Ordem estável para a numeração: vencimento, nº do contrato, prestação
  const ordered = [...(instR.data ?? [])].sort((a, b) =>
    a.due_date !== b.due_date ? (a.due_date < b.due_date ? -1 : 1)
      : (ctr.get(a.contract_id)?.number ?? "").localeCompare(ctr.get(b.contract_id)?.number ?? "") || a.seq - b.seq);
  const perYear = new Map<string, number>();
  const invoices: InvoiceVM[] = [];
  for (const i of ordered) {
    const year = i.due_date.slice(0, 4);
    const n = (perYear.get(year) ?? 0) + 1;
    perYear.set(year, n);
    const issue = `${i.due_date.slice(0, 7)}-01`;
    if (issue > today) continue; // ainda não emitida
    const c = ctr.get(i.contract_id);
    const amount = Number(i.amount), paid = Number(i.paid_amount), balance = Math.max(0, amount - paid);
    const state: InvoiceState = i.status === "cancelada" ? "cancelada" : i.status === "paga" || balance === 0 ? "paga" : i.due_date < today ? "vencida" : "em_aberto";
    const [y, m] = i.due_date.split("-").map(Number);
    invoices.push({
      id: i.id, installmentId: i.id, number: `FT-${year}-${String(n).padStart(3, "0")}`, issue_date: issue, due_date: i.due_date,
      period_to: iso(new Date(Date.UTC(y, m, 0))), state, amount, paid, balance: state === "paga" || state === "cancelada" ? 0 : balance,
      days_overdue: state === "vencida" ? Math.round((new Date(today).getTime() - new Date(i.due_date).getTime()) / 864e5) : 0,
      seq: i.seq, count: c?.installments_count ?? 0,
      company: c ? co.get(c.company_id) ?? null : null, contractId: c?.id ?? null, contractNumber: c?.number ?? "—",
      office: c ? off.get(c.office_id) ?? null : null, payments: payBy.get(i.id) ?? [],
    });
  }
  invoices.sort((a, b) => (a.issue_date !== b.issue_date ? (a.issue_date < b.issue_date ? 1 : -1) : a.number < b.number ? 1 : -1));

  return {
    invoices, today,
    buildings: (bldR.data ?? []).map((b) => ({ id: b.id, name: b.name })),
    companies: (coR.data ?? []).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, "pt")),
    canEdit: canDo(me?.perms, "financeiro"),
  };
}
