import TaxBoard from "@/components/taxes/TaxBoard";
import { getTaxBoard } from "@/lib/taxBoard";

export const instant = false;

export default async function Impostos() {
  const d = await getTaxBoard();
  return <TaxBoard taxes={d.taxes} today={d.today} canEdit={d.canEdit} needsMigration={d.needsMigration} />;
}
