import { redirect } from "next/navigation";

export const instant = false;

export default function NovaEmpresa() {
  redirect("/escritorios?empresa=nova");
}
