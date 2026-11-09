import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Field, Progress, Submit, inputCls } from "@/components/ui";
import { registerEventPayment } from "@/app/actions";
import Documents from "@/components/Documents";
import { getEventPayments, getReservation } from "@/lib/data";
import { datePt, kz } from "@/lib/format";

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-PT", { timeZone: "Africa/Luanda", dateStyle: "short", timeStyle: "short" });

export const instant = false;

export default async function ReservaDetalhe({ params, searchParams }: PageProps<"/agenda/[id]">) {
  const { id } = await params;
  const { erro } = await searchParams;
  const [r, payments] = await Promise.all([getReservation(id), getEventPayments(id)]);
  if (!r) notFound();
  const missing = Math.max(r.price - r.paid_total, 0);
  const pct = r.price > 0 ? Math.round((r.paid_total / r.price) * 100) : 0;
  const stats = [
    ["Valor do evento", kz(r.price)],
    ["Pago", kz(r.paid_total)],
    ["Em falta", kz(missing)],
  ];
  return (
    <>
      <Link href="/agenda" className="text-sm text-gold">← Agenda</Link>
      <h1 className="text-3xl">{r.title} · {r.client}</h1>
      <p className="text-sm text-muted">{r.venue} · {fmt(r.starts_at)} → {fmt(r.ends_at)}{r.guests ? ` · ${r.guests} convidados` : ""} · {r.status}</p>
      <div className="grid grid-cols-3 gap-4">
        {stats.map(([t, v]) => (<Card key={t}><div className="text-sm text-muted">{t}</div><div className="text-xl font-semibold">{v}</div></Card>))}
      </div>
      <Card title={`Pagamento — ${pct}%`}><Progress pct={pct} /></Card>

      <Card title="Registar pagamento">
        <form action={registerEventPayment} className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <input type="hidden" name="reservation_id" value={id} />
          <Field label="Valor (Kz)"><input name="amount" type="number" step="0.01" min="0.01" required defaultValue={missing || undefined} className={inputCls} /></Field>
          <Field label="Método">
            <select name="method" className={inputCls}>{["transferencia", "numerario", "multicaixa", "cheque", "outro"].map((m) => <option key={m}>{m}</option>)}</select>
          </Field>
          <Field label="Referência"><input name="reference" className={inputCls} /></Field>
          {erro && <p className="text-sm text-bad sm:col-span-2">{erro}</p>}
          <div className="sm:col-span-2"><Submit>Registar pagamento</Submit></div>
        </form>
      </Card>

      <Card title="Pagamentos recebidos">
        {payments.length === 0 ? <p className="text-sm text-muted">Ainda sem pagamentos.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr><th>Data</th><th>Valor</th><th>Método</th><th>Referência</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-line"><td className="py-2">{datePt(p.paid_at)}</td><td>{kz(p.amount)}</td><td>{p.method}</td><td>{p.reference ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Documents entity="event" entityId={id} back={`/agenda/${id}`} />
    </>
  );
}
