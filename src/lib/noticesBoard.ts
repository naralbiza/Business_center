import { connection } from "next/server";
import { requireUser, serverClient } from "./supabase-server";

export type NoticeCat = "eventos" | "contratos" | "financeiro" | "operacoes" | "rh" | "seguranca";
export interface NoticeVM { id: string; title: string; body: string; link: string | null; read: boolean; at: string; cat: NoticeCat; demo: boolean }

const catOf = (title: string, body: string, link: string | null): NoticeCat => {
  const t = `${title} ${body} ${link ?? ""}`.toLowerCase();
  if (/acesso|login|sess[aã]o|seguran/.test(t)) return "seguranca";
  if (/contrato/.test(t)) return "contratos";
  if (/pagamento|fatura|imposto|d[ií]vida|renda|atraso|\/pagamentos|\/dividas|\/impostos/.test(t)) return "financeiro";
  if (/manuten|stock|fornecedor|log[ií]stica|\/operacoes/.test(t)) return "operacoes";
  if (/funcion|admiss|presen|f[eé]rias|\/rh/.test(t)) return "rh";
  return "eventos";
};

export async function getNoticesBoard(): Promise<{ items: NoticeVM[] }> {
  await connection();
  await requireUser();
  const sb = await serverClient();
  const { data } = await sb.from("notifications").select("id,title,body,link,read,created_at").order("created_at", { ascending: false }).limit(100);
  if (data && data.length > 0) {
    return { items: data.map((n) => ({ id: n.id, title: n.title, body: n.body ?? "", link: n.link, read: n.read, at: n.created_at, cat: catOf(n.title, n.body ?? "", n.link), demo: false })) };
  }
  // Sem notificações reais: exemplos de demonstração (só leitura)
  const now = Date.now(), h = 3600e3;
  const d = (id: string, ago: number, title: string, body: string, link: string | null, cat: NoticeCat, read = false): NoticeVM =>
    ({ id: `demo-${id}`, title, body, link, read, at: new Date(now - ago).toISOString(), cat, demo: true });
  return { items: [
    d("1", 0, "Nova reserva de evento", "Salão de Festas reservado para o dia 20/10/2026 às 19:00.", "/agenda", "eventos"),
    d("2", 10 * 60e3, "Contrato a vencer", "O contrato da empresa Sonangol Distribuição vence em 15 dias.", "/contratos", "contratos"),
    d("3", h, "Pagamento confirmado", "Recebido o pagamento de 750.000 Kz da empresa Angola Limpeza.", "/pagamentos", "financeiro", true),
    d("4", 2 * h, "Ordem de manutenção", "Nova ordem de serviço #MAN-2026-045 atribuída à equipa técnica.", "/operacoes", "operacoes", true),
    d("5", 3 * h, "Nova admissão", "João Pereira foi adicionado como funcionário.", "/rh", "rh", true),
    d("6", 5 * h, "Evento confirmado", "Evento Corporativo - Empresa X foi confirmado.", "/agenda", "eventos", true),
    d("7", 8 * h, "Stock baixo", "O item Água 20L está com stock baixo (5 unidades).", "/operacoes", "operacoes", true),
    d("8", 28 * h, "Tentativa de acesso bloqueada", "Tentativa de login bloqueada de IP 192.168.1.20.", "/utilizadores", "seguranca", true),
  ] };
}
