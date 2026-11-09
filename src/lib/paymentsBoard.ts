import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";
import { officesWithBuilding } from "./officesQuery";

export type PayState = "recebido" | "pendente" | "em_atraso" | "cancelado";

export interface PaymentRowVM {
  id: string; kind: "parcela" | "evento"; date: string; due_date: string | null; ref: string; type: string; state: PayState;
  amount: number; paid: number; remaining: number; method: string | null; reference: string | null;
  company: { id: string; name: string; nif: string | null } | null;
  contractId: string | null; contractNumber: string;
  office: { number: string; building: string | null; building_id: string | null } | null;
  installmentId: string | null;
}
export interface PaymentsBoardData { rows: PaymentRowVM[]; buildings: { id: string; name: string }[]; today: string; canEdit: boolean }

export async function getPaymentsBoard(): Promise<PaymentsBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);

  const [instR, payR, ctrR, coR, offR, bldR, evpR, resR, me] = await Promise.all([
    sb.from("installments").select("id,contract_id,seq,due_date,amount,paid_amount,status").order("due_date", { ascending: false }).limit(2000),
    sb.from("payments").select("id,installment_id,amount,paid_at,method,reference").order("paid_at", { ascending: false }).limit(3000),
    sb.from("contract_summary").select("id,number,company_id,office_id,installments_count"),
    sb.from("companies").select("id,name,nif"),
    officesWithBuilding(sb),
    sb.from("buildings").select("id,name"),
    sb.from("event_payments").select("id,reservation_id,amount,paid_at,method,reference").order("paid_at", { ascending: false }).limit(1000),
    sb.from("venue_reservations").select("id,title,client,company_id"),
    getMe(),
  ]);
  if (instR.error) throw new Error("Não foi possível carregar os pagamentos.");

  const co = new Map((coR.data ?? []).map((c) => [c.id, { id: c.id, name: c.name, nif: c.nif }]));
  const ctr = new Map((ctrR.data ?? []).map((c) => [c.id, c]));
  const bname = new Map((bldR.data ?? []).map((b) => [b.id, b.name]));
  const bOf = new Map((offR.data ?? []).map((o) => [o.id, (o as { building_id?: string | null }).building_id ?? null]));
  const off = new Map((offR.data ?? []).map((o) => [o.id, { number: o.number, building_id: bOf.get(o.id) ?? null, building: bOf.get(o.id) ? bname.get(bOf.get(o.id) as string) ?? null : null }]));

  const payBy = new Map<string, NonNullable<typeof payR.data>>();
  for (const p of payR.data ?? []) payBy.set(p.installment_id, [...(payBy.get(p.installment_id) ?? []), p]);

  const rows: PaymentRowVM[] = [];
  for (const i of instR.data ?? []) {
    const c = ctr.get(i.contract_id);
    const amount = Number(i.amount), paid = Number(i.paid_amount), remaining = Math.max(0, amount - paid);
    const pays = payBy.get(i.id) ?? [];
    const last = pays[0];
    let state: PayState;
    if (i.status === "cancelada") state = "cancelado";
    else if (i.status === "paga") state = "recebido";
    else if (i.status === "em_atraso" || (i.due_date < today && remaining > 0)) state = "em_atraso";
    else state = "pendente";
    // Prestações futuras longínquas não entram na listagem
    if (state === "pendente" && paid === 0 && i.due_date > horizon) continue;
    const date = state === "recebido" && last ? last.paid_at : i.due_date;
    rows.push({
      id: `i-${i.id}`, kind: "parcela", date, due_date: i.due_date,
      ref: last?.reference || `${c?.number ?? "—"} · ${i.seq}/${c?.installments_count ?? "?"}`, type: "Renda Mensal", state,
      amount, paid, remaining: state === "recebido" || state === "cancelado" ? 0 : remaining, method: last?.method ?? null, reference: last?.reference ?? null,
      company: c ? co.get(c.company_id) ?? null : null, contractId: c?.id ?? null, contractNumber: c?.number ?? "—",
      office: c ? off.get(c.office_id) ?? null : null, installmentId: i.id,
    });
  }

  const res = new Map((resR.data ?? []).map((r) => [r.id, r]));
  for (const e of evpR.data ?? []) {
    const r = res.get(e.reservation_id);
    rows.push({
      id: `e-${e.id}`, kind: "evento", date: e.paid_at, due_date: null, ref: e.reference || (r?.title ?? "Evento"), type: "Serviços Diversos", state: "recebido",
      amount: Number(e.amount), paid: Number(e.amount), remaining: 0, method: e.method, reference: e.reference,
      company: r?.company_id ? co.get(r.company_id) ?? { id: r.company_id, name: r.client, nif: null } : r ? { id: "", name: r.client, nif: null } : null,
      contractId: null, contractNumber: r?.title ?? "Evento", office: null, installmentId: null,
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    rows, today,
    buildings: (bldR.data ?? []).map((b) => ({ id: b.id, name: b.name })),
    canEdit: canDo(me?.perms, "financeiro"),
  };
}
