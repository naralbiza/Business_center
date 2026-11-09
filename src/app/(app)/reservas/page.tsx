import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { getReservations } from "@/lib/data";
import { kz } from "@/lib/format";

export const instant = false;

const when = (iso: string) => new Date(iso).toLocaleString("pt-PT", { timeZone: "Africa/Luanda", dateStyle: "short", timeStyle: "short" });

export default async function Reservas() {
  const list = await getReservations();
  return (
    <>
      <PageHeader title="Reservas" subtitle="Todas as reservas do salão de festas." />
      <Card>
        {list.length === 0 ? <p className="py-6 text-center text-sm text-muted">Sem reservas.</p> : (
          <table>
            <thead><tr><th>Evento</th><th>Cliente</th><th>Espaço</th><th>Início</th><th>Convidados</th><th>Estado</th><th className="text-right">Valor</th><th className="text-right">Pago</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const ok = r.status === "confirmada";
                return (
                  <tr key={r.id} className="border-t border-line/70">
                    <td className="font-medium"><Link href={`/agenda/${r.id}`} className="hover:text-gold">{r.title}</Link></td>
                    <td>{r.client}</td><td>{r.venue}</td><td className="whitespace-nowrap">{when(r.starts_at)}</td><td>{r.guests ?? "—"}</td>
                    <td><span className={`rounded-md border px-2 py-0.5 text-xs ${ok ? "border-ok/40 bg-ok/20 text-emerald-300" : "border-warn/50 bg-warn/15 text-amber-300"}`}>{ok ? "Confirmado" : "Em negociação"}</span></td>
                    <td className="whitespace-nowrap text-right">{kz(r.price)}</td><td className="whitespace-nowrap text-right">{kz(r.paid_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
