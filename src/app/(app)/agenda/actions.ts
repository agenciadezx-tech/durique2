"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, toTimestamp } from "@/lib/format";
import { formatTime } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const NO_PERM = { error: "Você não tem permissão para alterar a agenda." };

/** Veio / Faltou / Desmarcou / Voltar. "Desmarcou" decide sozinho se foi no prazo. */
export async function setAttendeeStatus(data: FormData) {
  await getContext();
  const id = String(data.get("id"));
  const appointmentId = String(data.get("appointment_id"));
  let status = String(data.get("status"));
  const supabase = await createClient();

  if (status === "desmarcou") {
    const { data: appt } = await supabase.from("appointments").select("starts_at, clinic_id, services(cancel_notice_hours)").eq("id", appointmentId).single();
    const { data: rules } = appt
      ? await supabase.from("clinic_settings").select("cancel_notice_hours").eq("clinic_id", appt.clinic_id).maybeSingle()
      : { data: null };
    const own = (appt?.services as unknown as { cancel_notice_hours: number | null } | null)?.cancel_notice_hours;
    const notice = own ?? rules?.cancel_notice_hours ?? 12;
    const hoursBefore = appt ? (new Date(appt.starts_at).getTime() - Date.now()) / 36e5 : 0;
    status = hoursBefore >= notice ? "desmarcado_no_prazo" : "desmarcado_fora_prazo";
  }
  const allowed = ["agendado", "confirmado", "presente", "falta", "desmarcado_no_prazo", "desmarcado_fora_prazo"];
  if (!allowed.includes(status)) return;

  await supabase
    .from("appointment_attendees")
    .update({ status: status as "agendado" })
    .eq("id", id);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda");
  revalidatePath("/horarios");
}

/** Chamada rápida: quem ainda está como agendado/confirmado vira "Veio". */
export async function markAllPresent(data: FormData) {
  await getContext();
  const appointmentId = String(data.get("appointment_id"));
  const supabase = await createClient();
  await supabase
    .from("appointment_attendees")
    .update({ status: "presente" })
    .eq("appointment_id", appointmentId)
    .in("status", ["agendado", "confirmado"]);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda");
  revalidatePath("/horarios");
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
  const id = String(data.get("id"));
  await supabase.rpc("release_makeup_credit", { p_attendee: id }); // devolve o crédito se era reposição
  await supabase.from("appointment_attendees").delete().eq("id", id).is("enrollment_id", null);
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

export async function addToWaitlist(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return NO_PERM;
  const appointmentId = String(data.get("appointment_id"));
  const patientId = String(data.get("patient_id") ?? "");
  if (!patientId) return { error: "Escolha um paciente." };
  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({
    clinic_id: ctx.clinicId,
    patient_id: patientId,
    appointment_id: appointmentId,
    notes: String(data.get("notes") ?? "").trim() || null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/agenda/${appointmentId}`);
  return { ok: "Paciente na lista de espera. Avisamos aqui quando abrir vaga." };
}

/** Encaixa quem estava na lista de espera (entra como reposição se tiver crédito). */
export async function fitFromWaitlist(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const id = String(data.get("id"));
  const appointmentId = String(data.get("appointment_id"));
  const supabase = await createClient();
  const { data: w } = await supabase.from("waitlist").select("patient_id").eq("id", id).single();
  if (!w) return;
  const { count } = await supabase
    .from("makeup_credits")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", w.patient_id)
    .eq("status", "disponivel")
    .gte("expires_on", new Date().toISOString().slice(0, 10));
  const { error } = await supabase.from("appointment_attendees").insert({
    clinic_id: ctx.clinicId,
    appointment_id: appointmentId,
    patient_id: w.patient_id,
    is_makeup: (count ?? 0) > 0,
  });
  if (!error) await supabase.from("waitlist").update({ status: "encaixado" }).eq("id", id);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda");
}

export async function cancelWaitlist(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const supabase = await createClient();
  await supabase.from("waitlist").update({ status: "cancelado" }).eq("id", String(data.get("id")));
  revalidatePath(`/agenda/${String(data.get("appointment_id"))}`);
}

export async function createBlock(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const date = String(data.get("date") ?? "");
  const allDay = data.get("all_day") === "on";
  const from = allDay ? "00:00" : String(data.get("from") ?? "");
  const to = allDay ? "23:59" : String(data.get("to") ?? "");
  const pro = String(data.get("professional_id") ?? "") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Escolha o dia." };
  if (!from || !to || to <= from) return { error: "O horário final precisa ser depois do inicial." };
  if (!pro && !ctx.canManageAgenda) return { error: "Escolha o profissional." };
  const supabase = await createClient();
  const { error } = await supabase.from("time_blocks").insert({
    clinic_id: ctx.clinicId,
    professional_id: pro,
    starts_at: toTimestamp(date, from),
    ends_at: toTimestamp(date, to),
    reason: String(data.get("reason") ?? "").trim().slice(0, 120) || null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/agenda");
  redirect(`/agenda?d=${date}`);
}

export async function removeBlock(data: FormData) {
  const supabase = await createClient();
  await supabase.from("time_blocks").delete().eq("id", String(data.get("id")));
  revalidatePath("/agenda");
}

/** Corrige dia/horário de uma sessão (mantém a duração). */
export type MoveResult = { ok?: string; error?: string; notify?: number };

/**
 * Muda uma sessão de dia/horário (só esta; a turma fixa continua igual nas outras semanas).
 * Confere conflito do profissional e dia fechado, guarda o histórico para avisar os alunos.
 */
export async function moveAppointment(id: string, date: string, time: string): Promise<MoveResult> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Só a recepção ou o administrador muda aulas de dia." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Escolha o dia e o horário." };
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at, status, professional_id, professionals(name), appointment_attendees(status)")
    .eq("id", id)
    .single();
  if (!a) return { error: "Sessão não encontrada." };
  if (a.status !== "agendado") return { error: "Esta sessão foi cancelada." };
  const dur = Date.parse(a.ends_at) - Date.parse(a.starts_at);
  const start = new Date(toTimestamp(date, time));
  const end = new Date(start.getTime() + dur);
  if (start.getTime() === Date.parse(a.starts_at)) return { ok: "Nada mudou." };

  const [{ data: clash }, { data: blocks }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, services(name), recurring_series(name)")
      .eq("clinic_id", ctx.clinicId)
      .eq("professional_id", a.professional_id)
      .eq("status", "agendado")
      .neq("id", id)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1),
    supabase
      .from("time_blocks")
      .select("reason, professional_id")
      .eq("clinic_id", ctx.clinicId)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString()),
  ]);
  const pro = (a.professionals as unknown as { name: string } | null)?.name ?? "O profissional";
  if (clash?.length) {
    const c = clash[0] as unknown as { starts_at: string; services: { name: string } | null; recurring_series: { name: string | null } | null };
    return { error: `${pro} já tem ${c.recurring_series?.name ?? c.services?.name ?? "outra sessão"} às ${formatTime(c.starts_at)} nesse dia. Escolha outro horário.` };
  }
  const block = (blocks ?? []).find((b) => !b.professional_id || b.professional_id === a.professional_id);
  if (block) return { error: `Esse horário está bloqueado${block.reason ? ` (${block.reason})` : ""}.` };

  const { error } = await supabase.from("appointments").update({ starts_at: start.toISOString(), ends_at: end.toISOString() }).eq("id", id);
  if (error) return { error: friendlyError(error) };
  await supabase.from("appointment_changes").insert({ clinic_id: ctx.clinicId, appointment_id: id, old_starts_at: a.starts_at, new_starts_at: start.toISOString() });
  const notify = (a.appointment_attendees as { status: string }[]).filter((t) => t.status === "agendado" || t.status === "confirmado").length;
  revalidatePath("/agenda", "layout");
  revalidatePath("/horarios", "layout");
  revalidatePath("/whatsapp");
  return { ok: "Mudou!", notify };
}

export async function rescheduleAppointment(_: ActionState, data: FormData): Promise<ActionState> {
  const r = await moveAppointment(String(data.get("id")), String(data.get("date") ?? ""), String(data.get("time") ?? ""));
  return r.error ? { error: r.error } : { ok: "Data mudada." };
}
