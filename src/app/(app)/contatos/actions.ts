"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, normalizePhone } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const STAGES = ["novo", "contato", "avaliacao", "efetivado", "perdido"] as const;

async function staff() {
  const ctx = await getContext();
  return ctx.canManageAgenda ? ctx : null;
}

function readLead(data: FormData) {
  const name = String(data.get("name") ?? "").trim();
  const phoneRaw = String(data.get("phone") ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  const nextOn = String(data.get("next_action_on") ?? "");
  return {
    error: !name ? "Informe o nome." : phoneRaw && !phone ? "WhatsApp inválido. Use DDD + número." : null,
    values: {
      name,
      phone,
      source: String(data.get("source") ?? "").trim().slice(0, 40) || null,
      interest: String(data.get("interest") ?? "").trim().slice(0, 120) || null,
      notes: String(data.get("notes") ?? "").trim().slice(0, 2000) || null,
      next_action: String(data.get("next_action") ?? "").trim().slice(0, 160) || null,
      next_action_on: /^\d{4}-\d{2}-\d{2}$/.test(nextOn) ? nextOn : null,
    },
  };
}

export async function createLead(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await staff();
  if (!ctx) return { error: "Sem permissão." };
  const { error: e, values } = readLead(data);
  if (e) return { error: e };
  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({ ...values, clinic_id: ctx.clinicId });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/contatos");
  return { ok: `${values.name} entrou em Novos.` };
}

export async function updateLead(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await staff();
  if (!ctx) return { error: "Sem permissão." };
  const { error: e, values } = readLead(data);
  if (e) return { error: e };
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", String(data.get("id")));
  if (error) return { error: friendlyError(error) };
  revalidatePath("/contatos");
  return { ok: "Salvo." };
}

/** Muda a etapa (botões "Avançar", "Perdido", "Voltar para..."). */
export async function moveLead(data: FormData) {
  const ctx = await staff();
  if (!ctx) return;
  const stage = String(data.get("stage"));
  if (!STAGES.includes(stage as (typeof STAGES)[number])) return;
  const supabase = await createClient();
  await supabase
    .from("leads")
    .update({
      stage,
      lost_reason: stage === "perdido" ? String(data.get("lost_reason") ?? "").trim().slice(0, 160) || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(data.get("id")));
  revalidatePath("/contatos");
}

/** Vira paciente: cria o cadastro (ou usa o que já existe com o mesmo WhatsApp) e abre a ficha. */
export async function convertLead(data: FormData) {
  const ctx = await staff();
  if (!ctx) return;
  const id = String(data.get("id"));
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, name, phone, patient_id, interest, notes").eq("id", id).maybeSingle();
  if (!lead) return;
  let patientId = lead.patient_id as string | null;
  if (!patientId && lead.phone) {
    const { data: same } = await supabase.from("patients").select("id").eq("clinic_id", ctx.clinicId).eq("phone", lead.phone).limit(1).maybeSingle();
    patientId = same?.id ?? null;
  }
  if (!patientId) {
    const { data: row, error } = await supabase
      .from("patients")
      .insert({ clinic_id: ctx.clinicId, name: lead.name, phone: lead.phone, summary: lead.interest, notes: lead.notes })
      .select("id")
      .single();
    if (error || !row) redirect("/contatos?erro=1");
    patientId = row.id;
  }
  await supabase.from("leads").update({ stage: "efetivado", patient_id: patientId, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/contatos");
  revalidatePath("/pacientes");
  redirect(`/pacientes/${patientId}?salvo=1`);
}
