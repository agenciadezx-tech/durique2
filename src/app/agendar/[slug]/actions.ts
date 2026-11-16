"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/format";

export type Slot = { professional_id: string; professional_name: string; starts_at: string };
export type ClassSlot = { appointment_id: string; starts_at: string; professional_name: string; free: number };
type Result = { ok?: string; error?: string };

const msg = (e: { code?: string; message?: string } | null) =>
  e?.code === "P0001" ? (e.message ?? "Não foi possível.") : "Não foi possível agendar. Tente de novo ou fale com a clínica.";

export async function loadSlots(slug: string, serviceId: string, day: string): Promise<Slot[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_slots", { p_slug: slug, p_service: serviceId, p_day: day });
  return (data as Slot[] | null) ?? [];
}

export async function loadClasses(slug: string, serviceId: string): Promise<ClassSlot[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_classes", { p_slug: slug, p_service: serviceId });
  return (data as ClassSlot[] | null) ?? [];
}

export async function book(
  slug: string,
  pick: { serviceId: string; professionalId?: string; startsAt?: string; appointmentId?: string },
  name: string,
  phoneRaw: string,
): Promise<Result> {
  const phone = normalizePhone(phoneRaw);
  if (name.trim().length < 3) return { error: "Informe seu nome completo." };
  if (!phone) return { error: "Informe seu WhatsApp com DDD." };
  const supabase = await createClient();
  const { error } = pick.appointmentId
    ? await supabase.rpc("booking_book_class", { p_slug: slug, p_appointment: pick.appointmentId, p_name: name, p_phone: phone })
    : await supabase.rpc("booking_book", {
        p_slug: slug,
        p_service: pick.serviceId,
        p_professional: pick.professionalId,
        p_starts_at: pick.startsAt,
        p_name: name,
        p_phone: phone,
      });
  return error ? { error: msg(error) } : { ok: "Agendado!" };
}
