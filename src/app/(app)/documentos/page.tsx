import DocumentsBoard from "@/components/documents/DocumentsBoard";
import { getDocumentsBoard } from "@/lib/documentsBoard";

export const instant = false;

export default async function Documentos() {
  const d = await getDocumentsBoard();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return <DocumentsBoard docs={d.docs} companies={d.companies} contracts={d.contracts} canEdit={d.canEdit} needsMigration={d.needsMigration} monthStart={monthStart} />;
}
