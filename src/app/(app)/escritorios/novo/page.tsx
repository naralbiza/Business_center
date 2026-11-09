import { redirect } from "next/navigation";

export const instant = false;

// O novo escritório cria-se agora no painel da planta.
export default function NovoEscritorio() {
  redirect("/escritorios?novo=1");
}
