"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError } from "@/lib/format";
import type { ActionState } from "@/components/forms";

export async function createPlan(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) return { error: "Somente administrador e profissionais podem passar exercícios." };
  const patientId = String(data.get("patient_id") ?? "");
  const ids = data.getAll("exercise_id").map(String).filter(Boolean);
  if (!ids.length) return { error: "Marque pelo menos um exercício." };
  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("exercise_plans")
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: patientId,
      professional_id: ctx.professionalId,
      title: String(data.get("title") ?? "").trim() || "Exercícios para casa",
      frequency: String(data.get("frequency") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error || !plan) return { error: friendlyError(error) };
  const { error: e2 } = await supabase.from("exercise_plan_items").insert(
    ids.map((exercise_id, position) => ({
      clinic_id: ctx.clinicId,
      plan_id: plan.id,
      exercise_id,
      position,
      sets: String(data.get(`sets_${exercise_id}`) ?? "").trim() || null,
    })),
  );
  if (e2) return { error: friendlyError(e2) };
  revalidatePath(`/pacientes/${patientId}/exercicios`);
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: "Exercícios enviados para o link do paciente." };
}

export async function endPlan(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) return;
  const patientId = String(data.get("patient_id"));
  const supabase = await createClient();
  await supabase.from("exercise_plans").update({ active: false }).eq("id", String(data.get("id")));
  revalidatePath(`/pacientes/${patientId}/exercicios`);
  revalidatePath(`/pacientes/${patientId}`);
}
