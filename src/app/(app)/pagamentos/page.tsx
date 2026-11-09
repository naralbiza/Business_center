import PaymentsBoard from "@/components/payments/PaymentsBoard";
import { getPaymentsBoard } from "@/lib/paymentsBoard";

export const instant = false;

export default async function Pagamentos() {
  const d = await getPaymentsBoard();
  return <PaymentsBoard rows={d.rows} buildings={d.buildings} today={d.today} canEdit={d.canEdit} />;
}
