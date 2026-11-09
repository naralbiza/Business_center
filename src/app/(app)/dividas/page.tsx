import InvoicesBoard from "@/components/invoices/InvoicesBoard";
import { getInvoicesBoard } from "@/lib/invoicesBoard";

export const instant = false;

export default async function FaturasEDividas() {
  const d = await getInvoicesBoard();
  return <InvoicesBoard invoices={d.invoices} buildings={d.buildings} companies={d.companies} today={d.today} canEdit={d.canEdit} />;
}
