import { Card, Field, Submit, inputCls, PageHeader, FormError } from "@/components/ui";
import { createLead } from "@/app/actions";

export const instant = false;

export default async function NovoLead({ searchParams }: PageProps<"/eventos/novo">) {
  const { erro } = await searchParams;
  return (
    <>
      <PageHeader title="Novo lead" subtitle="Preencha os dados abaixo. Os campos com * são obrigatórios." back="/eventos" />
      <Card>
        <form action={createLead} className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field label="Nome *"><input name="name" required className={inputCls} /></Field>
          <Field label="Telefone"><input name="phone" className={inputCls} /></Field>
          <Field label="Tipo de evento"><input name="event_type" defaultValue="Casamento" className={inputCls} /></Field>
          <Field label="Data desejada"><input name="desired_date" type="date" className={inputCls} /></Field>
          <Field label="Convidados"><input name="guests" type="number" className={inputCls} /></Field>
          <Field label="Orçamento (Kz)"><input name="budget" type="number" className={inputCls} /></Field>
          {erro && <FormError>{erro}</FormError>}
          <div className="sm:col-span-2"><Submit>Guardar lead</Submit></div>
        </form>
      </Card>
    </>
  );
}
