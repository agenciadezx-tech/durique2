"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError } from "@/lib/format";
import { safeUrl } from "@/lib/video";
import type { ActionState } from "@/components/forms";

export async function saveExercise(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) return { error: "Somente administrador e profissionais podem alterar exercícios." };
  const id = String(data.get("id") ?? "");
  const name = String(data.get("name") ?? "").trim();
  const rawUrl = String(data.get("video_url") ?? "").trim();
  const video_url = safeUrl(rawUrl);
  if (!name) return { error: "Informe o nome do exercício." };
  if (rawUrl && !video_url) return { error: "O link do vídeo precisa começar com https://" };
  const values = {
    name,
    video_url,
    region: String(data.get("region") ?? "").trim() || null,
    instructions: String(data.get("instructions") ?? "").trim() || null,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("exercises").update(values).eq("id", id)
    : await supabase.from("exercises").insert({ ...values, clinic_id: ctx.clinicId });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes/exercicios");
  return { ok: id ? "Exercício atualizado." : `${name} foi adicionado à biblioteca.` };
}

export async function setExerciseActive(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) return;
  const supabase = await createClient();
  await supabase.from("exercises").update({ active: data.get("active") === "true" }).eq("id", String(data.get("id")));
  revalidatePath("/ajustes/exercicios");
}
