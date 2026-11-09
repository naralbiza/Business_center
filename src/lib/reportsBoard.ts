import { connection } from "next/server";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";

export type Module = "escritorios" | "eventos" | "operacoes" | "rh" | "impostos" | "restaurante";
export interface Movement {
  id: string; date: string; kind: "receita" | "despesa"; amount: number; description: string; category: string;
  module: Module; origin: string; href: string; party: string | null; partyId: string | null;
}
export interface ReservationLite { id: string; title: string; client: string; starts_at: string; ends_at: string; status: string; price: number; venue_id: string; venue: string }
export interface ReportsData {
  movements: Movement[]; reservations: ReservationLite[]; venues: { id: string; name: string; capacity: number | null }[];
  offices: { total: number; occupied: number }; activeClients: number; sectors: { sector: string; n: number }[];
  restaurant: { tables: number; reservations: { starts_at: string; status: string }[] };
  today: string; canExport: boolean;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getReportsData(): Promise<ReportsData> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const now = new Date(Date.now() + 3600e3);
  const today = iso(now);
  const since = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1)).toISOString().slice(0, 10);

  const [payR, evR, costR, tkR, taxR, empR, offR, venR, resR, ctrR, coR, rtR, rrR, me] = await Promise.all([
    sb.from("payments").select("id,amount,paid_at,installments(contracts(id,number,company_id,companies(name),offices(number)))").gte("paid_at", since).limit(6000),
    sb.from("event_payments").select("id,amount,paid_at,venue_reservations(id,title,client,company_id)").gte("paid_at", since).limit(3000),
    sb.from("operational_costs").select("id,spent_on,category,description,amount").gte("spent_on", since).limit(4000),
    sb.from("maintenance_tickets").select("id,title,cost,status,closed_at,opened_at").not("cost", "is", null).limit(2000),
    sb.from("tax_obligations").select("id,label,amount,paid,paid_at").eq("paid", true).gte("paid_at", since).limit(1000),
    sb.from("employees").select("id,full_name,salary,status,hire_date").limit(1000),
    sb.from("offices").select("id,status"),
    sb.from("venues").select("id,name,capacity"),
    sb.from("reservation_summary").select("id,title,client,starts_at,ends_at,status,price,venue_id").gte("starts_at", since).limit(4000),
    sb.from("contract_summary").select("company_id,status").in("status", ["ativo", "a_terminar"]),
    sb.from("companies").select("id,name,sector"),
    sb.from("restaurant_tables").select("id").eq("is_active", true),
    sb.from("restaurant_reservations").select("starts_at,status").gte("starts_at", since).limit(6000),
    getMe(),
  ]);
  if (payR.error) throw new Error("Não foi possível carregar os relatórios.");

  const movements: Movement[] = [];
  type PayRow = { id: string; amount: number; paid_at: string; installments: { contracts?: { id?: string; number?: string; company_id?: string; companies?: { name?: string }; offices?: { number?: string } } } | null };
  for (const p of (payR.data ?? []) as unknown as PayRow[]) {
    const c = p.installments?.contracts;
    movements.push({
      id: `p-${p.id}`, date: p.paid_at, kind: "receita", amount: Number(p.amount),
      description: `Renda – ${c?.companies?.name ?? "Contrato"}${c?.offices?.number ? ` (Esc. ${c.offices.number})` : ""}`, category: "Escritórios",
      module: "escritorios", origin: c?.number ?? "Contrato", href: c?.id ? `/contratos/${c.id}` : "/contratos", party: c?.companies?.name ?? null, partyId: c?.company_id ?? null,
    });
  }
  type EvRow = { id: string; amount: number; paid_at: string; venue_reservations: { id?: string; title?: string; client?: string; company_id?: string | null } | null };
  for (const e of (evR.data ?? []) as unknown as EvRow[]) {
    const r = e.venue_reservations;
    movements.push({
      id: `e-${e.id}`, date: e.paid_at, kind: "receita", amount: Number(e.amount), description: `Evento – ${r?.title ?? "Reserva"}`, category: "Salão de Festas",
      module: "eventos", origin: "Evento", href: r?.id ? `/agenda/${r.id}` : "/agenda", party: r?.client ?? null, partyId: r?.company_id ?? null,
    });
  }
  const CAT: Record<string, string> = { manutencao: "Manutenção", compras: "Fornecedores", servicos: "Fornecedores", energia: "Energia e Água", outros: "Outros" };
  for (const c of costR.data ?? []) {
    movements.push({ id: `c-${c.id}`, date: c.spent_on, kind: "despesa", amount: Number(c.amount), description: c.description, category: CAT[c.category] ?? "Outros", module: "operacoes", origin: "Operações", href: "/operacoes", party: null, partyId: null });
  }
  for (const t of tkR.data ?? []) {
    if (t.status !== "concluido" || !t.cost) continue;
    movements.push({ id: `t-${t.id}`, date: (t.closed_at ?? t.opened_at).slice(0, 10), kind: "despesa", amount: Number(t.cost), description: `Manutenção – ${t.title}`, category: "Manutenção", module: "operacoes", origin: "Ordem de serviço", href: "/operacoes", party: null, partyId: null });
  }
  for (const t of taxR.data ?? []) {
    if (!t.paid_at) continue;
    movements.push({ id: `x-${t.id}`, date: t.paid_at, kind: "despesa", amount: Number(t.amount), description: t.label, category: "Impostos", module: "impostos", origin: "Imposto", href: "/impostos", party: null, partyId: null });
  }
  // Pessoal: salário mensal dos funcionários em atividade em cada mês já iniciado
  const emps = (empR.data ?? []).filter((e) => e.salary != null);
  for (let k = 0; k < 24; k++) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
    const day = iso(end) > today ? today : iso(end);
    if (iso(m) < since) continue;
    const sum = emps.filter((e) => e.status !== "desligado" && (!e.hire_date || e.hire_date <= iso(end))).reduce((s, e) => s + Number(e.salary), 0);
    if (sum > 0) movements.push({ id: `s-${iso(m)}`, date: day, kind: "despesa", amount: sum, description: "Salários da equipa", category: "Pessoal", module: "rh", origin: "Recursos Humanos", href: "/rh", party: null, partyId: null });
  }

  const venues = (venR.data ?? []).map((v) => ({ id: v.id, name: v.name, capacity: v.capacity }));
  const vname = new Map(venues.map((v) => [v.id, v.name]));
  const co = new Map((coR.data ?? []).map((c) => [c.id, c]));
  const activeIds = new Set((ctrR.data ?? []).map((c) => c.company_id));
  const sectorCount = new Map<string, number>();
  activeIds.forEach((id) => { const s = co.get(id)?.sector?.trim() || "Outros"; sectorCount.set(s, (sectorCount.get(s) ?? 0) + 1); });

  return {
    movements, venues, today,
    reservations: (resR.data ?? []).map((r) => ({ id: r.id, title: r.title, client: r.client, starts_at: r.starts_at, ends_at: r.ends_at, status: r.status, price: Number(r.price), venue_id: r.venue_id, venue: vname.get(r.venue_id) ?? "—" })),
    offices: { total: (offR.data ?? []).length, occupied: (offR.data ?? []).filter((o) => o.status === "ocupado").length },
    activeClients: activeIds.size,
    sectors: [...sectorCount.entries()].map(([sector, n]) => ({ sector, n })).sort((a, b) => b.n - a.n),
    restaurant: { tables: rtR.error ? 0 : (rtR.data ?? []).length, reservations: rrR.error ? [] : (rrR.data ?? []) },
    canExport: Boolean(me),
  };
}
