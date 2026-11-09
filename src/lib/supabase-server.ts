import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Cliente com a sessão do utilizador (cookies), para que o RLS se aplique.
// sessionOnly: cookies de sessão (terminam ao fechar o navegador) — "Manter sessão iniciada" desmarcado.
async function createClient(sessionOnly: boolean) {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => {
            if (sessionOnly) store.set(name, value, { ...options, maxAge: undefined, expires: undefined });
            else store.set(name, value, options);
          });
        } catch { /* chamado de um Server Component */ }
      },
    },
  });
}

// Um só cliente por pedido: evita recriar o cliente em cada consulta da mesma página.
const sharedClient = cache(() => createClient(false));
export const serverClient = ({ sessionOnly = false }: { sessionOnly?: boolean } = {}) =>
  sessionOnly ? createClient(true) : sharedClient();

// Utilizador da sessão, validado uma única vez por pedido (a assinatura do JWT é verificada localmente
// quando o projeto usa chaves assimétricas; senão o Supabase confirma por rede).
export const currentUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const { data } = await (await serverClient()).auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: (c.email as string | undefined) ?? null } : null;
});

// Sem sessão, manda para o login (as páginas de dados chamam isto através de lib/data).
export async function requireUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  if (!(await currentUser())) redirect("/login");
}
