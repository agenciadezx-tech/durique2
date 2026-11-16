"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/forms";

export async function acceptInvite(_: ActionState, data: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: String(data.get("token")) });
  if (error) return { error: error.code === "P0001" ? error.message : "Não foi possível aceitar o convite." };
  redirect("/agenda?bemvindo=equipe");
}
