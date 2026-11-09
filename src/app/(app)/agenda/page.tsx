import AgendaBoard from "@/components/agenda/AgendaBoard";
import { getAgendaBoard } from "@/lib/agendaBoard";

export const instant = false;

export default async function Agenda({ searchParams }: PageProps<"/agenda">) {
  const { lead, d, novo } = await searchParams;
  const data = await getAgendaBoard(typeof lead === "string" ? lead : undefined);
  const openDate = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  return (
    <AgendaBoard reservations={data.reservations} venues={data.venues} companies={data.companies} lead={data.lead}
      canEdit={data.canEdit} today={data.today} openDate={openDate} openNew={novo === "1"} />
  );
}
