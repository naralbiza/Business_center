import Link from "next/link";
import OfficesBoard from "@/components/offices/OfficesBoard";
import { Card, PageHeader } from "@/components/ui";
import { getOfficesBoard } from "@/lib/offices";

export const instant = false;

export default async function Escritorios({ searchParams }: PageProps<"/escritorios">) {
  const { novo, empresa } = await searchParams;
  const data = await getOfficesBoard();
  if (!data.ready) {
    return (
      <>
        <PageHeader title="Escritórios" subtitle="Planta interativa dos dois edifícios." />
        <Card>
          <div className="max-w-xl space-y-3 text-sm">
            <h2 className="font-serif text-xl">Falta atualizar a base de dados</h2>
            <p className="text-slate-300">A planta dos edifícios precisa da migração <b>0011_buildings.sql</b>. Abra o SQL Editor do Supabase, cole o conteúdo de <code className="text-gold">supabase/migrations/0011_buildings.sql</code> e execute. Depois recarregue esta página.</p>
            <Link href="/escritorios" className="btn-gold inline-block rounded-lg px-4 py-2.5 font-semibold">Recarregar</Link>
          </div>
        </Card>
      </>
    );
  }
  return <OfficesBoard buildings={data.buildings} offices={data.offices} companies={data.companies} canEdit={data.canEdit} openNew={novo === "1"} openCompany={empresa === "nova"} />;
}
