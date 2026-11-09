import { redirect } from "next/navigation";

export const instant = false;

// Logística, Fornecedores e Manutenção passaram a viver na página Operações.
export default function Page() {
  redirect("/operacoes");
}
