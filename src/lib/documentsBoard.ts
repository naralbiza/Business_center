import { connection } from "next/server";
import { canDo } from "./permissions";
import { getMe } from "./data";
import { requireUser, serverClient } from "./supabase-server";

export type DocCategory = "empresa" | "contrato" | "financeiro" | "fiscal" | "operacional" | "rh" | "outro";
export type DocType = "pdf" | "doc" | "xls" | "img" | "outro";

export interface DocVM {
  id: string; name: string; path: string; size: number; created_at: string; url: string | null;
  category: DocCategory; type: DocType; status: string; reference: string | null; tags: string | null;
  owner: string; ownerSub: string | null; companyId: string | null; contractId: string | null;
}
export interface DocsBoardData {
  docs: DocVM[]; companies: { id: string; name: string; nif: string | null }[]; contracts: { id: string; number: string; company: string }[];
  canEdit: boolean; needsMigration: boolean;
}

const ENTITY_CAT: Record<string, DocCategory> = { company: "empresa", contract: "contrato", employee: "rh", event: "operacional", financeiro: "financeiro", fiscal: "fiscal", operacional: "operacional", geral: "outro" };
const typeOf = (name: string): DocType => {
  const e = name.split(".").pop()?.toLowerCase() ?? "";
  return e === "pdf" ? "pdf" : ["doc", "docx", "odt", "rtf", "txt"].includes(e) ? "doc" : ["xls", "xlsx", "csv", "ods"].includes(e) ? "xls" : ["jpg", "jpeg", "png", "gif", "webp"].includes(e) ? "img" : "outro";
};

export async function getDocumentsBoard(): Promise<DocsBoardData> {
  await connection();
  await requireUser();
  const sb = await serverClient();

  let needsMigration = false;
  // empresas, contratos e utilizador não dependem dos documentos: arrancam já
  const sideP = Promise.all([
    sb.from("companies").select("id,name,nif").order("name"),
    sb.from("contracts").select("id,number,company_id").order("number", { ascending: false }),
    getMe(),
  ]);
  let res = await sb.from("documents").select("id,entity,entity_id,name,path,size,created_at,category,reference,status,tags").order("created_at", { ascending: false }).limit(1000);
  if (res.error) {
    needsMigration = true;
    const base = await sb.from("documents").select("id,entity,entity_id,name,path,size,created_at").order("created_at", { ascending: false }).limit(1000);
    if (base.error) throw new Error("Não foi possível carregar os documentos.");
    res = { ...base, data: (base.data ?? []).map((d) => ({ ...d, category: null, reference: null, status: "ativo", tags: null })) } as unknown as typeof res;
  }
  const rows = res.data ?? [];

  const [{ data: signed }, [{ data: cos }, { data: ctrs }, me]] = await Promise.all([
    rows.length ? sb.storage.from("documents").createSignedUrls(rows.map((r) => r.path), 3600) : Promise.resolve({ data: [] as { signedUrl: string }[] }),
    sideP,
  ]);
  const co = new Map((cos ?? []).map((c) => [c.id, c.name]));
  const ct = new Map((ctrs ?? []).map((c) => [c.id, c]));

  const docs: DocVM[] = rows.map((r, i) => {
    const c = r.entity === "contract" && r.entity_id ? ct.get(r.entity_id) : undefined;
    const companyId = r.entity === "company" ? r.entity_id : c?.company_id ?? null;
    const owner = companyId ? co.get(companyId) ?? "—" : "Business Center Esperança";
    return {
      id: r.id, name: r.name, path: r.path, size: Number(r.size ?? 0), created_at: r.created_at, url: signed?.[i]?.signedUrl ?? null,
      category: ((r.category as DocCategory | null) ?? ENTITY_CAT[r.entity] ?? "outro"), type: typeOf(r.name), status: r.status ?? "ativo",
      reference: r.reference ?? c?.number ?? null, tags: r.tags ?? null,
      owner, ownerSub: c ? c.number : null, companyId, contractId: r.entity === "contract" ? r.entity_id : null,
    };
  });

  return {
    docs, needsMigration,
    companies: (cos ?? []).map((c) => ({ id: c.id, name: c.name, nif: c.nif })),
    contracts: (ctrs ?? []).map((c) => ({ id: c.id, number: c.number, company: co.get(c.company_id) ?? "—" })),
    canEdit: ["financeiro", "eventos", "rh"].some((m) => canDo(me?.perms, m)),
  };
}
