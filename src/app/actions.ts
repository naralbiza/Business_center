"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasSupabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { currentUser, serverClient } from "@/lib/supabase-server";
import { siteOrigin } from "@/lib/origin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(str(f, k).replace(/\s/g, "").replace(",", "."));

// Mensagens seguras para o utilizador: o detalhe técnico fica só no log do servidor.
// Caminho interno seguro para redireccionamentos (impede open redirect: só "/algo", nunca "//host" ou "https://")
const safeBack = (v: string, fallback = "/") => (/^\/(?!\/)[A-Za-z0-9/_?=&.%-]*$/.test(v) ? v : fallback);

// Ficheiros aceites nos uploads: extensão e tipo MIME vêm de uma lista fechada (nunca do cliente)
const UPLOAD_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv", txt: "text/plain",
};
const uploadType = (name: string) => UPLOAD_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? null;

function friendly(e: { code?: string; message?: string }) {
  console.error("[db]", e.code, (e.message ?? "").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").slice(0, 200));
  const known: Record<string, string> = {
    '23P01': 'Este espaço já está reservado neste período.',
    '23505': 'Já existe um registo com estes dados.',
    '23503': 'Este registo está associado a outros dados.',
    '23502': 'Preencha todos os campos obrigatórios.',
    '42501': 'Não tem permissão para esta operação.',
  };
  return (e.code && known[e.code]) || 'Não foi possível concluir a operação. Tente novamente.';
}

// Cria a conta de login já confirmada. Com SUPABASE_SERVICE_ROLE_KEY (só no servidor) usa a API de administração:
// não envia email nem depende do limite de emails do Supabase. Sem ela, recorre ao registo normal (a migração
// 0023 confirma o email automaticamente na base de dados).
async function createAuthUser(email: string, password: string, name: string): Promise<{ data: { user: { id: string; identities?: unknown[] } | null; session: unknown }; error: { code?: string; message?: string } | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  if (service) {
    const admin = createClient(url, service, opts);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) return error.code === "email_exists" ? { data: { user: null, session: null }, error: null } : { data: { user: null, session: null }, error };
    return { data: { user: data.user, session: true }, error: null };
  }
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  const r = await anon.auth.signUp({ email, password, options: { data: { full_name: name } } });
  return { data: { user: r.data?.user ?? null, session: r.data?.session ?? null }, error: r.error };
}

async function db() {
  if (!hasSupabase) redirect("/login?erro=sem-supabase");
  return serverClient();
}

export async function signIn(f: FormData) {
  if (!hasSupabase) redirect("/login?erro=sem-supabase");
  const sb = await serverClient({ sessionOnly: f.get("remember") !== "on" });
  const email = str(f, "email").toLowerCase().slice(0, 200);
  // Bloqueio temporário após falhas repetidas (função na BD; ignora se a migração 0021 ainda não existe)
  const { data: blocked } = await sb.rpc("login_blocked", { p_email: email });
  if (blocked === true) redirect("/login?erro=muitas-tentativas");
  const { error } = await sb.auth.signInWithPassword({ email, password: str(f, "password") });
  await sb.rpc("log_access", { p_email: email, p_ok: !error });
  if (error) {
    console.error("[auth]", error.code);
    // Email inexistente e palavra-passe errada dão a mesma mensagem. "Por confirmar" só é devolvido pelo Supabase
    // depois de a palavra-passe estar certa, por isso mostrá-lo não permite descobrir contas.
    const motivo = error.status === 429 ? "muitas-tentativas"
      : error.code === "email_not_confirmed" ? "nao-confirmado"
      : error.code === "invalid_credentials" ? "credenciais" : "indisponivel";
    redirect(`/login?erro=${motivo}`);
  }
  // Credenciais certas mas conta inativa (contas novas nascem inativas até um administrador as ativar)
  const { data: { user } } = await sb.auth.getUser();
  const { data: prof } = user ? await sb.from("profiles").select("active").eq("id", user.id).maybeSingle() : { data: null };
  if (prof && prof.active === false) {
    await sb.auth.signOut();
    redirect("/login?erro=nao-autorizado");
  }
  redirect("/");
}

export async function signInWithGoogle() {
  const sb = await db();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?erro=google");
  // Provedor desativado no Supabase: o endpoint /authorize responde 400 em JSON. Detetamos para mostrar uma mensagem útil.
  const probe = await fetch(data.url, { redirect: "manual" }).catch(() => null);
  if (probe && probe.status === 400) redirect("/login?erro=google-desativado");
  redirect(data.url);
}

export async function requestPasswordReset(f: FormData) {
  const sb = await db();
  const email = str(f, "email");
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/redefinir`,
  });
  if (error) redirect("/login?erro=reset-falhou");
  redirect("/login?ok=reset-enviado");
}

export async function updatePassword(f: FormData) {
  const sb = await db();
  const password = str(f, "password");
  if (password.length < 8 || password !== str(f, "confirm")) redirect("/redefinir?erro=invalida");
  const { error } = await sb.auth.updateUser({ password });
  if (error) redirect("/redefinir?erro=falhou");
  redirect("/");
}

export async function signOut() {
  const sb = await db();
  await sb.auth.signOut();
  redirect("/login");
}

export async function createContract(f: FormData) {
  const sb = await db();
  if (!(num(f, "total_value") > 0) || !(num(f, "installments_count") >= 1) || str(f, "end_date") <= str(f, "start_date"))
    redirect("/contratos/novo?erro=" + encodeURIComponent("Verifique o valor, o número de prestações e as datas do contrato."));
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from("contracts").insert({
    office_id: str(f, "office_id"), company_id: str(f, "company_id"),
    start_date: str(f, "start_date"), end_date: str(f, "end_date"),
    total_value: num(f, "total_value"), installments_count: num(f, "installments_count"),
    periodicity: str(f, "periodicity"), due_day: num(f, "due_day"), created_by: user?.id,
  }).select("id").single();
  if (error) redirect(`/contratos/novo?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/contratos");
  redirect(`/contratos/${data.id}`);
}

export async function registerPayment(f: FormData) {
  const sb = await db();
  const contractId = str(f, "contract_id");
  if (!(num(f, "amount") > 0)) redirect(`/contratos/${contractId}?erro=${encodeURIComponent("Indique um valor positivo.")}`);
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("payments").insert({
    installment_id: str(f, "installment_id"), amount: num(f, "amount"),
    method: str(f, "method"), reference: str(f, "reference") || null, created_by: user?.id,
  });
  if (error) redirect(`/contratos/${contractId}?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath(`/contratos/${contractId}`);
  redirect(`/contratos/${contractId}`);
}

export async function markTaxPaid(f: FormData) {
  const sb = await db();
  const { error } = await sb.from("tax_obligations").update({ paid: true, paid_at: new Date().toISOString().slice(0, 10) }).eq("id", str(f, "id"));
  if (error) redirect(`/impostos?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/impostos");
  redirect("/impostos");
}

export async function createLead(f: FormData) {
  const sb = await db();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("event_leads").insert({
    name: str(f, "name"), phone: str(f, "phone") || null, event_type: str(f, "event_type") || "Casamento",
    desired_date: str(f, "desired_date") || null, guests: num(f, "guests") || null, budget: num(f, "budget") || null,
    created_by: user?.id,
  });
  if (error) redirect(`/eventos/novo?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/eventos");
  redirect("/eventos");
}

export async function setLeadStage(f: FormData) {
  const sb = await db();
  const { error } = await sb.from("event_leads").update({ stage: str(f, "stage") }).eq("id", str(f, "id"));
  if (error) redirect(`/eventos?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/eventos");
  redirect("/eventos");
}

// Datas dos formulários são horas locais de Luanda (UTC+1)
const luanda = (v: string) => new Date(`${v}:00+01:00`).toISOString();

export async function createReservation(f: FormData) {
  const sb = await db();
  if (!str(f, "starts_at") || !str(f, "ends_at") || str(f, "ends_at") <= str(f, "starts_at") || !str(f, "title") || !str(f, "client"))
    redirect("/agenda?erro=" + encodeURIComponent("Indique o título, o cliente e um período válido."));
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("venue_reservations").insert({
    venue_id: str(f, "venue_id"), title: str(f, "title"), client: str(f, "client"),
    starts_at: luanda(str(f, "starts_at")), ends_at: luanda(str(f, "ends_at")),
    guests: num(f, "guests") || null, status: str(f, "status") || "pendente", created_by: user?.id,
    price: num(f, "price") || 0, lead_id: str(f, "lead_id") || null, company_id: str(f, "company_id") || null,
  });
  if (error) {
    const msg = error.code === "23P01" ? "Este espaço já está reservado neste período." : friendly(error);
    redirect(`/agenda?m=${str(f, "starts_at").slice(0, 7)}&d=${str(f, "starts_at").slice(0, 10)}&erro=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/agenda");
  redirect(`/agenda?m=${str(f, "starts_at").slice(0, 7)}`);
}

export async function createEmployee(f: FormData) {
  const sb = await db();
  if (!str(f, "full_name") || !str(f, "position")) redirect("/funcionarios/novo?erro=" + encodeURIComponent("Indique o nome e o cargo."));
  const { error } = await sb.from("employees").insert({
    full_name: str(f, "full_name"), bi: str(f, "bi") || null, nif: str(f, "nif") || null,
    phone: str(f, "phone") || null, email: str(f, "email") || null,
    position: str(f, "position"), department: str(f, "department") || "Geral",
    hire_date: str(f, "hire_date") || null, contract_type: str(f, "contract_type") || "Efetivo",
    salary: num(f, "salary") || null,
  });
  if (error) redirect(`/funcionarios/novo?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/funcionarios");
  redirect("/funcionarios");
}

export async function registerEventPayment(f: FormData) {
  const sb = await db();
  const id = str(f, "reservation_id");
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("event_payments").insert({
    reservation_id: id, amount: num(f, "amount"), method: str(f, "method"), reference: str(f, "reference") || null, created_by: user?.id,
  });
  if (error) redirect(`/agenda/${id}?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/agenda");
  revalidatePath("/eventos");
  redirect(`/agenda/${id}`);
}

export async function setUserRole(f: FormData) {
  const sb = await db();
  const id = str(f, "id");
  const { data: { user } } = await sb.auth.getUser();
  if (user?.id === id) redirect("/utilizadores?erro=" + encodeURIComponent("Não podes alterar o teu próprio papel."));
  const { error } = await sb.from("profiles").update({ role: str(f, "role"), active: f.get("active") === "on" }).eq("id", id);
  if (error) redirect(`/utilizadores?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/utilizadores");
  redirect("/utilizadores");
}

const ROLES = ["super_admin", "administrador", "financeiro", "eventos", "restaurante", "operacoes", "rh", "operador"];

// Cria um utilizador (só super_admin). Usa um cliente sem sessão, para não trocar a sessão do administrador.
export async function createUser(f: FormData) {
  const sb = await db();
  const me = await currentUser();
  if (!me) redirect("/login");
  const { data: mine } = await sb.from("profiles").select("role").eq("id", me.id).maybeSingle();
  const back = (k: string, v: string): never => redirect(`/utilizadores?${k}=${encodeURIComponent(v)}`);
  if (mine?.role !== "super_admin") back("erro", "Só o super admin pode criar utilizadores.");

  const name = str(f, "name"), email = str(f, "email").toLowerCase(), password = String(f.get("password") ?? ""), role = str(f, "role");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("erro", "Indique o nome e um email válido.");
  if (password.length < 8) back("erro", "A palavra-passe deve ter pelo menos 8 caracteres.");
  if (!ROLES.includes(role)) back("erro", "Papel inválido.");

  const { data, error } = await createAuthUser(email, password, name);
  if (error) {
    console.error("[auth]", error.code, error.message);
    back("erro", error.code === "over_email_send_rate_limit" ? "Limite de emails do Supabase atingido. Aguarde um pouco e tente de novo."
      : error.code === "weak_password" ? "Palavra-passe demasiado fraca." : "Não foi possível criar o utilizador.");
  }
  if (!data?.user || data.user.identities?.length === 0) back("erro", "Já existe um utilizador com este email.");

  const extra: Record<string, unknown> = {};
  if (str(f, "department")) extra.department = str(f, "department");
  if (str(f, "phone")) extra.phone = str(f, "phone");
  if (str(f, "group_id")) extra.group_id = str(f, "group_id");
  let { error: pErr } = await sb.from("profiles").update({ role, full_name: name, active: true, ...extra }).eq("id", data!.user!.id);
  if (pErr && pErr.code === "42703") ({ error: pErr } = await sb.from("profiles").update({ role, full_name: name, active: true }).eq("id", data!.user!.id));
  if (pErr) back("erro", friendly(pErr));
  revalidatePath("/utilizadores");
  back("ok", data!.session ? "Utilizador criado." : "Utilizador criado. Foi enviado um email de confirmação.");
}

export async function uploadDocument(f: FormData) {
  const sb = await db();
  const entity = str(f, "entity"), entityId = str(f, "entity_id"), back = safeBack(str(f, "back"));
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`${back}?erro=${encodeURIComponent("Escolhe um ficheiro.")}`);
  if (!uploadType(file.name)) redirect(`${back}?erro=${encodeURIComponent("Tipo de ficheiro não permitido.")}`);
  if (file.size > 10 * 1024 * 1024) redirect(`${back}?erro=${encodeURIComponent("O ficheiro pode ter no máximo 10 MB.")}`);
  if (!/^[a-z_]{1,30}$/.test(entity)) redirect(`${back}?erro=${encodeURIComponent("Dados inválidos.")}`);
  const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${entity}/${entityId}/${Date.now()}-${safe}`;
  const { error: upErr } = await sb.storage.from("documents").upload(path, file, { contentType: uploadType(file.name) ?? undefined });
  if (upErr) redirect(`${back}?erro=${encodeURIComponent(friendly(upErr))}`);
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("documents").insert({ entity, entity_id: entityId, name: file.name, path, size: file.size, created_by: user?.id });
  if (error) {
    await sb.storage.from("documents").remove([path]);
    redirect(`${back}?erro=${encodeURIComponent(friendly(error))}`);
  }
  revalidatePath(back);
  redirect(back);
}

export async function deleteDocument(f: FormData) {
  const sb = await db();
  const back = safeBack(str(f, "back"));
  const { error } = await sb.from("documents").delete().eq("id", str(f, "id"));
  if (!error) await sb.storage.from("documents").remove([str(f, "path")]);
  revalidatePath(back);
  redirect(error ? `${back}?erro=${encodeURIComponent(friendly(error))}` : back);
}

export async function createSupplier(f: FormData) {
  const sb = await db();
  const { error } = await sb.from("suppliers").insert({ name: str(f, "name"), category: str(f, "category") || null, phone: str(f, "phone") || null, email: str(f, "email") || null });
  redirect(error ? `/fornecedores?erro=${encodeURIComponent(friendly(error))}` : "/fornecedores");
}

export async function createItem(f: FormData) {
  const sb = await db();
  const { error } = await sb.from("logistics_items").insert({
    name: str(f, "name"), category: str(f, "category") || "Equipamento", quantity: num(f, "quantity") || 0,
    min_quantity: num(f, "min_quantity") || 0, unit: str(f, "unit") || "un", location: str(f, "location") || null,
    supplier_id: str(f, "supplier_id") || null,
  });
  revalidatePath("/logistica");
  redirect(error ? `/logistica?erro=${encodeURIComponent(friendly(error))}` : "/logistica");
}

export async function addMovement(f: FormData) {
  const sb = await db();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("logistics_movements").insert({
    item_id: str(f, "item_id"), kind: str(f, "kind"), quantity: num(f, "quantity"),
    destination: str(f, "destination") || null, note: str(f, "note") || null, created_by: user?.id,
  });
  revalidatePath("/logistica");
  redirect(error ? `/logistica?erro=${encodeURIComponent(friendly(error))}` : "/logistica");
}

export async function createTicket(f: FormData) {
  const sb = await db();
  const { error } = await sb.from("maintenance_tickets").insert({ title: str(f, "title"), area: str(f, "area") || "Edifício", priority: str(f, "priority") || "normal" });
  revalidatePath("/manutencao");
  redirect(error ? `/manutencao?erro=${encodeURIComponent(friendly(error))}` : "/manutencao");
}

export async function setTicketStatus(f: FormData) {
  const sb = await db();
  const cost = num(f, "cost");
  const { error } = await sb.from("maintenance_tickets").update({ status: str(f, "status"), ...(cost ? { cost } : {}) }).eq("id", str(f, "id"));
  revalidatePath("/manutencao");
  redirect(error ? `/manutencao?erro=${encodeURIComponent(friendly(error))}` : "/manutencao");
}

export async function saveAttendance(f: FormData) {
  const sb = await db();
  const day = str(f, "day");
  const rows = [...f.entries()]
    .filter(([k, v]) => k.startsWith("s_") && String(v))
    .map(([k, v]) => ({ employee_id: k.slice(2), day, status: String(v) }));
  const { error } = rows.length ? await sb.from("attendance").upsert(rows, { onConflict: "employee_id,day" }) : { error: null };
  revalidatePath("/presencas");
  redirect(`/presencas?d=${day}${error ? `&erro=${encodeURIComponent(friendly(error))}` : ""}`);
}

export async function markNotificationsRead() {
  const sb = await db();
  await sb.from("notifications").update({ read: true }).eq("read", false);
  revalidatePath("/notificacoes");
  redirect("/notificacoes");
}

// ───────── Planta dos escritórios (edifícios) ─────────
export type ActionResult = { ok: boolean; error?: string; id?: string };
const OFFICE_STATUSES = ["livre", "reservado", "ocupado", "manutencao", "bloqueado"];
const PLAN_COLS = 12;
type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export async function createOfficeBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const buildingId = str(f, "building_id"), number = str(f, "number"), area = num(f, "area_m2");
  const status = str(f, "status") || "livre";
  const w = Math.max(1, Math.round(num(f, "width")) || 1), h = Math.max(1, Math.round(num(f, "height")) || 1);
  if (!buildingId || !number || !(area > 0)) return { ok: false, error: "Indique o edifício, o número e a área." };
  if (!OFFICE_STATUSES.includes(status)) return { ok: false, error: "Estado inválido." };

  const { data: b } = await sb.from("buildings").select("id,code").eq("id", buildingId).maybeSingle();
  if (!b) return { ok: false, error: "Edifício não encontrado." };
  const { data: existing, error: eErr } = await sb.from("offices").select("number,position_x,position_y,width,height").eq("building_id", buildingId);
  if (eErr) return { ok: false, error: friendly(eErr) };
  if ((existing ?? []).some((o) => o.number === number)) return { ok: false, error: `O escritório ${number} já existe neste edifício.` };

  // Posição: a indicada ou a primeira célula livre (a planta cresce em linhas quando está cheia)
  const rects: Rect[] = (existing ?? []).map((o) => ({ x: o.position_x, y: o.position_y, w: o.width, h: o.height }));
  const hasX = String(f.get("position_x") ?? "").trim() !== "" && String(f.get("position_y") ?? "").trim() !== "";
  let pos: Rect = { x: Math.max(0, Math.round(num(f, "position_x")) || 0), y: Math.max(0, Math.round(num(f, "position_y")) || 0), w, h };
  if (hasX) {
    if (rects.some((r) => overlaps(r, pos))) return { ok: false, error: "Essa posição já está ocupada na planta." };
  } else {
    search: for (let y = 0; y < 500; y++) for (let x = 0; x + w <= Math.max(PLAN_COLS, w); x++) {
      const cand = { x, y, w, h };
      if (!rects.some((r) => overlaps(r, cand))) { pos = cand; break search; }
    }
  }

  const { data, error } = await sb.from("offices").insert({
    building_id: buildingId, number, code: `${b.code}-${number}`, floor: 1, area_m2: area, status,
    monthly_value: num(f, "monthly_value") || null, notes: str(f, "notes") || null,
    position_x: pos.x, position_y: pos.y, width: pos.w, height: pos.h, sort_order: (existing?.length ?? 0) + 1,
  }).select("id").single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/escritorios"); revalidatePath("/");
  return { ok: true, id: data.id };
}

export async function updateOfficeBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id");
  const area = num(f, "area_m2");
  if (!id || !(area > 0)) return { ok: false, error: "A área deve ser maior que zero." };
  const w = Math.max(1, Math.round(num(f, "width")) || 1), h = Math.max(1, Math.round(num(f, "height")) || 1);
  const { data: me } = await sb.from("offices").select("building_id,position_x,position_y").eq("id", id).maybeSingle();
  if (!me) return { ok: false, error: "Escritório não encontrado." };
  const { data: others } = await sb.from("offices").select("position_x,position_y,width,height").eq("building_id", me.building_id).neq("id", id);
  const mine: Rect = { x: me.position_x, y: me.position_y, w, h };
  if ((others ?? []).some((o) => overlaps({ x: o.position_x, y: o.position_y, w: o.width, h: o.height }, mine))) return { ok: false, error: "O novo tamanho sobrepõe outro escritório na planta." };
  const { error } = await sb.from("offices").update({
    area_m2: area, monthly_value: num(f, "monthly_value") || null, notes: str(f, "notes") || null, width: w, height: h,
  }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/escritorios");
  return { ok: true, id };
}

export async function setOfficeStatus(id: string, status: string): Promise<ActionResult> {
  const sb = await db();
  if (!OFFICE_STATUSES.includes(status)) return { ok: false, error: "Estado inválido." };
  const { error } = await sb.from("offices").update({ status }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/escritorios"); revalidatePath("/");
  return { ok: true, id };
}

export async function saveOfficeLayout(buildingId: string, items: { id: string; x: number; y: number; w: number; h: number }[]): Promise<ActionResult> {
  const sb = await db();
  const clean = items.map((i) => ({ id: String(i.id), x: Math.max(0, Math.round(i.x)), y: Math.max(0, Math.round(i.y)), w: Math.max(1, Math.round(i.w)), h: Math.max(1, Math.round(i.h)) }));
  for (let i = 0; i < clean.length; i++) for (let j = i + 1; j < clean.length; j++) {
    if (overlaps(clean[i], clean[j])) return { ok: false, error: "Existem escritórios sobrepostos na planta." };
  }
  const { data: valid } = await sb.from("offices").select("id").eq("building_id", buildingId);
  const ids = new Set((valid ?? []).map((o) => o.id));
  if (clean.some((c) => !ids.has(c.id))) return { ok: false, error: "Escritório não pertence a este edifício." };
  const results = await Promise.all(clean.map((c) => sb.from("offices").update({ position_x: c.x, position_y: c.y, width: c.w, height: c.h }).eq("id", c.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: friendly(failed.error) };
  revalidatePath("/escritorios");
  return { ok: true };
}

export async function deactivateOffice(id: string): Promise<ActionResult> {
  const sb = await db();
  const { data: live } = await sb.from("contracts").select("id").eq("office_id", id).in("status", ["ativo", "a_terminar"]).limit(1);
  if (live?.length) return { ok: false, error: "Este escritório tem um contrato ativo. Termine o contrato antes de o desativar." };
  const { error } = await sb.from("offices").update({ is_active: false }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/escritorios"); revalidatePath("/");
  return { ok: true };
}

export async function deleteOffice(id: string): Promise<ActionResult> {
  const sb = await db();
  const { count, error: cErr } = await sb.from("contracts").select("id", { count: "exact", head: true }).eq("office_id", id);
  if (cErr) return { ok: false, error: friendly(cErr) };
  if ((count ?? 0) > 0) return { ok: false, error: "Este escritório tem contratos associados (histórico financeiro). Use “Desativar” para o retirar da planta sem perder o histórico." };
  const { error } = await sb.from("offices").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/escritorios"); revalidatePath("/");
  return { ok: true };
}

// ───────── Empresas (geridas a partir da página Escritórios) ─────────
const companyFields = (f: FormData) => ({
  name: str(f, "name"), nif: str(f, "nif") || null, sector: str(f, "sector") || null,
  phone: str(f, "phone") || null, email: str(f, "email") || null,
  legal_rep_name: str(f, "legal_rep_name") || null, address: str(f, "address") || null,
});

export async function createCompanyBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const v = companyFields(f);
  if (!v.name) return { ok: false, error: "Indique o nome da empresa." };
  if (v.nif) {
    const { data: dup } = await sb.from("companies").select("id").eq("nif", v.nif).limit(1);
    if (dup?.length) return { ok: false, error: "Já existe uma empresa com este NIF." };
  }
  const { data, error } = await sb.from("companies").insert(v).select("id").single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/escritorios"); revalidatePath("/contratos");
  return { ok: true, id: data.id };
}

export async function updateCompany(f: FormData) {
  const sb = await db();
  const id = str(f, "id");
  const v = companyFields(f);
  const back = (erro?: string): never => redirect(`/escritorios/empresa/${id}${erro ? `?erro=${encodeURIComponent(erro)}` : ""}`);
  if (!v.name) back("Indique o nome da empresa.");
  const { error } = await sb.from("companies").update(v).eq("id", id);
  if (error) back(friendly(error));
  revalidatePath("/escritorios"); revalidatePath("/contratos");
  back();
}

export async function deleteCompany(f: FormData) {
  const sb = await db();
  const id = str(f, "id");
  const { count } = await sb.from("contracts").select("id", { count: "exact", head: true }).eq("company_id", id);
  if ((count ?? 0) > 0) redirect(`/escritorios/empresa/${id}?erro=${encodeURIComponent("Esta empresa tem contratos associados e não pode ser eliminada.")}`);
  const { error } = await sb.from("companies").delete().eq("id", id);
  if (error) redirect(`/escritorios/empresa/${id}?erro=${encodeURIComponent(friendly(error))}`);
  revalidatePath("/escritorios"); revalidatePath("/contratos");
  redirect("/escritorios");
}

// ───────── Pagamentos (registo a partir da página Pagamentos) ─────────
export async function registerPaymentBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const installmentId = str(f, "installment_id");
  const amount = num(f, "amount");
  const method = str(f, "method") || "transferencia";
  const paidAt = str(f, "paid_at") || new Date().toISOString().slice(0, 10);
  if (!installmentId || !(amount > 0)) return { ok: false, error: "Indique a prestação e um valor maior que zero." };
  if (!["transferencia", "numerario", "multicaixa", "cheque", "outro"].includes(method)) return { ok: false, error: "Método inválido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return { ok: false, error: "Data inválida." };

  const { data: inst, error: iErr } = await sb.from("installments").select("amount,paid_amount,status").eq("id", installmentId).maybeSingle();
  if (iErr || !inst) return { ok: false, error: "Prestação não encontrada." };
  if (inst.status === "cancelada") return { ok: false, error: "Esta prestação foi cancelada." };
  const remaining = Number(inst.amount) - Number(inst.paid_amount);
  if (remaining <= 0) return { ok: false, error: "Esta prestação já está paga." };
  if (amount > remaining + 0.005) return { ok: false, error: `O valor excede o que falta pagar (${Math.round(remaining).toLocaleString("pt-PT")} Kz).` };

  const me = await currentUser();
  const { data, error } = await sb.from("payments").insert({
    installment_id: installmentId, amount, method, paid_at: paidAt, reference: str(f, "reference") || null, created_by: me?.id,
  }).select("id").single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/pagamentos"); revalidatePath("/contratos"); revalidatePath("/dividas"); revalidatePath("/");
  return { ok: true, id: data.id };
}

// ───────── Impostos (página Impostos) ─────────
const TAX_KINDS = ["iva", "iac", "irpc", "imposto_selo", "imposto_ip", "predial", "taxa", "outro"];
const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function createTax(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const kind = str(f, "kind"), label = str(f, "label"), due = str(f, "due_date");
  const amount = num(f, "amount");
  const status = str(f, "status") || "aberto";
  if (!TAX_KINDS.includes(kind)) return { ok: false, error: "Tipo de imposto inválido." };
  if (!label || !isoDate(due) || !(amount >= 0)) return { ok: false, error: "Indique a descrição, o vencimento e o valor." };
  const comp = isoDate(str(f, "competence") + "-01") ? str(f, "competence") + "-01" : `${due.slice(0, 7)}-01`;
  const paidAt = str(f, "paid_at") || due;
  const { data, error } = await sb.from("tax_obligations").insert({
    kind, label, reference: str(f, "reference") || null, period_label: str(f, "period_label") || null,
    competence: comp, due_date: due, amount, paid: status === "pago", paid_at: status === "pago" ? paidAt : null,
    in_preparation: status === "preparacao",
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Já existe uma obrigação deste tipo para esse mês de competência." };
    if (error.code === "22P02" || error.code === "42703") return { ok: false, error: "Falta aplicar a migração 0012_tax_types.sql na base de dados." };
    return { ok: false, error: friendly(error) };
  }
  revalidatePath("/impostos");
  return { ok: true, id: data.id };
}

export async function updateTax(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), due = str(f, "due_date"), amount = num(f, "amount");
  if (!id || !isoDate(due) || !(amount >= 0)) return { ok: false, error: "Indique o vencimento e um valor válido." };
  const { error } = await sb.from("tax_obligations").update({
    due_date: due, amount, reference: str(f, "reference") || null, period_label: str(f, "period_label") || null,
  }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/impostos");
  return { ok: true, id };
}

// state: "pago" (com data), "aberto" ou "preparacao"
export async function setTaxState(id: string, state: string, paidAt?: string): Promise<ActionResult> {
  const sb = await db();
  if (!["pago", "aberto", "preparacao"].includes(state)) return { ok: false, error: "Estado inválido." };
  const when = paidAt && isoDate(paidAt) ? paidAt : new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("tax_obligations").update({
    paid: state === "pago", paid_at: state === "pago" ? when : null, in_preparation: state === "preparacao",
  }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/impostos"); revalidatePath("/");
  return { ok: true, id };
}

export async function deleteTax(id: string): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("tax_obligations").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/impostos");
  return { ok: true };
}

// ───────── Documentos (página Documentos) ─────────
const DOC_CATS: Record<string, string> = { empresa: "company", contrato: "contract", financeiro: "financeiro", fiscal: "fiscal", operacional: "operacional", rh: "employee", outro: "geral" };

export async function uploadDocumentsBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
  const category = str(f, "category") || "outro";
  const companyId = str(f, "company_id"), contractId = str(f, "contract_id");
  const status = ["ativo", "pendente", "pago", "arquivado"].includes(str(f, "status")) ? str(f, "status") : "ativo";
  if (files.length === 0) return { ok: false, error: "Escolha pelo menos um ficheiro." };
  if (!(category in DOC_CATS)) return { ok: false, error: "Categoria inválida." };
  if (files.some((x) => x.size > 10 * 1024 * 1024)) return { ok: false, error: "Cada ficheiro pode ter no máximo 10 MB." };
  const bad = files.find((x) => !uploadType(x.name));
  if (bad) return { ok: false, error: `Tipo de ficheiro não permitido: “${bad.name}”. Use PDF, imagens, Office, CSV ou TXT.` };

  // A ligação a um contrato/empresa define a entidade; senão usa a da categoria
  const entity = contractId ? "contract" : companyId ? "company" : DOC_CATS[category];
  const entityId = contractId || companyId || null;
  const me = await currentUser();
  let done = 0;
  for (const file of files) {
    const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${entity}/${entityId ?? "geral"}/${Date.now()}-${done}-${safe}`;
    const { error: upErr } = await sb.storage.from("documents").upload(path, file, { contentType: uploadType(file.name) ?? undefined });
    if (upErr) return { ok: false, error: done ? `${done} enviado(s); falhou “${file.name}”: ${friendly(upErr)}` : friendly(upErr) };
    const { error } = await sb.from("documents").insert({
      entity, entity_id: entityId, name: file.name, path, size: file.size, created_by: me?.id,
      category, reference: str(f, "reference") || null, status, tags: str(f, "tags") || null, mime: uploadType(file.name),
    });
    if (error) {
      await sb.storage.from("documents").remove([path]);
      if (error.code === "42703" || error.code === "23514" || error.code === "23502") return { ok: false, error: "Falta aplicar a migração 0013_documents_board.sql na base de dados." };
      return { ok: false, error: friendly(error) };
    }
    done++;
  }
  revalidatePath("/documentos");
  return { ok: true };
}

export async function deleteDocumentBoard(id: string, path: string): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  await sb.storage.from("documents").remove([path]);
  revalidatePath("/documentos");
  return { ok: true };
}

// ───────── CRM de Eventos (página CRM) ─────────
const LEAD_STAGES = ["novo", "contactado", "visita", "proposta", "negociacao", "reserva", "contrato", "pagamento", "confirmado", "realizado", "posvenda", "perdido"];

export async function createLeadBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const name = str(f, "name");
  if (!name) return { ok: false, error: "Indique o nome do cliente." };
  const me = await currentUser();
  const row: Record<string, unknown> = {
    name, phone: str(f, "phone") || null, email: str(f, "email") || null, event_type: str(f, "event_type") || "Casamento",
    desired_date: str(f, "desired_date") || null, guests: Math.round(num(f, "guests")) || null, budget: num(f, "budget") || null,
    notes: str(f, "notes") || null, created_by: me?.id,
  };
  if (str(f, "source")) row.source = str(f, "source");
  let { data, error } = await sb.from("event_leads").insert(row).select("id").single();
  if (error && error.code === "42703" && "source" in row) {
    delete row.source; // migração 0014 ainda não aplicada
    ({ data, error } = await sb.from("event_leads").insert(row).select("id").single());
  }
  if (error || !data) return { ok: false, error: friendly(error ?? {}) };
  revalidatePath("/eventos");
  return { ok: true, id: data.id };
}

export async function updateLeadBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), name = str(f, "name");
  if (!id || !name) return { ok: false, error: "Indique o nome do cliente." };
  const row: Record<string, unknown> = {
    name, phone: str(f, "phone") || null, email: str(f, "email") || null, event_type: str(f, "event_type") || "Casamento",
    desired_date: str(f, "desired_date") || null, guests: Math.round(num(f, "guests")) || null, budget: num(f, "budget") || null, notes: str(f, "notes") || null,
  };
  if (f.has("source")) row.source = str(f, "source") || null;
  let { error } = await sb.from("event_leads").update(row).eq("id", id);
  if (error && error.code === "42703" && "source" in row) { delete row.source; ({ error } = await sb.from("event_leads").update(row).eq("id", id)); }
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/eventos");
  return { ok: true, id };
}

export async function setLeadStageBoard(id: string, stage: string): Promise<ActionResult> {
  const sb = await db();
  if (!LEAD_STAGES.includes(stage)) return { ok: false, error: "Etapa inválida." };
  const { error } = await sb.from("event_leads").update({ stage }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/eventos");
  return { ok: true, id };
}

export async function deleteLead(id: string): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("event_leads").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/eventos");
  return { ok: true };
}

// ───────── Agenda e Eventos (página Agenda) ─────────
export async function createReservationBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const venueId = str(f, "venue_id"), title = str(f, "title"), client = str(f, "client");
  const startsRaw = str(f, "starts_at"), endsRaw = str(f, "ends_at");
  if (!venueId || !title || !client || !startsRaw || !endsRaw) return { ok: false, error: "Preencha o espaço, o evento, o cliente e o horário." };
  const starts = luanda(startsRaw), ends = luanda(endsRaw);
  if (Number.isNaN(Date.parse(starts)) || Number.isNaN(Date.parse(ends))) return { ok: false, error: "Datas inválidas." };
  if (Date.parse(ends) <= Date.parse(starts)) return { ok: false, error: "O fim deve ser depois do início." };
  const status = ["pendente", "confirmada"].includes(str(f, "status")) ? str(f, "status") : "pendente";
  const me = await currentUser();
  const { data, error } = await sb.from("venue_reservations").insert({
    venue_id: venueId, title, client, starts_at: starts, ends_at: ends, guests: Math.round(num(f, "guests")) || null, status,
    price: num(f, "price") || 0, lead_id: str(f, "lead_id") || null, company_id: str(f, "company_id") || null, created_by: me?.id,
  }).select("id").single();
  if (error) return { ok: false, error: error.code === "23P01" ? "Este espaço já está reservado neste período." : friendly(error) };
  revalidatePath("/agenda"); revalidatePath("/eventos"); revalidatePath("/");
  return { ok: true, id: data.id };
}

export async function setReservationStatusBoard(id: string, status: string): Promise<ActionResult> {
  const sb = await db();
  if (!["pendente", "confirmada", "cancelada"].includes(status)) return { ok: false, error: "Estado inválido." };
  const { error } = await sb.from("venue_reservations").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23P01" ? "Este espaço já está reservado neste período." : friendly(error) };
  revalidatePath("/agenda"); revalidatePath("/eventos");
  return { ok: true, id };
}

// ───────── Restaurante (mesas e reservas) ─────────
const TABLE_STATUS = ["livre", "ocupada", "reservada", "preparar", "bloqueada"];
const RES_STATUS = ["confirmada", "aguardar", "a_chegar", "em_curso", "concluida", "cancelada"];

export async function saveRestaurantTable(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), code = str(f, "code"), area = str(f, "area") || "Área Principal";
  const capacity = Math.round(num(f, "capacity")), x = num(f, "pos_x"), y = num(f, "pos_y");
  if (!code || !(capacity > 0)) return { ok: false, error: "Indique o código e a capacidade da mesa." };
  if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) return { ok: false, error: "A posição deve estar entre 0 e 100 (%)." };
  const row = { code, area, capacity, pos_x: x, pos_y: y };
  const q = id ? sb.from("restaurant_tables").update(row).eq("id", id).select("id").single() : sb.from("restaurant_tables").insert(row).select("id").single();
  const { data, error } = await q;
  if (error) return { ok: false, error: error.code === "23505" ? "Já existe uma mesa com este código nesta área." : error.code === "42P01" ? "Falta aplicar a migração 0015_restaurant.sql." : friendly(error) };
  revalidatePath("/restaurante");
  return { ok: true, id: data.id };
}

export async function setRestaurantTableStatus(id: string, status: string): Promise<ActionResult> {
  const sb = await db();
  if (!TABLE_STATUS.includes(status)) return { ok: false, error: "Estado inválido." };
  const { error } = await sb.from("restaurant_tables").update({ status }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/restaurante");
  return { ok: true, id };
}

export async function deleteRestaurantTable(id: string): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("restaurant_tables").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/restaurante");
  return { ok: true };
}

async function tableBusy(sb: Awaited<ReturnType<typeof db>>, tableId: string, startsIso: string, durMin: number, exceptId?: string) {
  const start = Date.parse(startsIso), end = start + durMin * 60000;
  const { data } = await sb.from("restaurant_reservations").select("id,starts_at,duration_min,status")
    .eq("table_id", tableId).not("status", "in", "(cancelada,concluida)")
    .gte("starts_at", new Date(start - 8 * 3600e3).toISOString()).lte("starts_at", new Date(end).toISOString());
  return (data ?? []).some((r) => r.id !== exceptId && Date.parse(r.starts_at) < end && Date.parse(r.starts_at) + r.duration_min * 60000 > start);
}

export async function saveRestaurantReservation(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), client = str(f, "client"), tableId = str(f, "table_id");
  const party = Math.round(num(f, "party_size")), dur = Math.round(num(f, "duration_min")) || 120;
  const raw = str(f, "starts_at");
  const status = RES_STATUS.includes(str(f, "status")) ? str(f, "status") : "confirmada";
  if (!client || !(party > 0) || !raw) return { ok: false, error: "Indique o cliente, o número de pessoas e o horário." };
  const starts = luanda(raw);
  if (Number.isNaN(Date.parse(starts))) return { ok: false, error: "Data inválida." };
  if (tableId && !["cancelada", "concluida"].includes(status) && (await tableBusy(sb, tableId, starts, dur, id || undefined))) {
    return { ok: false, error: "Essa mesa já tem uma reserva nesse horário." };
  }
  const me = await currentUser();
  const row = { client, phone: str(f, "phone") || null, party_size: party, starts_at: starts, duration_min: dur, status, table_id: tableId || null, notes: str(f, "notes") || null };
  const q = id ? sb.from("restaurant_reservations").update(row).eq("id", id).select("id").single()
    : sb.from("restaurant_reservations").insert({ ...row, created_by: me?.id }).select("id").single();
  const { data, error } = await q;
  if (error) return { ok: false, error: error.code === "42P01" ? "Falta aplicar a migração 0015_restaurant.sql." : friendly(error) };
  revalidatePath("/restaurante");
  return { ok: true, id: data.id };
}

export async function setRestaurantReservationStatus(id: string, status: string): Promise<ActionResult> {
  const sb = await db();
  if (!RES_STATUS.includes(status)) return { ok: false, error: "Estado inválido." };
  const { data: r, error } = await sb.from("restaurant_reservations").update({ status }).eq("id", id).select("table_id").single();
  if (error) return { ok: false, error: friendly(error) };
  // A mesa acompanha o estado do atendimento
  if (r?.table_id) {
    if (status === "em_curso") await sb.from("restaurant_tables").update({ status: "ocupada" }).eq("id", r.table_id);
    else if (status === "concluida") await sb.from("restaurant_tables").update({ status: "preparar" }).eq("id", r.table_id);
    else if (status === "cancelada") await sb.from("restaurant_tables").update({ status: "livre" }).eq("id", r.table_id).in("status", ["reservada"]);
  }
  revalidatePath("/restaurante");
  return { ok: true, id };
}

export async function deleteRestaurantReservation(id: string): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("restaurant_reservations").delete().eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/restaurante");
  return { ok: true };
}

// ───────── Operações (logística, fornecedores e manutenção numa só página) ─────────
const opsErr = (e: { code?: string; message?: string }): ActionResult =>
  e.code === "42P01" || e.code === "42703" ? { ok: false, error: "Falta aplicar a migração 0016_operations.sql na base de dados." }
    : e.message?.startsWith("Stock insuficiente") ? { ok: false, error: e.message }
    : { ok: false, error: friendly(e) };

export async function saveItemBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), name = str(f, "name");
  if (!name) return { ok: false, error: "Indique o nome do item." };
  const row = { name, category: str(f, "category") || "Equipamento", unit: str(f, "unit") || "un", location: str(f, "location") || null,
    min_quantity: Math.max(0, num(f, "min_quantity") || 0), supplier_id: str(f, "supplier_id") || null };
  const { data, error } = id
    ? await sb.from("logistics_items").update(row).eq("id", id).select("id").single()
    : await sb.from("logistics_items").insert({ ...row, quantity: Math.max(0, num(f, "quantity") || 0) }).select("id").single();
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true, id: data.id };
}

export async function moveItemBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const kind = str(f, "kind"), qty = num(f, "quantity");
  if (!["entrada", "saida", "ajuste"].includes(kind) || !(qty > 0) || !str(f, "item_id")) return { ok: false, error: "Indique o item, o tipo e uma quantidade maior que zero." };
  const me = await currentUser();
  const { error } = await sb.from("logistics_movements").insert({
    item_id: str(f, "item_id"), kind, quantity: qty, destination: str(f, "destination") || null, note: str(f, "note") || null, created_by: me?.id,
  });
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true };
}

export async function saveSupplierBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), name = str(f, "name");
  if (!name) return { ok: false, error: "Indique o nome do fornecedor." };
  const row: Record<string, unknown> = { name, category: str(f, "category") || null, nif: str(f, "nif") || null, phone: str(f, "phone") || null, email: str(f, "email") || null };
  if (f.has("rating")) row.rating = Math.min(5, Math.max(1, Math.round(num(f, "rating")))) || null;
  if (f.has("status")) row.status = ["ativo", "avaliacao", "inativo"].includes(str(f, "status")) ? str(f, "status") : "ativo";
  const { data, error } = id ? await sb.from("suppliers").update(row).eq("id", id).select("id").single() : await sb.from("suppliers").insert(row).select("id").single();
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true, id: data.id };
}

export async function saveTicketBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const title = str(f, "title");
  if (!title) return { ok: false, error: "Descreva a ordem de serviço." };
  const row: Record<string, unknown> = { title, area: str(f, "area") || "Edifício", priority: ["baixa", "normal", "alta", "urgente"].includes(str(f, "priority")) ? str(f, "priority") : "normal",
    supplier_id: str(f, "supplier_id") || null, cost: num(f, "cost") || null };
  if (str(f, "equipment_id")) row.equipment_id = str(f, "equipment_id");
  let { data, error } = await sb.from("maintenance_tickets").insert(row).select("id").single();
  if (error && error.code === "42703" && "equipment_id" in row) { delete row.equipment_id; ({ data, error } = await sb.from("maintenance_tickets").insert(row).select("id").single()); }
  if (error || !data) return opsErr(error ?? {});
  revalidatePath("/operacoes");
  return { ok: true, id: data.id };
}

export async function setTicketStatusBoard(id: string, status: string): Promise<ActionResult> {
  const sb = await db();
  if (!["aberto", "em_curso", "concluido"].includes(status)) return { ok: false, error: "Estado inválido." };
  const { error } = await sb.from("maintenance_tickets").update({ status }).eq("id", id);
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true, id };
}

export async function saveEquipmentBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), name = str(f, "name");
  if (!name) return { ok: false, error: "Indique o nome do equipamento." };
  const status = ["operacional", "manutencao", "inativo", "fora_servico"].includes(str(f, "status")) ? str(f, "status") : "operacional";
  const row = { name, code: str(f, "code") || null, category: str(f, "category") || "Equipamento", location: str(f, "location") || null, status,
    supplier_id: str(f, "supplier_id") || null, value: num(f, "value") || null };
  const { data, error } = id ? await sb.from("equipment").update(row).eq("id", id).select("id").single() : await sb.from("equipment").insert(row).select("id").single();
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true, id: data.id };
}

export async function setEquipmentStatusBoard(id: string, status: string): Promise<ActionResult> {
  const sb = await db();
  if (!["operacional", "manutencao", "inativo", "fora_servico"].includes(status)) return { ok: false, error: "Estado inválido." };
  const { error } = await sb.from("equipment").update({ status }).eq("id", id);
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true, id };
}

// Registar compra/custo (opcionalmente dá entrada em stock)
export async function createCostBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const amount = num(f, "amount"), desc = str(f, "description");
  const category = ["manutencao", "compras", "servicos", "energia", "outros"].includes(str(f, "category")) ? str(f, "category") : "compras";
  if (!desc || !(amount >= 0)) return { ok: false, error: "Indique a descrição e o valor." };
  const me = await currentUser();
  const { error } = await sb.from("operational_costs").insert({
    spent_on: str(f, "spent_on") || new Date().toISOString().slice(0, 10), category, description: desc, amount, supplier_id: str(f, "supplier_id") || null, created_by: me?.id,
  });
  if (error) return opsErr(error);
  const itemId = str(f, "item_id"), qty = num(f, "quantity");
  if (itemId && qty > 0) {
    const { error: mErr } = await sb.from("logistics_movements").insert({ item_id: itemId, kind: "entrada", quantity: qty, destination: "Compra", note: desc, created_by: me?.id });
    if (mErr) return opsErr(mErr);
  }
  revalidatePath("/operacoes");
  return { ok: true };
}

export async function savePlanBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const title = str(f, "title"), next = str(f, "next_due"), every = Math.round(num(f, "every_days"));
  if (!title || !isoDate(next) || !(every > 0)) return { ok: false, error: "Indique a tarefa, a próxima data e a periodicidade (dias)." };
  const { error } = await sb.from("maintenance_plans").insert({ title, next_due: next, every_days: every, equipment_id: str(f, "equipment_id") || null });
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true };
}

export async function completePlanBoard(id: string): Promise<ActionResult> {
  const sb = await db();
  const { data: p } = await sb.from("maintenance_plans").select("every_days,next_due").eq("id", id).maybeSingle();
  if (!p) return { ok: false, error: "Plano não encontrado." };
  const base = Math.max(Date.parse(p.next_due), Date.now());
  const next = new Date(base + p.every_days * 864e5).toISOString().slice(0, 10);
  const { error } = await sb.from("maintenance_plans").update({ next_due: next }).eq("id", id);
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true };
}

export async function deleteOpsRecord(table: string, id: string): Promise<ActionResult> {
  const sb = await db();
  const allowed = ["logistics_items", "suppliers", "equipment", "maintenance_tickets", "maintenance_plans", "operational_costs"];
  if (!allowed.includes(table)) return { ok: false, error: "Operação não permitida." };
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) return opsErr(error);
  revalidatePath("/operacoes");
  return { ok: true };
}

// ───────── Recursos Humanos (funcionários, presenças e contratos numa só página) ─────────
const hrErr = (e: { code?: string; message?: string }): ActionResult =>
  e.code === "42703" || e.code === "23514" ? { ok: false, error: "Falta aplicar a migração 0017_hr.sql na base de dados." } : { ok: false, error: friendly(e) };
const EMP_STATUS = ["ativo", "ferias", "suspenso", "desligado"];
const ATT_STATUS = ["presente", "atraso", "falta", "justificada", "ferias", "folga"];
const timeOk = (s: string) => !s || /^\d{2}:\d{2}$/.test(s);

export async function saveEmployeeBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), name = str(f, "full_name"), position = str(f, "position");
  if (!name || !position) return { ok: false, error: "Indique o nome e o cargo." };
  const status = EMP_STATUS.includes(str(f, "status")) ? str(f, "status") : "ativo";
  const row: Record<string, unknown> = {
    full_name: name, position, department: str(f, "department") || "Geral", hire_date: str(f, "hire_date") || null,
    contract_type: str(f, "contract_type") || "Efetivo", salary: num(f, "salary") || null, status,
    phone: str(f, "phone") || null, email: str(f, "email") || null, bi: str(f, "bi") || null, nif: str(f, "nif") || null,
  };
  if (f.has("contract_end")) row.contract_end = str(f, "contract_end") || null;
  if (f.has("birth_date")) row.birth_date = str(f, "birth_date") || null;
  const { data, error } = id ? await sb.from("employees").update(row).eq("id", id).select("id").single() : await sb.from("employees").insert(row).select("id").single();
  if (error) return hrErr(error);
  revalidatePath("/rh");
  return { ok: true, id: data.id };
}

export async function setEmployeeStatusBoard(id: string, status: string): Promise<ActionResult> {
  const sb = await db();
  if (!EMP_STATUS.includes(status)) return { ok: false, error: "Estado inválido." };
  const { error } = await sb.from("employees").update({ status }).eq("id", id);
  if (error) return hrErr(error);
  revalidatePath("/rh");
  return { ok: true, id };
}

export async function deleteEmployeeBoard(id: string): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) return hrErr(error);
  revalidatePath("/rh");
  return { ok: true };
}

export async function saveAttendanceBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const employee = str(f, "employee_id"), day = str(f, "day") || new Date().toISOString().slice(0, 10);
  const status = str(f, "status"), cin = str(f, "check_in"), cout = str(f, "check_out");
  if (!employee || !ATT_STATUS.includes(status) || !isoDate(day)) return { ok: false, error: "Indique o funcionário, o dia e o estado." };
  if (!timeOk(cin) || !timeOk(cout)) return { ok: false, error: "Horas inválidas (use HH:MM)." };
  if (cin && cout && cout <= cin) return { ok: false, error: "A saída deve ser depois da entrada." };
  const row = { employee_id: employee, day, status, check_in: cin || null, check_out: cout || null };
  let { error } = await sb.from("attendance").upsert(row, { onConflict: "employee_id,day" });
  if (error && error.code === "42703") ({ error } = await sb.from("attendance").upsert({ employee_id: employee, day, status }, { onConflict: "employee_id,day" }));
  if (error) return hrErr(error);
  revalidatePath("/rh");
  return { ok: true };
}

// ───────── Utilizadores e Permissões (aplicadas no backend por RLS; aqui só mensagens amigáveis) ─────────
const usrErr = (e: { code?: string; message?: string }): ActionResult =>
  e.code === "42703" || e.code === "42P01" || e.code === "22P02" ? { ok: false, error: "Falta aplicar as migrações 0018 e 0019 na base de dados." }
  : /Sem permiss|row-level|42501/.test(e.message ?? "") || e.code === "42501" ? { ok: false, error: "Não tem permissão para esta operação." }
  : { ok: false, error: friendly(e) };
const PERM_MODULES = ["dashboard", "escritorios", "empresas", "contratos", "financeiro", "eventos", "restaurante", "operacoes", "rh", "relatorios", "administracao"];

export async function createUserBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const me = await currentUser();
  if (!me) return { ok: false, error: "Sessão expirada." };
  const { data: lvl } = await sb.rpc("perm_level", { m: "administracao" });
  if (Number(lvl ?? 0) < 2) return { ok: false, error: "Não tem permissão para criar utilizadores." };
  const name = str(f, "name"), email = str(f, "email").toLowerCase(), password = String(f.get("password") ?? ""), role = str(f, "role");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Indique o nome e um email válido." };
  if (password.length < 8) return { ok: false, error: "A palavra-passe deve ter pelo menos 8 caracteres." };
  if (!ROLES.includes(role)) return { ok: false, error: "Cargo inválido." };
  const { data, error } = await createAuthUser(email, password, name);
  if (error) {
    console.error("[auth]", error.code, error.message);
    return { ok: false, error: error.code === "over_email_send_rate_limit" ? "Limite de emails atingido. Aguarde um pouco." : error.code === "weak_password" ? "Palavra-passe demasiado fraca." : "Não foi possível criar o utilizador." };
  }
  if (!data?.user || data.user.identities?.length === 0) return { ok: false, error: "Já existe um utilizador com este email." };
  const extra: Record<string, unknown> = { department: str(f, "department") || null, phone: str(f, "phone") || null, group_id: str(f, "group_id") || null };
  let { error: pErr } = await sb.from("profiles").update({ role, full_name: name, active: true, ...extra }).eq("id", data.user.id);
  if (pErr && pErr.code === "42703") ({ error: pErr } = await sb.from("profiles").update({ role, full_name: name, active: true }).eq("id", data.user.id));
  if (pErr) return usrErr(pErr);
  revalidatePath("/utilizadores");
  return { ok: true, id: data.user.id };
}

export async function updateUserBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), role = str(f, "role"), name = str(f, "name");
  if (!id || !name) return { ok: false, error: "Indique o nome." };
  if (!ROLES.includes(role)) return { ok: false, error: "Cargo inválido." };
  const row: Record<string, unknown> = { full_name: name, role, department: str(f, "department") || null, phone: str(f, "phone") || null, group_id: str(f, "group_id") || null };
  const { error } = await sb.from("profiles").update(row).eq("id", id);
  if (error) return usrErr(error);
  revalidatePath("/utilizadores");
  return { ok: true, id };
}

export async function setUserActiveBoard(id: string, active: boolean): Promise<ActionResult> {
  const sb = await db();
  const me = await currentUser();
  if (me?.id === id) return { ok: false, error: "Não pode desativar a sua própria conta." };
  const { error } = await sb.from("profiles").update({ active }).eq("id", id);
  if (error) return usrErr(error);
  if (!active) await sb.rpc("admin_revoke_sessions", { target: id });
  revalidatePath("/utilizadores");
  return { ok: true, id };
}

export async function setRolePermission(role: string, module: string, level: number): Promise<ActionResult> {
  const sb = await db();
  if (!ROLES.includes(role) || !PERM_MODULES.includes(module) || !Number.isInteger(level) || level < 0 || level > 3) return { ok: false, error: "Dados inválidos." };
  if (role === "super_admin") return { ok: false, error: "O Super Admin tem sempre acesso total." };
  const { error } = await sb.from("role_permissions").upsert({ role, module, level }, { onConflict: "role,module" });
  if (error) return usrErr(error);
  revalidatePath("/utilizadores");
  return { ok: true };
}

export async function saveGroupBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const id = str(f, "id"), name = str(f, "name");
  if (!name) return { ok: false, error: "Indique o nome do grupo." };
  const row = { name, description: str(f, "description") || null };
  const { data, error } = id ? await sb.from("permission_groups").update(row).eq("id", id).select("id").single() : await sb.from("permission_groups").insert(row).select("id").single();
  if (error) return usrErr(error);
  revalidatePath("/utilizadores");
  return { ok: true, id: data.id };
}

export async function setGroupPermission(groupId: string, module: string, level: number): Promise<ActionResult> {
  const sb = await db();
  if (!groupId || !PERM_MODULES.includes(module) || !Number.isInteger(level) || level < 0 || level > 3) return { ok: false, error: "Dados inválidos." };
  const { error } = await sb.from("group_permissions").upsert({ group_id: groupId, module, level }, { onConflict: "group_id,module" });
  if (error) return usrErr(error);
  revalidatePath("/utilizadores");
  return { ok: true };
}

export async function deleteGroupBoard(id: string): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("permission_groups").delete().eq("id", id);
  if (error) return usrErr(error);
  revalidatePath("/utilizadores");
  return { ok: true };
}

export async function revokeSessionsBoard(userId: string): Promise<ActionResult> {
  const sb = await db();
  const { data, error } = await sb.rpc("admin_revoke_sessions", { target: userId });
  if (error) return usrErr(error);
  revalidatePath("/utilizadores");
  return { ok: true, id: String(data ?? 0) };
}

// ───────── Notificações ─────────
export async function setNoticeReadBoard(id: string, read: boolean): Promise<ActionResult> {
  if (id.startsWith("demo-")) return { ok: true };
  const sb = await db();
  const { error } = await sb.from("notifications").update({ read }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/notificacoes");
  return { ok: true };
}

export async function markAllNoticesBoard(): Promise<ActionResult> {
  const sb = await db();
  const { error } = await sb.from("notifications").update({ read: true }).eq("read", false);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/notificacoes");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ───────── Configurações do sistema ─────────
export async function saveSettingsBoard(sectionId: string, values: Record<string, string | boolean>): Promise<ActionResult> {
  const { SECTIONS } = await import("@/lib/settings");
  const sec = SECTIONS.find((s) => s.id === sectionId);
  if (!sec) return { ok: false, error: "Secção inválida." };
  const clean: Record<string, string | boolean> = {};
  for (const f of sec.groups.flatMap((g) => g.fields)) {
    const v = values[f.key];
    if (f.type === "toggle") { clean[f.key] = Boolean(v); continue; }
    const s = String(v ?? "").trim().slice(0, 300);
    if (f.required && !s) return { ok: false, error: `Preencha "${f.label}".` };
    if (f.type === "email" && s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: false, error: "Email inválido." };
    if (f.type === "number" && s && !Number.isFinite(Number(s.replace(",", ".")))) return { ok: false, error: `"${f.label}" deve ser um número.` };
    if (f.type === "select" && f.options && !f.options.some(([o]) => o === s)) { clean[f.key] = f.def as string; continue; }
    clean[f.key] = s;
  }
  const sb = await db();
  const me = await currentUser();
  const { error } = await sb.from("app_settings").upsert({ section: sectionId, value: clean, updated_at: new Date().toISOString(), updated_by: me?.id ?? null }, { onConflict: "section" });
  if (error) return error.code === "42P01" ? { ok: false, error: "Falta aplicar a migração 0020_settings.sql." } : error.code === "42501" ? { ok: false, error: "Não tem permissão para alterar as configurações." } : { ok: false, error: friendly(error) };
  revalidatePath("/configuracoes");
  return { ok: true };
}

// ───────── Importação de PDFs para as empresas ─────────
export async function importPdfsBoard(f: FormData): Promise<ActionResult> {
  const sb = await db();
  const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length === 0) return { ok: false, error: "Escolha pelo menos um PDF." };
  if (files.length > 30) return { ok: false, error: "No máximo 30 ficheiros de cada vez." };
  const category = str(f, "category") in DOC_CATS ? str(f, "category") : "empresa";
  const me = await currentUser();
  const failed: string[] = [];
  const companies = new Set<string>();
  let done = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i], companyId = str(f, `company_${i}`);
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) { failed.push(`${file.name} (sem empresa)`); continue; }
    if (!/\.pdf$/i.test(file.name)) { failed.push(`${file.name} (não é PDF)`); continue; }
    if (file.size > 10 * 1024 * 1024) { failed.push(`${file.name} (mais de 10 MB)`); continue; }
    // O conteúdo tem de ser mesmo um PDF (assinatura "%PDF-"), não basta a extensão
    const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (head !== "%PDF-") { failed.push(`${file.name} (PDF inválido)`); continue; }

    const safe = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `company/${companyId}/${Date.now()}-${i}-${safe}`;
    const { error: upErr } = await sb.storage.from("documents").upload(path, file, { contentType: "application/pdf" });
    if (upErr) { failed.push(`${file.name} (${friendly(upErr)})`); continue; }
    const row = { entity: "company", entity_id: companyId, name: file.name, path, size: file.size, created_by: me?.id };
    let { error } = await sb.from("documents").insert({ ...row, category, status: "ativo", mime: "application/pdf" });
    if (error && error.code === "42703") ({ error } = await sb.from("documents").insert(row)); // migração 0013 por aplicar
    if (error) { await sb.storage.from("documents").remove([path]); failed.push(`${file.name} (${friendly(error)})`); continue; }
    done++;
    companies.add(companyId);
  }

  revalidatePath("/documentos");
  companies.forEach((id) => revalidatePath(`/escritorios/empresa/${id}`));
  if (done === 0) return { ok: false, error: `Nenhum PDF importado: ${failed.join("; ")}.` };
  return { ok: true, id: String(done), error: failed.length ? `${done} importado(s). Falharam: ${failed.join("; ")}.` : undefined };
}
