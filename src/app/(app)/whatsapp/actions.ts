"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const KINDS = ["lembrete", "cobranca", "renovacao", "outro"] as const;

/** Registra que a mensagem foi enviada (modo manual: a pessoa enviou pelo WhatsApp dela). */
export async function logMessage(data: FormData): Promise<{ ok: boolean }> {
  const ctx = await getContext();
  if (ctx.role === "profissional") return { ok: false };
  const kind = KINDS.includes(String(data.get("kind")) as (typeof KINDS)[number])
    ? (String(data.get("kind")) as (typeof KINDS)[number])
    : "outro";
  const opt = (k: string) => String(data.get(k) ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("message_log").insert({
    clinic_id: ctx.clinicId,
    kind,
    channel: "manual",
    patient_id: String(data.get("patient_id")),
    attendee_id: opt("attendee_id"),
    transaction_id: opt("transaction_id"),
    package_id: opt("package_id"),
    phone: opt("phone"),
    body: String(data.get("body") ?? "").slice(0, 2000),
  });
  revalidatePath("/whatsapp");
  return { ok: !error };
}

export async function saveTemplates(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return { error: "Somente o administrador pode alterar os textos." };
  const t = (k: string) => String(data.get(k) ?? "").trim();
  const values = { tpl_lembrete: t("tpl_lembrete"), tpl_cobranca: t("tpl_cobranca"), tpl_renovacao: t("tpl_renovacao") };
  if (Object.values(values).some((v) => v.length < 10)) return { error: "Os textos não podem ficar vazios." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_settings")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("clinic_id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/whatsapp");
  revalidatePath("/ajustes");
  return { ok: "Textos salvos." };
}
