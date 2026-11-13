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
  const values = { name, phone, email: String(data.get("email") ?? "").trim() || null };
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
  const table = data.get("table") === "services" ? "services" : "professionals";
  const supabase = await createClient();
  await supabase
    .from(table)
    .update({ active: data.get("active") === "true" })
    .eq("id", String(data.get("id")));
  revalidatePath("/ajustes");
}
