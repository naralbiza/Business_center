import { redirect } from "next/navigation";

export const instant = false;

export default async function FichaEmpresa({ params }: PageProps<"/empresas/[id]">) {
  const { id } = await params;
  redirect(`/escritorios/empresa/${id}`);
}
