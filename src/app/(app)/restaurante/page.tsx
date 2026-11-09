import Link from "next/link";
import RestaurantBoard from "@/components/restaurant/RestaurantBoard";
import { Card, PageHeader } from "@/components/ui";
import { getRestaurantBoard } from "@/lib/restaurantBoard";

export const instant = false;

export default async function Restaurante() {
  const d = await getRestaurantBoard();
  if (!d.ready) {
    return (
      <>
        <PageHeader title="Restaurante" subtitle="Gestão de reservas, mesas e operação." />
        <Card>
          <div className="max-w-xl space-y-3 text-sm">
            <h2 className="font-serif text-xl">Falta atualizar a base de dados</h2>
            <p className="text-slate-300">Este módulo precisa da migração <b>0015_restaurant.sql</b>. Abra o SQL Editor do Supabase, cole o conteúdo de <code className="text-gold">supabase/migrations/0015_restaurant.sql</code> e execute. Para dados de exemplo, execute depois <code className="text-gold">supabase/seed_demo_restaurante.sql</code>.</p>
            <Link href="/restaurante" className="btn-gold inline-block rounded-lg px-4 py-2.5 font-semibold">Recarregar</Link>
          </div>
        </Card>
      </>
    );
  }
  return <RestaurantBoard tables={d.tables} reservations={d.reservations} canEdit={d.canEdit} today={d.today} />;
}
