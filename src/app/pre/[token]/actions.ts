"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitPre(token: string, answers: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_pre_assessment", { p_token: token, p_answers: answers });
  if (error) return { error: error.code === "P0001" ? error.message : "Não foi possível enviar. Tente de novo." };
  return { ok: true };
}
