"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError } from "@/lib/format";
import type { ActionState } from "@/components/forms";

export async function saveOcupacao(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) return { error: "Sem permissão." };
  const code = String(data.get("ocupacao") ?? "").replace(/\D/g, "");
  if (!/^\d{3}$/.test(code)) return { error: "O código de ocupação tem 3 números." };
  const supabase = await createClient();
  const { error } = await supabase.from("clinic_settings").update({ carne_leao_ocupacao: code }).eq("clinic_id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/financeiro/carne-leao");
  return { ok: "Código salvo." };
}
