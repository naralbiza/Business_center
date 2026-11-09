import { headers } from "next/headers";

// URL público do site (links de retorno do OAuth e da recuperação de palavra-passe).
// Em produção defina NEXT_PUBLIC_SITE_URL: os cabeçalhos Host/X-Forwarded-Host podem ser forjados
// e não devem decidir para onde apontam os emails de recuperação.
export async function siteOrigin() {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fixed && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(fixed)) return fixed;

  const h = await headers();
  const raw = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const host = raw.split(",")[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return "http://localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${local ? "http" : "https"}://${host}`;
}
