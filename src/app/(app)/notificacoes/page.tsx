import NoticesBoard from "@/components/notices/NoticesBoard";
import { getNoticesBoard } from "@/lib/noticesBoard";

export const instant = false;

export default async function Notificacoes() {
  const d = await getNoticesBoard();
  return <NoticesBoard items={d.items} />;
}
