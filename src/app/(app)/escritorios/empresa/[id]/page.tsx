import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Field, Progress, Submit, inputCls } from "@/components/ui";
import { deleteCompany, updateCompany } from "@/app/actions";
import Documents from "@/components/Documents";
import { getCompany, getContracts, getDebts, getReservations } from "@/lib/data";
import { datePt, kz } from "@/lib/format";

export const instant = false;

export default async function FichaEmpresa({ params, searchParams }: PageProps<"/escritorios/empresa/[id]">) {
  const { id } = await params;
  const { erro } = await searchParams;
  const company = await getCompany(id);
  if (!company) notFound();
  const [allContracts, allDebts, allReservations] = await Promise.all([getContracts(), getDebts(), getReservations()]);
  const contracts = allContracts.filter((c) => c.company_id === id);
  const debts = allDebts.filter((d) => d.company_id === id);
  // Eventos: ligação pela empresa da reserva, ou pelo nome do cliente nas reservas antigas
  const events = allReservations.filter((r) => r.company_id === id || r.client.trim().toLowerCase() === company.name.trim().toLowerCase());

  const total = contracts.reduce((s, c) => s + c.total_value, 0);
  const paid = contracts.reduce((s, c) => s + c.paid_total, 0);
  const owed = debts.reduce((s, d) => s + d.owed, 0);
  const overdue = debts.filter((d) => d.days_overdue > 0).reduce((s, d) => s + d.owed, 0);
  const stats = [
    ["Contratos", `${contracts.length}`],
    ["Valor contratado", kz(total)],
    ["Pago", kz(paid)],
    ["Em falta", kz(total - paid)],
    ["Em atraso", kz(overdue)],
    ["Eventos", `${events.length}`],
  ];
  const info: [string, string | null][] = [
    ["NIF", company.nif], ["Sector", company.sector], ["Telefone", company.phone], ["Email", company.email],
    ["Representante", company.legal_rep_name], ["Endereço", company.address],
  ];

  return (
    <>
      <Link href="/escritorios" className="text-sm text-gold">← Escritórios e empresas</Link>
      <h1 className="text-3xl">{company.name}</h1>
      <Card>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {info.map(([k, v]) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{v ?? "—"}</dd></div>))}
        </dl>
      </Card>
      {erro && typeof erro === "string" && <p className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-red-300">{erro}</p>}
      <Card title="Editar dados da empresa">
        <form action={updateCompany} className="grid max-w-3xl gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={id} />
          <Field label="Nome *"><input name="name" required defaultValue={company.name} className={inputCls} /></Field>
          <Field label="NIF"><input name="nif" defaultValue={company.nif ?? ""} className={inputCls} /></Field>
          <Field label="Sector"><input name="sector" defaultValue={company.sector ?? ""} className={inputCls} /></Field>
          <Field label="Telefone"><input name="phone" defaultValue={company.phone ?? ""} className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={company.email ?? ""} className={inputCls} /></Field>
          <Field label="Representante legal"><input name="legal_rep_name" defaultValue={company.legal_rep_name ?? ""} className={inputCls} /></Field>
          <div className="sm:col-span-2"><Field label="Endereço"><input name="address" defaultValue={company.address ?? ""} className={inputCls} /></Field></div>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2"><Submit>Guardar alterações</Submit></div>
        </form>
        <form action={deleteCompany} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={id} />
          <button className="text-xs text-red-400 hover:underline">Eliminar empresa</button>
          <span className="ml-3 text-xs text-slate-400">Só é possível se não tiver contratos associados.</span>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {stats.map(([t, v]) => (<Card key={t}><div className="text-xs text-muted">{t}</div><div className="font-semibold">{v}</div></Card>))}
      </div>

      <Card title="Contratos">
        {contracts.length === 0 ? <p className="text-sm text-muted">Sem contratos.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr><th>Nº</th><th>Esc.</th><th>Período</th><th>Pago</th><th className="w-36">Progresso</th><th>Estado</th></tr></thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-2"><Link className="text-gold" href={`/contratos/${c.id}`}>{c.number}</Link></td>
                  <td>{c.office_number}</td><td>{datePt(c.start_date)} → {datePt(c.end_date)}</td><td>{kz(c.paid_total)}</td>
                  <td><Progress pct={(c.paid_total / c.total_value) * 100} /></td><td><Badge value={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`Dívidas — ${kz(owed)}`}>
        {debts.length === 0 ? <p className="text-sm text-muted">Sem dívidas.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr><th>Contrato</th><th>Vencimento</th><th>Em dívida</th><th>Atraso</th></tr></thead>
            <tbody>
              {debts.map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="py-2">{d.contract_number}</td><td>{datePt(d.due_date)}</td><td>{kz(d.owed)}</td>
                  <td className={d.days_overdue ? "text-bad" : "text-muted"}>{d.days_overdue ? `${d.days_overdue} dias` : "Pendente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Eventos">
        {events.length === 0 ? <p className="text-sm text-muted">Sem eventos com este nome de cliente.</p> : (
          <ul className="space-y-2 text-sm">
            {events.map((r) => (
              <li key={r.id}><Link className="text-gold" href={`/agenda/${r.id}`}>{r.title}</Link> · {new Date(r.starts_at).toLocaleDateString("pt-PT", { timeZone: "Africa/Luanda" })} · {kz(r.paid_total)} / {kz(r.price)}</li>
            ))}
          </ul>
        )}
      </Card>
      <Documents entity="company" entityId={id} back={`/escritorios/empresa/${id}`} erro={typeof erro === "string" ? erro : undefined} />
    </>
  );
}
