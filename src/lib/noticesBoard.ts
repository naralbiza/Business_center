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
  return { items: (data ?? []).map((n) => ({ id: n.id, title: n.title, body: n.body ?? "", link: n.link, read: n.read, at: n.created_at, cat: catOf(n.title, n.body ?? "", n.link), demo: false })) };
}
