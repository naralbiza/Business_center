import HrBoard from "@/components/hr/HrBoard";
import { getHrBoard } from "@/lib/hrBoard";

export const instant = false;

export default async function RecursosHumanos() {
  const d = await getHrBoard();
  return <HrBoard employees={d.employees} attendance={d.attendance} canEdit={d.canEdit} today={d.today} monthStart={d.monthStart} needsMigration={d.needsMigration} />;
}
