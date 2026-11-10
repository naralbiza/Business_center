import { cache } from "react";
import { connection } from "next/server";
import { DEFAULT_ROLE_PERMS } from "./permissions";
import { currentUser, requireUser, serverClient } from "./supabase-server";
import type { AttendanceRow, AttendanceSummary, LogisticsItem, Supplier, Ticket, DocumentRow, Company, MonthFinance, EventPayment, Employee, Lead, Reservation, Venue, TaxObligation, Alert, ContractSummary, Debt, MonthPoint, Office } from "./types";

// Erros de dados: o detalhe vai para o log do servidor; o cliente só vê uma mensagem genérica.
const fail = (e: { message?: string; code?: string }) => {
  console.error("[data]", e.code, e.message);
  return new Error("Não foi possível carregar os dados.");
};

export async function getOffices(): Promise<Office[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("offices").select("id,code,number,floor,area_m2,status").order("number");
  if (error) throw fail(error);
  return data as Office[];
}

export async function getContracts(): Promise<ContractSummary[]> {
  await connection();
  await requireUser();
  // A vista contract_summary não traz empresa/escritório: juntamos aqui.
  const [{ data, error }, { data: cos }, { data: offs }] = await Promise.all([
    (await serverClient()).from("contract_summary").select("*").order("end_date"),
    (await serverClient()).from("companies").select("id,name"),
    (await serverClient()).from("offices").select("id,number"),
  ]);
  if (error) throw fail(error);
  const co = new Map((cos ?? []).map((c) => [c.id, c.name]));
  const of = new Map((offs ?? []).map((o) => [o.id, o.number]));
  return (data ?? []).map((r) => ({
    ...r,
    company: co.get(r.company_id) ?? "—",
    office_number: of.get(r.office_id) ?? "—",
  })) as ContractSummary[];
}

export async function getContract(id: string) {
  return (await getContracts()).find((c) => c.id === id) ?? null;
}

const ago = (iso: string) => {
  const h = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6));
  return h < 24 ? `Há ${h} h` : `Há ${Math.round(h / 24)} d`;
};

export async function getDebts(): Promise<Debt[]> {
  await connection();
  await requireUser();
  const [{ data, error }, { data: cos }, { data: offs }] = await Promise.all([
    (await serverClient()).from("debts").select("*").order("due_date"),
    (await serverClient()).from("companies").select("id,name"),
    (await serverClient()).from("offices").select("id,number"),
  ]);
  if (error) throw fail(error);
  const co = new Map((cos ?? []).map((c) => [c.id, c.name]));
  const of = new Map((offs ?? []).map((o) => [o.id, o.number]));
  return (data ?? []).map((r) => ({
    id: r.installment_id, company_id: r.company_id, company: co.get(r.company_id) ?? "—", office_number: of.get(r.office_id) ?? "—",
    contract_number: r.number, due_date: r.due_date, owed: Number(r.owed), days_overdue: r.days_overdue,
  }));
}

export async function getAlerts(): Promise<Alert[]> {
  await connection();
  await requireUser();
  const { data } = await (await serverClient()).from("notifications").select("id,kind,title,body,created_at")
    .order("created_at", { ascending: false }).limit(5);
  const kind = (k: string): Alert["kind"] => k.startsWith("fatura") ? "fatura" : k === "pagamento_atrasado" ? "atraso" : k === "contrato_a_expirar" ? "contrato" : k === "imposto" ? "imposto" : "evento";
  return (data ?? []).map((n) => ({ id: n.id, kind: kind(n.kind), title: n.title, body: n.body ?? "", when: ago(n.created_at) }));
}

export async function getMonthly(): Promise<MonthPoint[]> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const year = new Date().getFullYear();
  const [{ data: pays }, { data: evpays }, { data: insts }] = await Promise.all([
    sb.from("payments").select("amount,paid_at").gte("paid_at", `${year}-01-01`),
    sb.from("event_payments").select("amount,paid_at").gte("paid_at", `${year}-01-01`),
    sb.from("installments").select("amount,paid_amount,due_date,status").eq("status", "em_atraso").gte("due_date", `${year}-01-01`),
  ]);
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const pts = names.map((month) => ({ month, revenue: 0, debt: 0 }));
  [...(pays ?? []), ...(evpays ?? [])].forEach((p) => { pts[new Date(p.paid_at).getUTCMonth()].revenue += Number(p.amount); });
  (insts ?? []).forEach((i) => { pts[new Date(i.due_date).getUTCMonth()].debt += Number(i.amount) - Number(i.paid_amount); });
  return pts.slice(0, new Date().getMonth() + 1);
}

export async function getCompanies(): Promise<{ id: string; name: string }[]> {
  await connection();
  await requireUser();
  const { data } = await (await serverClient()).from("companies").select("id,name").order("name");
  return data ?? [];
}

export async function getFreeOffices(): Promise<{ id: string; number: string }[]> {
  await connection();
  await requireUser();
  const { data } = await (await serverClient()).from("offices").select("id,number").eq("status", "livre").order("number");
  return data ?? [];
}

export async function getOpenInstallments(contractId: string): Promise<{ id: string; seq: number; due_date: string; amount: number; paid_amount: number }[]> {
  await connection();
  await requireUser();
  const { data } = await (await serverClient()).from("installments").select("id,seq,due_date,amount,paid_amount")
    .eq("contract_id", contractId).in("status", ["pendente", "parcial", "em_atraso"]).order("seq");
  return (data ?? []).map((i) => ({ ...i, amount: Number(i.amount), paid_amount: Number(i.paid_amount) }));
}

export async function getTaxes(): Promise<TaxObligation[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("tax_obligations").select("id,label,due_date,amount,paid,paid_at").order("due_date");
  if (error) throw fail(error);
  return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
}

export async function getLeads(): Promise<Lead[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("event_leads").select("id,name,phone,event_type,desired_date,guests,budget,stage").order("created_at", { ascending: false });
  if (error) throw fail(error);
  return (data ?? []).map((l) => ({ ...l, budget: l.budget == null ? null : Number(l.budget) }));
}

export async function getVenues(): Promise<Venue[]> {
  await connection();
  await requireUser();
  const { data } = await (await serverClient()).from("venues").select("id,name,kind,capacity").order("name");
  return data ?? [];
}

export async function getReservations(): Promise<Reservation[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("reservation_summary")
    .select("id,title,client,starts_at,ends_at,guests,status,price,paid_total,lead_id,company_id,venue_id").neq("status", "cancelada").order("starts_at");
  if (error) throw fail(error);
  const venues = new Map((await getVenues()).map((v) => [v.id, v.name]));
  return (data ?? []).map((r) => ({ ...r, price: Number(r.price), paid_total: Number(r.paid_total), venue: venues.get(r.venue_id) ?? "—" }));
}

export async function getEmployees(): Promise<Employee[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("employees").select("id,full_name,position,department,hire_date,salary,status").order("full_name");
  if (error) throw fail(error);
  return (data ?? []).map((e) => ({ ...e, salary: e.salary == null ? null : Number(e.salary) }));
}

export async function getReservation(id: string): Promise<Reservation | null> {
  return (await getReservations()).find((r) => r.id === id) ?? null;
}

export async function getEventPayments(reservationId: string): Promise<EventPayment[]> {
  await connection();
  await requireUser();
  const { data } = await (await serverClient()).from("event_payments").select("id,amount,paid_at,method,reference").eq("reservation_id", reservationId).order("paid_at");
  return (data ?? []).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function getLead(id: string): Promise<Lead | null> {
  return (await getLeads()).find((l) => l.id === id) ?? null;
}

export interface Profile { id: string; full_name: string; role: string; active: boolean }
export async function getProfiles(): Promise<Profile[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("profiles").select("id,full_name,role,active").order("full_name");
  if (error) throw fail(error);
  return data ?? [];
}

export async function getMyId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

export async function getCompanyList(): Promise<Company[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("companies").select("id,name,nif,sector,phone,email,legal_rep_name,address").order("name");
  if (error) throw fail(error);
  return data ?? [];
}

export async function getCompany(id: string): Promise<Company | null> {
  return (await getCompanyList()).find((c) => c.id === id) ?? null;
}

export async function getYearFinance(year: number): Promise<MonthFinance[]> {
  await connection();
  await requireUser();
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const rows = names.map((month) => ({ month, contracts: 0, events: 0, overdue: 0 }));
  const sb = await serverClient();
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const [{ data: pays }, { data: ev }, { data: late }] = await Promise.all([
    sb.from("payments").select("amount,paid_at").gte("paid_at", from).lte("paid_at", to),
    sb.from("event_payments").select("amount,paid_at").gte("paid_at", from).lte("paid_at", to),
    sb.from("installments").select("amount,paid_amount,due_date").in("status", ["em_atraso", "parcial", "pendente"]).lt("due_date", new Date().toISOString().slice(0, 10)).gte("due_date", from).lte("due_date", to),
  ]);
  (pays ?? []).forEach((p) => { rows[Number(p.paid_at.slice(5, 7)) - 1].contracts += Number(p.amount); });
  (ev ?? []).forEach((p) => { rows[Number(p.paid_at.slice(5, 7)) - 1].events += Number(p.amount); });
  (late ?? []).forEach((i) => { rows[Number(i.due_date.slice(5, 7)) - 1].overdue += Number(i.amount) - Number(i.paid_amount); });
  return rows;
}

export async function getDocuments(entity: string, entityId: string): Promise<DocumentRow[]> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const { data } = await sb.from("documents").select("id,name,path,size,created_at").eq("entity", entity).eq("entity_id", entityId).order("created_at", { ascending: false });
  const rows = data ?? [];
  const { data: signed } = rows.length ? await sb.storage.from("documents").createSignedUrls(rows.map((r) => r.path), 600) : { data: [] };
  return rows.map((r, i) => ({ ...r, size: r.size == null ? null : Number(r.size), url: signed?.[i]?.signedUrl ?? null }));
}

export async function getSuppliers(): Promise<Supplier[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("suppliers").select("id,name,category,phone,email").order("name");
  if (error) throw fail(error);
  return data ?? [];
}

export async function getLogisticsItems(): Promise<LogisticsItem[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("logistics_items").select("id,name,category,quantity,min_quantity,unit,location,suppliers(name)").order("name");
  if (error) throw fail(error);
  return (data ?? []).map((i) => ({
    id: i.id, name: i.name, category: i.category, quantity: Number(i.quantity), min_quantity: Number(i.min_quantity),
    unit: i.unit, location: i.location, supplier: (i.suppliers as unknown as { name: string } | null)?.name ?? null,
  }));
}

export async function getTickets(): Promise<Ticket[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("maintenance_tickets").select("id,title,area,priority,status,cost,opened_at,closed_at").order("opened_at", { ascending: false });
  if (error) throw fail(error);
  return (data ?? []).map((t) => ({ ...t, cost: t.cost == null ? null : Number(t.cost) }));
}

export async function getAttendanceDay(day: string): Promise<AttendanceRow[]> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const [{ data: emps }, { data: att }] = await Promise.all([
    sb.from("employees").select("id,full_name").neq("status", "desligado").order("full_name"),
    sb.from("attendance").select("employee_id,status").eq("day", day),
  ]);
  const m = new Map((att ?? []).map((a) => [a.employee_id, a.status]));
  return (emps ?? []).map((e) => ({ employee_id: e.id, full_name: e.full_name, status: m.get(e.id) ?? null }));
}

export async function getAttendanceMonth(month: string): Promise<AttendanceSummary[]> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const [y, mo] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const [{ data: emps }, { data: att }] = await Promise.all([
    sb.from("employees").select("id,full_name").neq("status", "desligado").order("full_name"),
    sb.from("attendance").select("employee_id,status").gte("day", `${month}-01`).lte("day", end),
  ]);
  return (emps ?? []).map((e) => {
    const r: AttendanceSummary = { employee_id: e.id, full_name: e.full_name, presente: 0, falta: 0, justificada: 0, ferias: 0 };
    (att ?? []).filter((a) => a.employee_id === e.id).forEach((a) => { r[a.status as "presente" | "falta" | "justificada" | "ferias"]++; });
    return r;
  });
}

export interface Me { name: string; role: string; unread: number; perms: Record<string, number> }
async function loadMe(): Promise<Me | null> {
  await connection();
  const sb = await serverClient();
  const user = await currentUser();
  if (!user) return null;
  // Uma só volta à base de dados: as matrizes de permissões são pequenas (≈10 linhas por cargo/grupo),
  // por isso vêm em paralelo com o perfil e filtram-se aqui em vez de esperar pelo cargo.
  const [profR, notifR, rpR, gpR] = await Promise.all([
    sb.from("profiles").select("full_name,role,active,group_id").eq("id", user.id).maybeSingle(),
    sb.from("notifications").select("id", { count: "exact", head: true }).eq("read", false),
    sb.from("role_permissions").select("role,module,level"),
    sb.from("group_permissions").select("group_id,module,level"),
  ]);
  let prof = profR;
  if (prof.error) prof = (await sb.from("profiles").select("full_name,role,active").eq("id", user.id).maybeSingle()) as unknown as typeof prof;
  const count = notifR.count;
  const p = prof.data as { full_name?: string; role?: string; active?: boolean; group_id?: string | null } | null;
  const role = p?.role ?? "operador";
  // Permissões efetivas: máximo entre o cargo e o grupo; se as tabelas ainda não existem usa os valores por omissão
  let perms: Record<string, number> = p && p.active === false ? {} : { ...(DEFAULT_ROLE_PERMS[role] ?? {}) };
  if (role !== "super_admin" && p?.active !== false) {
    const mine = (rpR.data ?? []).filter((r) => r.role === role);
    if (!rpR.error && mine.length > 0) {
      perms = {};
      mine.forEach((r) => { perms[r.module] = Math.max(perms[r.module] ?? 0, r.level); });
      if (p?.group_id) {
        (gpR.data ?? []).filter((r) => r.group_id === p.group_id).forEach((r) => { perms[r.module] = Math.max(perms[r.module] ?? 0, r.level); });
      }
    }
  }
  return { name: p?.full_name ?? user.email ?? "Utilizador", role, unread: count ?? 0, perms };
}

// Partilhado entre layout, sidebar e cabeçalho no mesmo pedido.
export const getMe = cache(loadMe);

export interface Notice { id: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string }
export async function getNotifications(): Promise<Notice[]> {
  await connection();
  await requireUser();
  const { data } = await (await serverClient()).from("notifications").select("id,title,body,link,read,created_at").order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export interface SearchHit { kind: string; title: string; sub: string; href: string }
export async function search(q: string): Promise<SearchHit[]> {
  await connection();
  await requireUser();
  if (q.length < 2) return [];
  const sb = await serverClient();
  const like = `%${q.replace(/[%,]/g, " ")}%`;
  const [co, off, ct, res, lead] = await Promise.all([
    sb.from("companies").select("id,name,nif").or(`name.ilike.${like},nif.ilike.${like}`).limit(5),
    sb.from("offices").select("id,number,status").ilike("number", like).limit(5),
    sb.from("contracts").select("id,number").ilike("number", like).limit(5),
    sb.from("venue_reservations").select("id,title,client").or(`title.ilike.${like},client.ilike.${like}`).limit(5),
    sb.from("event_leads").select("id,name,event_type").ilike("name", like).limit(5),
  ]);
  return [
    ...(co.data ?? []).map((c) => ({ kind: "Empresa", title: c.name, sub: c.nif ?? "", href: `/escritorios/empresa/${c.id}` })),
    ...(off.data ?? []).map((o) => ({ kind: "Escritório", title: `Escritório ${o.number}`, sub: o.status, href: "/escritorios" })),
    ...(ct.data ?? []).map((c) => ({ kind: "Contrato", title: c.number, sub: "", href: `/contratos/${c.id}` })),
    ...(res.data ?? []).map((r) => ({ kind: "Evento", title: r.title, sub: r.client, href: `/agenda/${r.id}` })),
    ...(lead.data ?? []).map((l) => ({ kind: "Lead", title: l.name, sub: l.event_type, href: "/eventos" })),
  ];
}

export interface PaymentRow { id: string; paid_at: string; amount: number; method: string; reference: string | null; company: string; contract: string }
export async function getPayments(): Promise<PaymentRow[]> {
  await connection();
  await requireUser();
  const { data, error } = await (await serverClient()).from("payments")
    .select("id,amount,paid_at,method,reference,installments(contracts(number,companies(name)))").order("paid_at", { ascending: false }).limit(100);
  if (error) throw fail(error);
  return (data ?? []).map((p) => {
    const c = (p.installments as unknown as { contracts?: { number?: string; companies?: { name?: string } } } | null)?.contracts;
    return { id: p.id, paid_at: p.paid_at, amount: Number(p.amount), method: p.method, reference: p.reference, company: c?.companies?.name ?? "—", contract: c?.number ?? "—" };
  });
}

export interface DocumentListRow extends DocumentRow { entity: string }
export async function getAllDocuments(): Promise<DocumentListRow[]> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const { data } = await sb.from("documents").select("id,name,path,size,created_at,entity").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const { data: signed } = rows.length ? await sb.storage.from("documents").createSignedUrls(rows.map((r) => r.path), 600) : { data: [] };
  return rows.map((r, i) => ({ ...r, size: r.size == null ? null : Number(r.size), url: signed?.[i]?.signedUrl ?? null }));
}
