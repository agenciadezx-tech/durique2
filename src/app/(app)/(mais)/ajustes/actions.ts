"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, normalizePhone, parseMoney } from "@/lib/format";
import type { ActionState } from "@/components/forms";
import { normalizePixKey } from "@/lib/pix";

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
  const review = String(data.get("review_url") ?? "").trim();
  if (review && !/^https:\/\/\S+$/.test(review)) return { error: "O link de avaliação precisa começar com https://" };
  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update({ name, review_url: review || null }).eq("id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: "Dados da clínica salvos." };
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
    color: /^#[0-9a-f]{6}$/i.test(String(data.get("color") ?? "")) ? String(data.get("color")) : null,
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
    cancel_notice_hours: String(data.get("cancel_notice_hours") ?? "").trim() === "" ? null : Math.max(0, Math.min(72, Number(data.get("cancel_notice_hours")) || 0)),
  };
  const supabase = await createClient();
  if (!id) {
    const { data: row, error } = await supabase.from("services").insert({ ...values, clinic_id: ctx.clinicId }).select("id").single();
    if (error) return { error: friendlyError(error) };
    revalidatePath("/ajustes");
    revalidatePath("/catalogo");
    if (data.get("goto") === "catalogo") redirect(`/catalogo?s=${row.id}&novo=1`);
    return { ok: `${name} foi adicionado.` };
  }
  const { error } = await supabase.from("services").update(values).eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes");
  revalidatePath("/catalogo");
  return { ok: "Serviço atualizado." };
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
  revalidatePath("/catalogo");
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
  revalidatePath("/catalogo");
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

export async function saveRules(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const hours = Number(data.get("cancel_notice_hours"));
  const days = Number(data.get("makeup_validity_days"));
  if (!(hours >= 0 && hours <= 72)) return { error: "Antecedência deve ser entre 0 e 72 horas." };
  if (!(days >= 1 && days <= 365)) return { error: "Validade da reposição deve ser entre 1 e 365 dias." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_settings")
    .update({ cancel_notice_hours: hours, makeup_validity_days: days, updated_at: new Date().toISOString() })
    .eq("clinic_id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes");
  return { ok: "Regras salvas." };
}

export async function createInvite(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const role = String(data.get("role") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Informe um e-mail válido." };
  if (!["admin", "recepcao", "profissional", "financeiro"].includes(role)) return { error: "Escolha o papel." };
  const supabase = await createClient();
  const { error } = await supabase.from("invites").insert({
    clinic_id: ctx.clinicId,
    email,
    role: role as "admin",
    professional_id: role === "profissional" ? String(data.get("professional_id") ?? "") || null : null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes");
  return { ok: "Convite criado. Envie o link abaixo para a pessoa." };
}

export async function revokeInvite(data: FormData) {
  if (!(await adminCtx())) return;
  const supabase = await createClient();
  await supabase.from("invites").update({ revoked: true }).eq("id", String(data.get("id")));
  revalidatePath("/ajustes");
}

export async function setMemberActive(data: FormData) {
  const ctx = await adminCtx();
  if (!ctx) return;
  const supabase = await createClient();
  await supabase
    .from("members")
    .update({ active: data.get("active") === "true" })
    .eq("id", String(data.get("id")))
    .neq("user_id", ctx.userId);
  revalidatePath("/ajustes");
}

export async function savePix(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const type = String(data.get("pix_key_type") ?? "");
  const raw = String(data.get("pix_key") ?? "").trim();
  const name = String(data.get("pix_name") ?? "").trim();
  const city = String(data.get("pix_city") ?? "").trim();
  const supabase = await createClient();
  if (!raw) {
    const { error } = await supabase
      .from("clinic_settings")
      .update({ pix_key_type: null, pix_key: null, pix_name: null, pix_city: null })
      .eq("clinic_id", ctx.clinicId);
    if (error) return { error: friendlyError(error) };
    revalidatePath("/", "layout");
    return { ok: "Chave Pix removida." };
  }
  const key = normalizePixKey(type, raw);
  if (!key) return { error: "Chave Pix inválida para o tipo escolhido. Confira os números." };
  if (name.length < 3) return { error: "Informe o nome de quem recebe (como está no banco)." };
  const { error } = await supabase
    .from("clinic_settings")
    .update({ pix_key_type: type, pix_key: key, pix_name: name.slice(0, 25), pix_city: (city || "BRASIL").slice(0, 15) })
    .eq("clinic_id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: "Chave Pix salva. As cobranças já saem com o Pix copia e cola." };
}

export async function saveApps(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await adminCtx();
  if (!ctx) return NOT_ADMIN;
  const read = (k: "wellhub" | "totalpass") => {
    const raw = String(data.get(`${k}_value`) ?? "").trim();
    const value = raw ? parseMoney(raw) : null;
    return {
      enabled: data.get(`${k}_enabled`) === "on",
      id: String(data.get(`${k}_id`) ?? "").trim().slice(0, 40) || null,
      value,
      bad: !!raw && value == null,
    };
  };
  const w = read("wellhub");
  const t = read("totalpass");
  if (w.bad || t.bad) return { error: "Valor por check-in inválido. Ex.: 18,50" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinic_settings")
    .update({
      wellhub_enabled: w.enabled,
      wellhub_gym_id: w.id,
      wellhub_value_cents: w.value,
      totalpass_enabled: t.enabled,
      totalpass_id: t.id,
      totalpass_value_cents: t.value,
    })
    .eq("clinic_id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: "Configuração salva." };
}

/** Feriado / dia fechado: bloqueia a clínica toda no dia (não aparece no agendamento online). */
export async function setClosedDay(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const date = String(data.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const supabase = await createClient();
  const from = `${date}T00:00:00-03:00`;
  const to = `${date}T23:59:00-03:00`;
  if (data.get("open") === "1") {
    await supabase.from("time_blocks").delete().eq("clinic_id", ctx.clinicId).is("professional_id", null).eq("starts_at", new Date(from).toISOString());
  } else {
    await supabase.from("time_blocks").insert({
      clinic_id: ctx.clinicId,
      professional_id: null,
      starts_at: from,
      ends_at: to,
      reason: String(data.get("reason") ?? "Feriado").trim().slice(0, 120) || "Feriado",
    });
  }
  revalidatePath("/ajustes/feriados");
  revalidatePath("/agenda");
}

/** Muda a função de alguém da equipe (só admin; ninguém muda a própria função). */
export async function setMemberRole(data: FormData) {
  const ctx = await adminCtx();
  if (!ctx) return;
  const role = String(data.get("role") ?? "");
  if (!["admin", "recepcao", "profissional", "financeiro"].includes(role)) return;
  const supabase = await createClient();
  await supabase
    .from("members")
    .update({ role: role as "admin" })
    .eq("id", String(data.get("id")))
    .eq("clinic_id", ctx.clinicId)
    .neq("user_id", ctx.userId);
  revalidatePath("/equipe");
  revalidatePath("/ajustes", "layout");
}
