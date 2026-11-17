"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/format";
import type { ActionState } from "@/components/forms";

export async function createClinic(_: ActionState, data: FormData): Promise<ActionState> {
  const name = String(data.get("name") ?? "").trim();
  const professional = String(data.get("professional") ?? "").trim();
  if (!name) return { error: "Informe o nome da clínica." };

  const supabase = await createClient();
  const { data: clinicId, error } = await supabase.rpc("create_clinic", { p_name: name });
  if (error) return { error: friendlyError(error) };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", user!.id)
    .single();

  if (professional) {
    await supabase
      .from("professionals")
      .insert({ clinic_id: clinicId, name: professional, member_id: member?.id ?? null, email: user!.email });
  }

  redirect("/configurar?passo=1");
}
