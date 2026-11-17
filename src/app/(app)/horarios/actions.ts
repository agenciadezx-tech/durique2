"use server";

import { durationFor, resolvePatient } from "@/lib/quick-patient";

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
  const startsOn = String(data.get("starts_on") ?? "") || todayISO();
  const name = String(data.get("name") ?? "").trim().slice(0, 60) || null;
  if (!serviceId) return { error: "Escolha o serviço." };
  if (!professionalId) return { error: "Escolha o professor." };

  const supabase = await createClient();
  const { data: service } = await supabase.from("services").select("duration_min, default_capacity, kind").eq("id", serviceId).single();
  if (!service) return { error: "Serviço não encontrado." };
  const capacity = Math.max(1, Math.min(60, Number(data.get("capacity")) || service.default_capacity || 1));
  const fallback = Number(data.get("duration_min")) || (await durationFor(supabase, professionalId, serviceId, service.duration_min));

  // Grade de horários: cada "slot" = dia|início|fim. (Formato antigo: weekday[] + start_time.)
  type Slot = { weekday: number; time: string; duration: number };
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let slots: Slot[] = data
    .getAll("slot")
    .map(String)
    .map((v) => {
      const [d, ini, fim] = v.split("|");
      const dur = /^\d{2}:\d{2}$/.test(fim ?? "") ? mins(fim) - mins(ini) : fallback;
      return { weekday: Number(d), time: ini, duration: dur };
    })
    .filter((x) => x.weekday >= 1 && x.weekday <= 7 && /^\d{2}:\d{2}$/.test(x.time));
  if (!slots.length) {
    const time = String(data.get("start_time") ?? "");
    slots = data
      .getAll("weekday")
      .map(Number)
      .filter((n) => n >= 1 && n <= 7)
      .map((weekday) => ({ weekday, time, duration: fallback }));
  }
  if (!slots.length) return { error: "Marque pelo menos um dia na grade de horários." };
  if (slots.some((x) => !/^\d{2}:\d{2}$/.test(x.time))) return { error: "Informe o horário." };
  if (slots.some((x) => x.duration < 10 || x.duration > 300)) return { error: "O horário final precisa ser depois do inicial (entre 10 minutos e 5 horas)." };

  const { data: created, error } = await supabase
    .from("recurring_series")
    .insert(
      slots.map((x) => ({
        clinic_id: ctx.clinicId,
        unit_id: ctx.unitId,
        service_id: serviceId,
        professional_id: professionalId,
        weekday: x.weekday,
        name,
        start_time: x.time,
        duration_min: x.duration,
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

/** Nova matrícula a partir de Turmas: acha/cadastra o aluno e abre os passos de plano e turma. */
export async function startEnrollment(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return NO_PERM;
  const supabase = await createClient();
  const who = await resolvePatient(supabase, ctx.clinicId, data);
  if (who.error) return { error: who.error };
  if (!who.id) return { error: "Escolha o aluno ou cadastre um novo." };
  redirect(`/pacientes/${who.id}/vender?tipo=plano`);
}
