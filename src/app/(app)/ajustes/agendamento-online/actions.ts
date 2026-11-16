"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, normalizePhone } from "@/lib/format";
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

export async function saveIdentity(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return NOT_ADMIN;
  const color = String(data.get("color") ?? "");
  const waRaw = String(data.get("whatsapp") ?? "").trim();
  const wa = waRaw ? normalizePhone(waRaw) : null;
  if (waRaw && !wa) return { error: "WhatsApp inválido. Use DDD + número." };
  const ig = String(data.get("instagram") ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) return { error: "Instagram inválido. Ex.: @suaclinica" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      brand_color: /^#[0-9a-f]{6}$/i.test(color) ? color : null,
      contact_whatsapp: wa,
      instagram: ig || null,
      address: String(data.get("address") ?? "").trim().slice(0, 200) || null,
      show_prices: data.get("show_prices") === "on",
      waitlist_public: data.get("waitlist_public") === "on",
    })
    .eq("id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath(PATH);
  return { ok: "Aparência e contato salvos." };
}
