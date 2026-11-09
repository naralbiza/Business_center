import ReportsBoard from "@/components/reports/ReportsBoard";
import { getReportsData } from "@/lib/reportsBoard";

export const instant = false;

export default async function Relatorios() {
  const data = await getReportsData();
  return <ReportsBoard data={data} />;
}
