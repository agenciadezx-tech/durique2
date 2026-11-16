"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const NOT_ADMIN = { error: "Somente o administrador pode alterar isso." };
const PATH = "/ajustes/agendamento-online";

export async function saveBooking(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return NOT_ADMIN;
  const slug = String(data.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const enabled = data.get("enabled") === "on";
  if (enabled && !/^[a-z0-9-]{3,40}$/.test(slug)) return { error: "O endereço precisa ter de 3 a 40 letras ou números." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      booking_slug: slug || null,
      booking_enabled: enabled,
      booking_message: String(data.get("message") ?? "").trim() || null,
    })
    .eq("id", ctx.clinicId);
  if (error) return { error: error.code === "23505" ? "Esse endereço já está em uso por outra clínica. Escolha outro." : friendlyError(error) };
  const bookable = new Set(data.getAll("bookable").map(String));
  const { data: services } = await supabase.from("services").select("id, bookable").eq("clinic_id", ctx.clinicId);
  for (const s of services ?? []) {
    const want = bookable.has(s.id);
    if (want !== s.bookable) await supabase.from("services").update({ bookable: want }).eq("id", s.id);
  }
  revalidatePath(PATH);
  return { ok: enabled ? "Agendamento online ligado." : "Configurações salvas." };
}

export async function addAvailability(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return NOT_ADMIN;
  const professional_id = String(data.get("professional_id") ?? "");
  const days = data.getAll("weekday").map(Number).filter((d) => d >= 1 && d <= 7);
  const start_time = String(data.get("start_time") ?? "");
  const end_time = String(data.get("end_time") ?? "");
  if (!professional_id) return { error: "Escolha o profissional." };
  if (!days.length) return { error: "Marque pelo menos um dia da semana." };
  if (!start_time || !end_time || end_time <= start_time) return { error: "O horário final precisa ser depois do inicial." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("availability")
    .insert(days.map((weekday) => ({ clinic_id: ctx.clinicId, professional_id, weekday, start_time, end_time })));
  if (error) return { error: friendlyError(error) };
  revalidatePath(PATH);
  return { ok: "Horário de atendimento adicionado." };
}

export async function removeAvailability(data: FormData) {
  const ctx = await getContext();
  if (!ctx.isAdmin) return;
  const supabase = await createClient();
  await supabase.from("availability").delete().eq("id", String(data.get("id"))).eq("clinic_id", ctx.clinicId);
  revalidatePath(PATH);
}
