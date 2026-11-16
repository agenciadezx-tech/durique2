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
