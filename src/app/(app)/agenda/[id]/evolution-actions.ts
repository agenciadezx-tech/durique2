"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/format";

export type EvolutionInput = {
  appointmentId: string;
  level: number | null;
  notes: string;
  individual: { patient_id: string; level: number | null; note: string }[];
};

export async function saveEvolution(input: EvolutionInput): Promise<{ ok?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_session_evolution", {
    p_appointment: input.appointmentId,
    p_level: input.level,
    p_notes: input.notes.slice(0, 2000),
    p_individual: input.individual
      .filter((i) => i.level != null || i.note.trim())
      .map((i) => ({ patient_id: i.patient_id, level: i.level, note: i.note.slice(0, 1000) })),
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/agenda/${input.appointmentId}`);
  const n = Number(data ?? 0);
  return { ok: n ? `Evolução salva na ficha de ${n} aluno${n === 1 ? "" : "s"}.` : "Evolução da aula salva." };
}
