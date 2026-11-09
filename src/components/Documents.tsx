import { Card, Submit, inputCls } from "@/components/ui";
import { deleteDocument, uploadDocument } from "@/app/actions";
import { getDocuments } from "@/lib/data";
import { datePt } from "@/lib/format";
import PdfImporter from "@/components/documents/PdfImporter";

const size = (n: number | null) => (n == null ? "" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

// entity: company | contract | employee | event; back: rota a que se volta depois da ação
export default async function Documents({ entity, entityId, back, erro }: { entity: string; entityId: string; back: string; erro?: string }) {
  const docs = await getDocuments(entity, entityId);
  return (
    <Card title="Documentos">
      {docs.length === 0 ? <p className="mb-3 text-sm text-muted">Sem documentos.</p> : (
        <ul className="mb-4 space-y-2 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
              <span>
                {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-gold">{d.name}</a> : d.name}
                <span className="ml-2 text-xs text-muted">{size(d.size)} · {datePt(d.created_at)}</span>
              </span>
              <form action={deleteDocument}>
                <input type="hidden" name="id" value={d.id} /><input type="hidden" name="path" value={d.path} /><input type="hidden" name="back" value={back} />
                <button className="text-xs text-bad">apagar</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="mb-3 text-sm text-bad">{erro}</p>}
      {entity === "company" ? <PdfImporter companies={[]} fixedCompanyId={entityId} compact /> : (
        <form action={uploadDocument} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="entity" value={entity} /><input type="hidden" name="entity_id" value={entityId} /><input type="hidden" name="back" value={back} />
          <input name="file" type="file" required className={inputCls + " max-w-xs"} />
          <Submit>Enviar documento</Submit>
        </form>
      )}
    </Card>
  );
}
