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

// ===== Avisos automáticos =====

async function upsertAutomations(clinicId: string, rows: { key: string; enabled?: boolean; template?: string | null }[]) {
  const supabase = await createClient();
  const { data: cur } = await supabase.from("whatsapp_automations").select("key, enabled, template").eq("clinic_id", clinicId);
  const byKey = new Map((cur ?? []).map((r) => [r.key, r]));
  const now = new Date().toISOString();
  return supabase.from("whatsapp_automations").upsert(
    rows.map((r) => ({
      clinic_id: clinicId,
      key: r.key,
      enabled: r.enabled ?? byKey.get(r.key)?.enabled ?? true,
      template: r.template !== undefined ? r.template : (byKey.get(r.key)?.template ?? null),
      updated_at: now,
    })),
    { onConflict: "clinic_id,key" },
  );
}

/** Liga/desliga um aviso, ou um grupo inteiro (campo group). */
export async function toggleAutomation(data: FormData) {
  const ctx = await getContext();
  if (!ctx.isAdmin) return;
  const { AUTOMATIONS } = await import("@/lib/automations");
  const enabled = data.get("enabled") === "1";
  const group = String(data.get("group") ?? "");
  const keys = group ? AUTOMATIONS.filter((a) => a.group === group).map((a) => a.key) : [String(data.get("key"))];
  const valid = keys.filter((k) => AUTOMATIONS.some((a) => a.key === k));
  if (!valid.length) return;
  await upsertAutomations(ctx.clinicId, valid.map((key) => ({ key, enabled })));
  revalidatePath("/whatsapp/avisos");
}

export async function saveAutomationText(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return { error: "Somente o administrador pode alterar os textos." };
  const { AUTOMATIONS } = await import("@/lib/automations");
  const a = AUTOMATIONS.find((x) => x.key === String(data.get("key")));
  if (!a) return { error: "Aviso não encontrado." };
  const reset = data.get("restore") === "1";
  const text = reset ? a.template : String(data.get("template") ?? "").trim();
  if (text.length < 10) return { error: "A mensagem está muito curta." };
  if (text.length > 1000) return { error: "A mensagem passou de 1.000 letras." };
  const { error } = await upsertAutomations(ctx.clinicId, [{ key: a.key, template: reset ? null : text }]);
  if (error) return { error: friendlyError(error) };
  if (a.settingsColumn) {
    const supabase = await createClient();
    await supabase.from("whatsapp_settings").update({ [a.settingsColumn]: text, updated_at: new Date().toISOString() }).eq("clinic_id", ctx.clinicId);
  }
  revalidatePath("/whatsapp", "layout");
  return { ok: reset ? "Voltou ao texto padrão." : "Mensagem salva." };
}

export async function saveSendWindow(data: FormData) {
  const ctx = await getContext();
  if (!ctx.isAdmin) return;
  const from = Number(data.get("send_from"));
  const to = Number(data.get("send_to"));
  if (!(from >= 0 && from <= 23 && to >= 1 && to <= 24 && to > from)) return;
  const supabase = await createClient();
  await supabase.from("whatsapp_settings").update({ send_from: from, send_to: to, updated_at: new Date().toISOString() }).eq("clinic_id", ctx.clinicId);
  revalidatePath("/whatsapp/avisos");
}
