import Link from "next/link";
import { Card, Field, Submit, inputCls, PageHeader, FormError } from "@/components/ui";
import { createContract } from "@/app/actions";
import { getCompanies, getFreeOffices } from "@/lib/data";

export const instant = false;

export default async function NovoContrato({ searchParams }: PageProps<"/contratos/novo">) {
  const { erro, office } = await searchParams;
  const [companies, offices] = await Promise.all([getCompanies(), getFreeOffices()]);
  return (
    <>
      <PageHeader title="Novo contrato" subtitle="Preencha os dados abaixo. Os campos com * são obrigatórios." back="/contratos" />
      <Card>
        <form action={createContract} className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label="Empresa *">
            <select name="company_id" required className={inputCls}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Link href="/escritorios?empresa=nova" className="text-xs text-gold">+ Nova empresa</Link>
          </Field>
          <Field label="Escritório livre *">
            <select name="office_id" required defaultValue={typeof office === "string" ? office : undefined} className={inputCls}>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}
            </select>
            <Link href="/escritorios?novo=1" className="text-xs text-gold">+ Novo escritório</Link>
          </Field>
          <Field label="Início *"><input name="start_date" type="date" required className={inputCls} /></Field>
          <Field label="Fim *"><input name="end_date" type="date" required className={inputCls} /></Field>
          <Field label="Valor total (Kz) *"><input name="total_value" type="number" step="0.01" required className={inputCls} /></Field>
          <Field label="Nº de parcelas *"><input name="installments_count" type="number" min="1" defaultValue={12} required className={inputCls} /></Field>
          <Field label="Periodicidade">
            <select name="periodicity" className={inputCls} defaultValue="mensal">
              {["mensal", "trimestral", "semestral", "anual", "personalizado"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Dia de vencimento (1-28)"><input name="due_day" type="number" min="1" max="28" defaultValue={25} className={inputCls} /></Field>
          {erro && <FormError>{erro}</FormError>}
          <div className="sm:col-span-2"><Submit>Criar contrato e gerar parcelas</Submit></div>
        </form>
      </Card>
    </>
  );
}
