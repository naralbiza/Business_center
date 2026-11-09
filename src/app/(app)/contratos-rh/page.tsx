import { redirect } from "next/navigation";

export const instant = false;

// Funcionários, Presenças e Contratos RH passaram a viver na página Recursos Humanos.
export default function Page() {
  redirect("/rh");
}
