import { connection } from "next/server";

// Alternativa ao GitHub Actions: qualquer agendador externo (Vercel Cron, cron-job.org, UptimeRobot…)
// pode chamar GET /api/keepalive para impedir que o Supabase gratuito seja pausado.
// Se CRON_SECRET estiver definido, exige "Authorization: Bearer <CRON_SECRET>" (o Vercel Cron envia-o sozinho).
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ ok: false }, { status: 503 });
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/keepalive_ping`, {
      method: "POST", cache: "no-store", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: "{}",
    });
    return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 502 });
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }
}
