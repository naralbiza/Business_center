import { NextResponse, type NextRequest } from "next/server";

// Primeira barreira: sem cookie de sessão do Supabase, só as rotas públicas são servidas.
// A validação real da sessão continua a ser feita no servidor (requireUser/RLS); isto garante que
// uma rota nova esquecida de requireUser nunca fica aberta a anónimos.
const PUBLIC = ["/login", "/redefinir", "/auth", "/api/keepalive"];

export function proxy(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const hasSession = req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (hasSession) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$).*)"],
};
