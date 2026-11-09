import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase-server";
import { siteOrigin } from "@/lib/origin";

// Destino do OAuth (Google) e dos links de recuperação de palavra-passe.
export async function GET(req: NextRequest) {
  const origin = await siteOrigin();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const fail = (erro: string) => NextResponse.redirect(`${origin}/login?erro=${erro}`);

  if (!code) return fail("google");
  const sb = await serverClient();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return fail(safeNext.startsWith("/redefinir") ? "reset-falhou" : "google");

  if (!safeNext.startsWith("/redefinir")) {
    // Só entram contas ativas; contas Google novas ficam à espera de aprovação (ver migração 0010).
    const { data: { user } } = await sb.auth.getUser();
    const { data: profile } = user
      ? await sb.from("profiles").select("active").eq("id", user.id).maybeSingle()
      : { data: null };
    if (!profile?.active) {
      await sb.auth.signOut();
      return fail("nao-autorizado");
    }
  }
  return NextResponse.redirect(`${origin}${safeNext}`);
}
