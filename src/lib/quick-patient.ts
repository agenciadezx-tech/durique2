import { revalidatePath } from "next/cache";
import { friendlyError, normalizePhone } from "@/lib/format";
import type { createClient } from "@/lib/supabase/server";

/**
 * Paciente escolhido na lista ou cadastrado na hora (nome + WhatsApp).
 * Se já existe alguém com o mesmo WhatsApp na clínica, usa esse cadastro em vez de duplicar.
 */
export async function resolvePatient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  data: FormData,
): Promise<{ id: string | null; error?: string; created?: boolean }> {
  const picked = String(data.get("patient_id") ?? "");
  if (picked) return { id: picked };
  const name = String(data.get("new_patient_name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { id: null };
  if (name.length < 3) return { id: null, error: "Escreva o nome do paciente novo." };
  const phone = normalizePhone(String(data.get("new_patient_phone") ?? ""));
  if (phone) {
    const { data: same } = await supabase.from("patients").select("id").eq("clinic_id", clinicId).eq("phone", phone).limit(1).maybeSingle();
    if (same) return { id: same.id };
  }
  const { data: row, error } = await supabase.from("patients").insert({ clinic_id: clinicId, name, phone }).select("id").single();
  if (error || !row) return { id: null, error: friendlyError(error) };
  revalidatePath("/pacientes", "layout");
  return { id: row.id, created: true };
}
