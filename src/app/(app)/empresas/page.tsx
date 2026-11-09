import { redirect } from "next/navigation";

export const instant = false;

// Empresas passaram a viver na página Escritórios.
export default function Empresas() {
  redirect("/escritorios");
}
