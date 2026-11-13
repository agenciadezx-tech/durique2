"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, toTimestamp } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const NO_PERM = { error: "Você não tem permissão para alterar a agenda." };
const HOURS_NOTICE = 12; // antecedência mínima para desmarcar sem perder a sessão (configurável na fase 3)

/** Veio / Faltou / Desmarcou / Voltar. "Desmarcou" decide sozinho se foi no prazo. */
export async function setAttendeeStatus(data: FormData) {
  await getContext();
  const id = String(data.get("id"));
  const appointmentId = String(data.get("appointment_id"));
  let status = String(data.get("status"));
  const supabase = await createClient();

  if (status === "desmarcou") {
    const { data: appt } = await supabase.from("appointments").select("starts_at").eq("id", appointmentId).single();
    const hoursBefore = appt ? (new Date(appt.starts_at).getTime() - Date.now()) / 36e5 : 0;
    status = hoursBefore >= HOURS_NOTICE ? "desmarcado_no_prazo" : "desmarcado_fora_prazo";
  }
  const allowed = ["agendado", "confirmado", "presente", "falta", "desmarcado_no_prazo", "desmarcado_fora_prazo"];
  if (!allowed.includes(status)) return;

  await supabase
    .from("appointment_attendees")
    .update({ status: status as "agendado" })
    .eq("id", id);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda");
}

export async function addAttendee(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return NO_PERM;
  const appointmentId = String(data.get("appointment_id"));
  const patientId = String(data.get("patient_id") ?? "");
  if (!patientId) return { error: "Escolha um paciente." };
  const supabase = await createClient();
  const { error } = await supabase.from("appointment_attendees").insert({
    clinic_id: ctx.clinicId,
    appointment_id: appointmentId,
    patient_id: patientId,
    is_makeup: data.get("is_makeup") === "on",
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda");
  return { ok: "Paciente adicionado à sessão." };
}

export async function removeAttendee(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const appointmentId = String(data.get("appointment_id"));
  const supabase = await createClient();
  await supabase.from("appointment_attendees").delete().eq("id", String(data.get("id"))).is("enrollment_id", null);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda");
}

export async function cancelAppointment(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const id = String(data.get("id"));
  const supabase = await createClient();
  await supabase.from("appointments").update({ status: "cancelado" }).eq("id", id);
  revalidatePath("/agenda");
  revalidatePath(`/agenda/${id}`);
}

export async function restoreAppointment(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const id = String(data.get("id"));
  const supabase = await createClient();
  await supabase.from("appointments").update({ status: "agendado" }).eq("id", id);
  revalidatePath("/agenda");
  revalidatePath(`/agenda/${id}`);
}

export async function createAppointment(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return NO_PERM;
  const serviceId = String(data.get("service_id") ?? "");
  const professionalId = String(data.get("professional_id") ?? "");
  const date = String(data.get("date") ?? "");
  const time = String(data.get("time") ?? "");
  const patientId = String(data.get("patient_id") ?? "");
  if (!serviceId || !professionalId) return { error: "Escolha o serviço e o profissional." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Informe dia e horário." };

  const supabase = await createClient();
  const { data: service } = await supabase.from("services").select("duration_min, default_capacity, kind").eq("id", serviceId).single();
  if (!service) return { error: "Serviço não encontrado." };
  const duration = Number(data.get("duration_min")) || service.duration_min;
  const startsAt = toTimestamp(date, time);
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();

  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: ctx.clinicId,
      unit_id: ctx.unitId,
      service_id: serviceId,
      professional_id: professionalId,
      starts_at: startsAt,
      ends_at: endsAt,
      capacity: service.kind === "turma" ? service.default_capacity : 1,
    })
    .select("id")
    .single();
  if (error || !appt) return { error: friendlyError(error) };

  if (patientId) {
    const { error: e2 } = await supabase
      .from("appointment_attendees")
      .insert({ clinic_id: ctx.clinicId, appointment_id: appt.id, patient_id: patientId });
    if (e2) return { error: friendlyError(e2) };
  }
  revalidatePath("/agenda");
  redirect(`/agenda/${appt.id}?nova=1`);
}
