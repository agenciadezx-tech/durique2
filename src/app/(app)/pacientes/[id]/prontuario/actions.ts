"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, todayISO } from "@/lib/format";
import { ASSESSMENT_FIELDS, EVOLUTION_FIELDS, PAIN_REGIONS, SCALES } from "@/lib/clinical";
import type { ActionState } from "@/components/forms";

function readRecord(data: FormData, kind: string) {
  const fields = kind === "avaliacao" ? ASSESSMENT_FIELDS : EVOLUTION_FIELDS;
  const values: Record<string, unknown> = {};
  for (const f of fields) values[f.key] = String(data.get(f.key) ?? "").trim() || null;
  const eva = String(data.get("dor_eva") ?? "");
  values.dor_eva = eva === "" ? null : Math.max(0, Math.min(10, Number(eva)));
  const regions = data.getAll("mapa_dor").map(String).filter((r) => (PAIN_REGIONS as readonly string[]).includes(r));
  values.mapa_dor = regions.length ? regions : null;
  const num = (k: string, min: number, max: number) => {
    const v = Number(String(data.get(k) ?? "").replace(",", ".").trim() || NaN);
    return Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : null;
  };
  if (kind === "avaliacao") {
    values.peso_kg = num("peso_kg", 1, 400);
    values.altura_cm = num("altura_cm", 30, 250);
    const fc = num("freq_cardiaca", 20, 250);
    values.freq_cardiaca = fc == null ? null : Math.round(fc);
    const pa = String(data.get("pressao") ?? "").replace(/\s|x|X/g, (m) => (m.trim() ? "/" : "")).trim();
    values.pressao = /^\d{2,3}\/\d{2,3}$/.test(pa) ? pa : null;
  }
  values.record_date = String(data.get("record_date") || todayISO());
  values.texto = String(data.get("texto") ?? "").trim() || null;
  return values;
}

const hasContent = (v: Record<string, unknown>) =>
  Object.entries(v).some(([k, x]) => !["record_date", "dor_eva", "mapa_dor"].includes(k) && x);

export async function createRecord(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.professionalId) return { error: "Seu usuário não está ligado a um profissional. Peça ao administrador em Configurações." };
  const patientId = String(data.get("patient_id"));
  const kind = data.get("kind") === "avaliacao" ? "avaliacao" : "evolucao";
  const values = readRecord(data, kind);
  if (!hasContent(values)) return { error: "Preencha pelo menos um campo." };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("clinical_records")
    .insert({
      ...values,
      clinic_id: ctx.clinicId,
      patient_id: patientId,
      professional_id: ctx.professionalId,
      kind,
      attendee_id: String(data.get("attendee_id") ?? "") || null,
    })
    .select("id")
    .single();
  if (error || !row) return { error: friendlyError(error) };
  if (data.get("sign") === "1") {
    const { error: e2 } = await supabase.rpc("sign_clinical_record", { p_record: row.id });
    if (e2) return { error: friendlyError(e2) };
  }
  if (values.dor_eva != null) {
    await supabase.from("scale_results").insert({
      clinic_id: ctx.clinicId,
      patient_id: patientId,
      professional_id: ctx.professionalId,
      scale: "eva",
      score: values.dor_eva as number,
      max_score: 10,
      measured_on: values.record_date as string,
    });
  }
  revalidatePath(`/pacientes/${patientId}/prontuario`);
  redirect(`/pacientes/${patientId}/prontuario/${row.id}?salvo=1`);
}

export async function updateRecord(_: ActionState, data: FormData): Promise<ActionState> {
  await getContext();
  const id = String(data.get("id"));
  const patientId = String(data.get("patient_id"));
  const kind = String(data.get("kind"));
  const values = readRecord(data, kind);
  const supabase = await createClient();
  const { error } = await supabase.from("clinical_records").update(values).eq("id", id);
  if (error) return { error: friendlyError(error) };
  if (data.get("sign") === "1") {
    const { error: e2 } = await supabase.rpc("sign_clinical_record", { p_record: id });
    if (e2) return { error: friendlyError(e2) };
  }
  revalidatePath(`/pacientes/${patientId}/prontuario/${id}`);
  revalidatePath(`/pacientes/${patientId}/prontuario`);
  return { ok: data.get("sign") === "1" ? "Registro assinado." : "Rascunho salvo." };
}

export async function addAddendum(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.professionalId) return { error: "Seu usuário não está ligado a um profissional." };
  const parentId = String(data.get("parent_id"));
  const patientId = String(data.get("patient_id"));
  const texto = String(data.get("texto") ?? "").trim();
  if (texto.length < 3) return { error: "Escreva o adendo." };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("clinical_records")
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: patientId,
      professional_id: ctx.professionalId,
      kind: "adendo",
      parent_id: parentId,
      texto,
    })
    .select("id")
    .single();
  if (error || !row) return { error: friendlyError(error) };
  const { error: e2 } = await supabase.rpc("sign_clinical_record", { p_record: row.id });
  if (e2) return { error: friendlyError(e2) };
  revalidatePath(`/pacientes/${patientId}/prontuario/${parentId}`);
  revalidatePath(`/pacientes/${patientId}/prontuario`);
  return { ok: "Adendo assinado e anexado ao registro." };
}

export async function addScale(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) return { error: "Sem permissão." };
  const patientId = String(data.get("patient_id"));
  const scale = String(data.get("scale"));
  const def = SCALES.find((s) => s.key === scale);
  const score = Number(String(data.get("score") ?? "").replace(",", "."));
  if (!def) return { error: "Escolha a escala." };
  if (!Number.isFinite(score) || score < 0 || (def.max != null && score > def.max))
    return { error: def.max != null ? `O resultado deve ser entre 0 e ${def.max}.` : "Resultado inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("scale_results").insert({
    clinic_id: ctx.clinicId,
    patient_id: patientId,
    professional_id: ctx.professionalId,
    scale,
    score,
    max_score: def.max,
    notes: String(data.get("notes") ?? "").trim() || null,
    measured_on: String(data.get("measured_on") || todayISO()),
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/pacientes/${patientId}/prontuario`);
  return { ok: "Resultado registrado." };
}
