"use server";

import { resolvePatient } from "@/lib/quick-patient";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { addDaysISO, friendlyError, todayISO } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const NO_PERM = { error: "Você não tem permissão para alterar horários." };

export async function createSeries(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return NO_PERM;

  const serviceId = String(data.get("service_id") ?? "");
  const professionalId = String(data.get("professional_id") ?? "");
  const weekdays = data.getAll("weekday").map(Number).filter((n) => n >= 1 && n <= 7);
  const time = String(data.get("start_time") ?? "");
  const startsOn = String(data.get("starts_on") ?? "") || todayISO();
  const name = String(data.get("name") ?? "").trim().slice(0, 60) || null;
  if (!serviceId) return { error: "Escolha o serviço." };
  if (!professionalId) return { error: "Escolha o profissional." };
  if (!weekdays.length) return { error: "Marque pelo menos um dia da semana." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Informe o horário." };

  const supabase = await createClient();
  const { data: service } = await supabase.from("services").select("duration_min, default_capacity, kind").eq("id", serviceId).single();
  if (!service) return { error: "Serviço não encontrado." };
  const capacity = service.kind === "turma" ? Math.max(1, Number(data.get("capacity")) || service.default_capacity) : 1;
  const duration = Number(data.get("duration_min")) || service.duration_min;

  const { data: created, error } = await supabase
    .from("recurring_series")
    .insert(
      weekdays.map((weekday) => ({
        clinic_id: ctx.clinicId,
        unit_id: ctx.unitId,
        service_id: serviceId,
        professional_id: professionalId,
        weekday,
        name,
        start_time: time,
        duration_min: duration,
        capacity,
        starts_on: startsOn,
      })),
    )
    .select("id");
  if (error || !created) return { error: friendlyError(error) };

  for (const s of created) {
    await supabase.rpc("generate_series_occurrences", { p_series: s.id, p_until: addDaysISO(todayISO(), 56) });
  }
  revalidatePath("/horarios");
  revalidatePath("/agenda");
  redirect(created.length === 1 ? `/horarios/${created[0].id}?novo=1` : "/horarios?criados=" + created.length);
}

export async function enroll(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return NO_PERM;
  const seriesId = String(data.get("series_id"));
  const supabase = await createClient();
  const who = await resolvePatient(supabase, ctx.clinicId, data);
  if (who.error) return { error: who.error };
  const patientId = who.id;
  if (!patientId) return { error: "Escolha um paciente ou cadastre um novo." };
  const { error } = await supabase.rpc("enroll_patient", { p_series: seriesId, p_patient: patientId });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/horarios/${seriesId}`);
  revalidatePath("/horarios");
  revalidatePath("/agenda");
  return { ok: who.created ? "Paciente novo cadastrado e colocado na turma." : "Paciente adicionado. Ele já aparece nas próximas sessões." };
}

export async function unenroll(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const supabase = await createClient();
  await supabase.rpc("end_enrollment", { p_enrollment: String(data.get("enrollment_id")) });
  const seriesId = String(data.get("series_id"));
  revalidatePath(`/horarios/${seriesId}`);
  revalidatePath("/horarios");
  revalidatePath("/agenda");
}

export async function endSeries(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const supabase = await createClient();
  await supabase.rpc("end_series", { p_series: String(data.get("series_id")) });
  revalidatePath("/horarios");
  revalidatePath("/agenda");
  redirect("/horarios?encerrado=1");
}

/** Dá (ou troca) o nome da turma. */
export async function renameSeries(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return NO_PERM;
  const id = String(data.get("id"));
  const name = String(data.get("name") ?? "").trim().slice(0, 60) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_series").update({ name }).eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/horarios", "layout");
  revalidatePath("/agenda");
  return { ok: name ? "Nome salvo." : "Nome removido." };
}
