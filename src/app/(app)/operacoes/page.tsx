import OperationsBoard from "@/components/operations/OperationsBoard";
import { getOperationsBoard } from "@/lib/operationsBoard";

export const instant = false;

export default async function Operacoes() {
  const d = await getOperationsBoard();
  return <OperationsBoard items={d.items} movements={d.movements} suppliers={d.suppliers} tickets={d.tickets} equipment={d.equipment}
    costs={d.costs} plans={d.plans} canEdit={d.canEdit} today={d.today} monthStart={d.monthStart} needsMigration={d.needsMigration} />;
}
