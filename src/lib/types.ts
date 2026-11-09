export type OfficeStatus = "livre" | "reservado" | "ocupado" | "manutencao" | "bloqueado";
export type ContractStatus = "ativo" | "a_terminar" | "expirado" | "cancelado";

export interface Office {
  id: string; code: string; number: string; floor: number; area_m2: number;
  status: OfficeStatus; company?: string;
}
export interface ContractSummary {
  id: string; company_id?: string; number: string; office_number: string; company: string;
  start_date: string; end_date: string; total_value: number; installments_count: number;
  paid_total: number; remaining_total: number; installments_paid: number;
  next_due_date: string | null; days_left: number; status: ContractStatus;
}

export interface Debt {
  id: string; company_id?: string; company: string; office_number: string; contract_number: string;
  due_date: string; owed: number; days_overdue: number;
}
export interface Alert { id: string; kind: "fatura" | "atraso" | "contrato" | "imposto" | "evento"; title: string; body: string; when: string }
export interface MonthPoint { month: string; revenue: number; debt: number }

export interface TaxObligation { id: string; label: string; due_date: string; amount: number; paid: boolean; paid_at: string | null }

export const STAGES = ["novo", "contactado", "visita", "proposta", "negociacao", "reserva", "contrato", "pagamento", "confirmado", "realizado", "posvenda"] as const;
export interface Lead { id: string; name: string; phone: string | null; event_type: string; desired_date: string | null; guests: number | null; budget: number | null; stage: string }
export interface Venue { id: string; name: string; kind: string; capacity: number | null }
export interface Reservation { id: string; venue: string; title: string; client: string; starts_at: string; ends_at: string; guests: number | null; status: string; price: number; paid_total: number; lead_id: string | null; company_id: string | null }

export interface Employee { id: string; full_name: string; position: string; department: string; hire_date: string | null; salary: number | null; status: string }

export interface EventPayment { id: string; amount: number; paid_at: string; method: string; reference: string | null }

export interface Company { id: string; name: string; nif: string | null; sector: string | null; phone: string | null; email: string | null; legal_rep_name: string | null; address: string | null }
export interface MonthFinance { month: string; contracts: number; events: number; overdue: number }

export interface DocumentRow { id: string; name: string; path: string; size: number | null; created_at: string; url: string | null }

export interface Supplier { id: string; name: string; category: string | null; phone: string | null; email: string | null }
export interface LogisticsItem { id: string; name: string; category: string; quantity: number; min_quantity: number; unit: string; location: string | null; supplier: string | null }
export interface Ticket { id: string; title: string; area: string; priority: string; status: string; cost: number | null; opened_at: string; closed_at: string | null }

export interface AttendanceRow { employee_id: string; full_name: string; status: string | null }
export interface AttendanceSummary { employee_id: string; full_name: string; presente: number; falta: number; justificada: number; ferias: number }
