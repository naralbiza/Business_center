import { notFound } from "next/navigation";
import { Badge, Card, Field, Progress, Submit, inputCls } from "@/components/ui";
import Documents from "@/components/Documents";
import { getContract, getOpenInstallments } from "@/lib/data";
import { registerPayment } from "@/app/actions";
import { datePt, kz } from "@/lib/format";

export const instant = false;

export default async function ContratoDetalhe({ params, searchParams }: PageProps<"/contratos/[id]">) {
  const { id } = await params;
  const { erro } = await searchParams;
  const open = await getOpenInstallments(id);
  const c = await getContract(id);
  if (!c) notFound();
  const pct = Math.round((c.paid_total / c.total_value) * 100);
  const stats = [
    ["Valor do contrato", kz(c.total_value)],
    ["Pago", kz(c.paid_total)],
    ["Em falta", kz(c.remaining_total)],
    ["Parcelas pagas", `${c.installments_paid} / ${c.installments_count}`],
    ["Próximo pagamento", c.next_due_date ? datePt(c.next_due_date) : "—"],
    ["Termina em", `${c.days_left} dias`],
  ];
  return (
    <>
      <h1 className="text-3xl">{c.number} · {c.company} <Badge value={c.status} /></h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(([t, v]) => (<Card key={t}><div className="text-sm text-muted">{t}</div><div className="text-xl font-semibold">{v}</div></Card>))}
      </div>
      <Card title={`Progresso de pagamento — ${pct}%`}><Progress pct={pct} /></Card>
      {open.length > 0 && (
        <Card title="Registar pagamento">
          <form action={registerPayment} className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <input type="hidden" name="contract_id" value={id} />
            <Field label="Parcela">
              <select name="installment_id" className={inputCls}>
                {open.map((i) => <option key={i.id} value={i.id}>#{i.seq} · {datePt(i.due_date)} · falta {kz(i.amount - i.paid_amount)}</option>)}
              </select>
            </Field>
            <Field label="Valor (Kz)"><input name="amount" type="number" step="0.01" min="0.01" required defaultValue={open[0].amount - open[0].paid_amount} className={inputCls} /></Field>
            <Field label="Método">
              <select name="method" className={inputCls}>{["transferencia", "numerario", "multicaixa", "cheque", "outro"].map((m) => <option key={m}>{m}</option>)}</select>
            </Field>
            <Field label="Referência"><input name="reference" className={inputCls} /></Field>
            {erro && <p className="text-sm text-bad sm:col-span-2">{erro}</p>}
            <div className="sm:col-span-2"><Submit>Registar pagamento</Submit></div>
          </form>
        </Card>
      )}
      <Documents entity="contract" entityId={id} back={`/contratos/${id}`} erro={typeof erro === "string" && open.length === 0 ? erro : undefined} />
    </>
  );
}
