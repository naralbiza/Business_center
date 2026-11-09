import type { SupabaseClient } from "@supabase/supabase-js";

// Escritórios com o edifício numa única consulta. Se a coluna building_id ainda não existe
// (migração 0011 por aplicar) repete sem ela, para a página continuar a funcionar.
type OfficeRow = { id: string; number: string; area_m2?: number | null; building_id?: string | null };
export async function officesWithBuilding(sb: SupabaseClient, withArea = false): Promise<{ data: OfficeRow[] | null }> {
  const base = withArea ? "id,number,area_m2" : "id,number";
  const r = await sb.from("offices").select(base + ",building_id");
  if (!r.error) return { data: r.data as unknown as OfficeRow[] };
  const b = await sb.from("offices").select(base);
  return { data: (b.data ?? null) as unknown as OfficeRow[] | null };
}
