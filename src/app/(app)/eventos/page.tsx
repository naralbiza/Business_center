import CrmBoard from "@/components/crm/CrmBoard";
import { getCrmBoard } from "@/lib/crmBoard";

export const instant = false;

export default async function Eventos() {
  const d = await getCrmBoard();
  return <CrmBoard leads={d.leads} reservations={d.reservations} canEdit={d.canEdit} needsMigration={d.needsMigration} today={d.today} monthStart={d.monthStart} />;
}
