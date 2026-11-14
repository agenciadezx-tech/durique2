"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, normalizePhone, parseMoney } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const NOT_ADMIN = { error: "Somente o administrador pode alterar isso." };

async function adminCtx() {
  const ctx = await getContext();
  return ctx.isAdmin ? ctx : null;
}

export async function renameClinic(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const name = String(data.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome." };
  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update({ name }).eq("id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: "Nome atualizado." };
}

export async function saveProfessional(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const id = String(data.get("id") ?? "");
  const name = String(data.get("name") ?? "").trim();
  const phoneRaw = String(data.get("phone") ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  if (!name) return { error: "Informe o nome do profissional." };
  if (phoneRaw && !phone) return { error: "Telefone inválido. Use DDD + número." };
  const supabase = await createClient();
  const ckind = String(data.get("commission_kind") ?? "none");
  const cval = String(data.get("commission_value") ?? "").trim();
  let commission_percent: number | null = null;
  let commission_fixed_cents: number | null = null;
  if (ckind === "percent" && cval) {
    commission_percent = Number(cval.replace(",", "."));
    if (!(commission_percent >= 0 && commission_percent <= 100)) return { error: "Comissão em % deve ser entre 0 e 100." };
  } else if (ckind === "fixed" && cval) {
    commission_fixed_cents = parseMoney(cval);
    if (commission_fixed_cents == null) return { error: "Valor da comissão inválido." };
  }
  const values = {
    name,
    phone,
    email: String(data.get("email") ?? "").trim() || null,
    crefito: String(data.get("crefito") ?? "").trim() || null,
    commission_percent,
    commission_fixed_cents,
  };
  const { error } = id
    ? await supabase.from("professionals").update(values).eq("id", id)
    : await supabase.from("professionals").insert({ ...values, clinic_id: ctx.clinicId });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes");
  return { ok: id ? "Profissional atualizado." : `${name} foi adicionado(a).` };
}

export async function saveService(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const id = String(data.get("id") ?? "");
  const name = String(data.get("name") ?? "").trim();
  const kind = data.get("kind") === "turma" ? "turma" : "individual";
  const duration = Number(data.get("duration_min"));
  const capacity = kind === "turma" ? Number(data.get("default_capacity")) : 1;
  if (!name) return { error: "Informe o nome do serviço." };
  if (!duration || duration < 5 || duration > 480) return { error: "Duração deve ser entre 5 e 480 minutos." };
  if (!capacity || capacity < 1 || capacity > 50) return { error: "Vagas da turma devem ser entre 1 e 50." };
  const values = {
    name,
    kind: kind as "turma" | "individual",
    duration_min: duration,
    default_capacity: capacity,
    price_cents: parseMoney(String(data.get("price") ?? "")),
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("services").update(values).eq("id", id)
    : await supabase.from("services").insert({ ...values, clinic_id: ctx.clinicId });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes");
  return { ok: id ? "Serviço atualizado." : `${name} foi adicionado.` };
}

export async function toggleActive(data: FormData) {
  if (!(await adminCtx())) return;
  const t = String(data.get("table"));
  const table = t === "services" ? "services" : t === "products" ? "products" : "professionals";
  const supabase = await createClient();
  await supabase
    .from(table)
    .update({ active: data.get("active") === "true" })
    .eq("id", String(data.get("id")));
  revalidatePath("/ajustes");
}

export async function saveProduct(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const id = String(data.get("id") ?? "");
  const name = String(data.get("name") ?? "").trim();
  const kind = data.get("kind") === "plano" ? "plano" : "pacote";
  const price = parseMoney(String(data.get("price") ?? ""));
  const sessions = Number(data.get("sessions")) || null;
  const validity = Number(data.get("validity_days")) || null;
  const perWeek = Number(data.get("sessions_per_week")) || null;
  if (!name) return { error: "Informe o nome." };
  if (price == null) return { error: kind === "plano" ? "Informe o valor da mensalidade." : "Informe o valor do pacote." };
  if (kind === "pacote" && !sessions) return { error: "Informe quantas sessões tem o pacote." };
  if (kind === "plano" && !perWeek) return { error: "Informe quantas vezes por semana." };
  const values = {
    name,
    kind: kind as "pacote" | "plano",
    price_cents: price,
    service_id: String(data.get("service_id") ?? "") || null,
    sessions: kind === "pacote" ? sessions : null,
    validity_days: kind === "pacote" ? validity : null,
    sessions_per_week: kind === "plano" ? perWeek : null,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("products").update(values).eq("id", id)
    : await supabase.from("products").insert({ ...values, clinic_id: ctx.clinicId });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes");
  return { ok: id ? "Atualizado." : `${name} foi adicionado.` };
}

export async function saveDocTemplate(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const id = String(data.get("id") ?? "");
  const name = String(data.get("name") ?? "").trim();
  const body = String(data.get("body") ?? "").trim();
  if (!name || body.length < 20) return { error: "Preencha o nome e o texto do documento." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("document_templates").update({ name, body }).eq("id", id)
    : await supabase.from("document_templates").insert({ clinic_id: ctx.clinicId, name, body });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes");
  return { ok: id ? "Modelo atualizado." : "Modelo criado." };
}
