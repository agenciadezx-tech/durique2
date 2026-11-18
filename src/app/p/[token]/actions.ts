"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok?: string; error?: string };

const msg = (e: { code?: string; message?: string } | null) =>
  e?.code === "P0001" ? e.message ?? "Não foi possível." : "Não foi possível. Tente de novo ou fale com a clínica.";

export async function portalConfirm(token: string, attendeeId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_confirm", { p_token: token, p_attendee: attendeeId });
  revalidatePath(`/p/${token}`);
  return error ? { error: msg(error) } : { ok: "Presença confirmada. Até lá!" };
}

export async function portalCancel(token: string, attendeeId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_cancel", { p_token: token, p_attendee: attendeeId });
  revalidatePath(`/p/${token}`);
  if (error) return { error: msg(error) };
  return {
    ok: data === "desmarcado_no_prazo" ? "Aula desmarcada. Você ganhou uma reposição!" : "Aula desmarcada. Como foi em cima da hora, ela conta como sessão.",
  };
}

export async function portalBook(token: string, appointmentId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_book_makeup", { p_token: token, p_appointment: appointmentId });
  revalidatePath(`/p/${token}`);
  return error ? { error: msg(error) } : { ok: "Reposição agendada!" };
}

export async function portalExercise(token: string, planId: string, pain: number | null): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_log_exercise", { p_token: token, p_plan: planId, p_pain: pain });
  revalidatePath(`/p/${token}`);
  return error ? { error: msg(error) } : { ok: "Registrado. Muito bem!" };
}

export async function portalFeedback(token: string, score: number, comment: string): Promise<Result> {
  if (!Number.isInteger(score) || score < 0 || score > 10) return { error: "Escolha uma nota de 0 a 10." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_feedback", { p_token: token, p_score: score, p_comment: comment.slice(0, 1000) });
  return error ? { error: msg(error) } : { ok: "Obrigado pela sua opinião!" };
}

export async function portalReschedule(token: string, attendeeId: string, appointmentId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_reschedule" as never, { p_token: token, p_attendee: attendeeId, p_appointment: appointmentId } as never);
  revalidatePath(`/p/${token}`);
  return error ? { error: msg(error) } : { ok: "Pronto! Sua aula foi remarcada." };
}
