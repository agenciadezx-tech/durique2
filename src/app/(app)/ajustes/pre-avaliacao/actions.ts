"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError } from "@/lib/format";
import { ALL_FIELDS, type PreConfig } from "@/lib/pre-assessment";

export async function savePreForm(kind: "consulta" | "aula", cfg: PreConfig): Promise<{ ok?: string; error?: string }> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return { error: "Somente o administrador pode alterar isso." };
  if (kind !== "consulta" && kind !== "aula") return { error: "Tipo inválido." };
  const fields: PreConfig["fields"] = {};
  for (const f of ALL_FIELDS) {
    const c = cfg.fields[f.key];
    if (c) fields[f.key] = { ask: !!c.ask, req: !!c.ask && !!c.req };
  }
  const questions = (cfg.questions ?? [])
    .map((q, i) => ({ id: q.id || `q${i + 1}`, label: String(q.label ?? "").trim().slice(0, 200), req: !!q.req }))
    .filter((q) => q.label)
    .slice(0, 10);
  const supabase = await createClient();
  const { error } = await supabase
    .from("pre_assessment_forms")
    .upsert({ clinic_id: ctx.clinicId, kind, fields, questions, updated_at: new Date().toISOString() });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/ajustes/pre-avaliacao");
  return { ok: "Formulário salvo." };
}
