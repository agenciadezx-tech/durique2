"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, normalizeCpf, normalizePhone, parseMoney, todayISO } from "@/lib/format";
import type { ActionState } from "@/components/forms";

function readPatient(data: FormData) {
  const name = String(data.get("name") ?? "").trim();
  const phoneRaw = String(data.get("phone") ?? "").trim();
  const cpfRaw = String(data.get("cpf") ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  const cpf = normalizeCpf(cpfRaw);
  const errors: string[] = [];
  if (!name) errors.push("Informe o nome do paciente.");
  if (phoneRaw && !phone) errors.push("Telefone inválido. Use DDD + número, ex.: (11) 99999-8888.");
  if (cpfRaw && !cpf) errors.push("CPF inválido. Digite os 11 números.");
  return {
    errors,
    values: {
      name,
      phone,
      cpf,
      email: String(data.get("email") ?? "").trim() || null,
      birth_date: String(data.get("birth_date") ?? "") || null,
      notes: String(data.get("notes") ?? "").trim() || null,
      access_via: ["wellhub", "totalpass"].includes(String(data.get("access_via"))) ? String(data.get("access_via")) : null,
    },
  };
}

export async function createPatient(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const { errors, values } = readPatient(data);
  if (errors.length) return { error: errors[0] };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("patients")
    .insert({ ...values, clinic_id: ctx.clinicId })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error) };
  revalidatePath("/pacientes");
  redirect(`/pacientes/${row.id}?salvo=1`);
}

export async function updatePatient(_: ActionState, data: FormData): Promise<ActionState> {
  await getContext();
  const id = String(data.get("id"));
  const { errors, values } = readPatient(data);
  if (errors.length) return { error: errors[0] };
  const supabase = await createClient();
  const { error } = await supabase.from("patients").update(values).eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
  return { ok: "Alterações salvas." };
}

export async function setPatientActive(data: FormData) {
  await getContext();
  const id = String(data.get("id"));
  const active = data.get("active") === "true";
  const supabase = await createClient();
  await supabase.from("patients").update({ active }).eq("id", id);
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${id}`);
}

export type ImportRow = { name: string; phone?: string; email?: string; cpf?: string; birth_date?: string };
export type ImportResult = { inserted: number; skipped: { line: number; name: string; reason: string }[] };

export async function importPatients(rows: ImportRow[]): Promise<ImportResult & { error?: string }> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { inserted: 0, skipped: [], error: "Você não tem permissão para importar." };
  if (rows.length > 3000) return { inserted: 0, skipped: [], error: "Envie no máximo 3.000 pacientes por vez." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("patients").select("cpf").eq("clinic_id", ctx.clinicId).not("cpf", "is", null);
  const knownCpf = new Set((existing ?? []).map((p) => p.cpf));

  const skipped: ImportResult["skipped"] = [];
  const valid: Record<string, unknown>[] = [];
  rows.forEach((r, i) => {
    const line = i + 2; // linha 1 = cabeçalho
    const name = (r.name ?? "").trim();
    if (!name) return skipped.push({ line, name: "(sem nome)", reason: "Sem nome" });
    const phone = r.phone ? normalizePhone(r.phone) : null;
    const cpf = r.cpf ? normalizeCpf(r.cpf) : null;
    if (cpf && knownCpf.has(cpf)) return skipped.push({ line, name, reason: "CPF já cadastrado" });
    if (cpf) knownCpf.add(cpf);
    valid.push({
      clinic_id: ctx.clinicId,
      name,
      phone,
      cpf,
      email: r.email?.trim() || null,
      birth_date: r.birth_date || null,
    });
    if (r.phone && !phone) skipped.push({ line, name, reason: "Importado sem telefone (número inválido)" });
  });

  let inserted = 0;
  for (let i = 0; i < valid.length; i += 500) {
    const chunk = valid.slice(i, i + 500);
    const { error, count } = await supabase.from("patients").insert(chunk, { count: "exact" });
    if (error) return { inserted, skipped, error: friendlyError(error) };
    inserted += count ?? chunk.length;
  }
  revalidatePath("/pacientes");
  return { inserted, skipped };
}

export async function sellPackage(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Você não tem permissão para vender pacotes." };
  const patientId = String(data.get("patient_id"));
  const productId = String(data.get("product_id") ?? "");
  const price = parseMoney(String(data.get("price") ?? ""));
  const paidNow = data.get("paid_now") === "on";
  const method = String(data.get("payment_method") ?? "") || null;
  if (!productId) return { error: "Escolha o pacote ou plano." };
  if (price == null) return { error: "Informe o valor." };
  if (paidNow && !method) return { error: "Escolha a forma de pagamento." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("sell_package", {
    p_patient: patientId,
    p_product: productId,
    p_price_cents: price,
    p_starts_on: String(data.get("starts_on") || todayISO()),
    p_installments: Number(data.get("installments")) || 1,
    p_first_due: String(data.get("first_due") || todayISO()),
    p_paid_now: paidNow,
    p_method: (paidNow ? method : null) as "pix" | null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath("/financeiro", "layout");
  redirect(`/pacientes/${patientId}?vendido=1`);
}

export async function setPackageStatus(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const status = data.get("status") === "cancelado" ? "cancelado" : data.get("status") === "ativo" ? "ativo" : "encerrado";
  const supabase = await createClient();
  const id = String(data.get("id"));
  await supabase
    .from("patient_packages")
    .update({ status, ...(status !== "ativo" ? { expires_on: todayISO() } : {}) })
    .eq("id", id);
  revalidatePath(`/pacientes/${String(data.get("patient_id"))}`);
}

export async function extendPackage(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const supabase = await createClient();
  const date = String(data.get("expires_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await supabase.from("patient_packages").update({ expires_on: date, status: "ativo" }).eq("id", String(data.get("id")));
  revalidatePath(`/pacientes/${String(data.get("patient_id"))}`);
}

export async function createDocument(data: FormData) {
  const ctx = await getContext();
  if (ctx.role === "financeiro") return;
  const patientId = String(data.get("patient_id"));
  const templateId = String(data.get("template_id") ?? "");
  if (!templateId) return;
  const supabase = await createClient();
  const [{ data: t }, { data: p }] = await Promise.all([
    supabase.from("document_templates").select("id, name, body").eq("id", templateId).single(),
    supabase.from("patients").select("name, cpf").eq("id", patientId).single(),
  ]);
  if (!t || !p) return;
  const cpf = p.cpf ? `${p.cpf.slice(0, 3)}.${p.cpf.slice(3, 6)}.${p.cpf.slice(6, 9)}-${p.cpf.slice(9)}` : "____________";
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long" }).format(new Date());
  const body = t.body
    .replaceAll("{paciente}", p.name)
    .replaceAll("{cpf}", cpf)
    .replaceAll("{clinica}", ctx.clinicName)
    .replaceAll("{cidade}", "")
    .replaceAll("{data}", date)
    .replace(/^,\s*/m, "");
  const { data: doc } = await supabase
    .from("patient_documents")
    .insert({ clinic_id: ctx.clinicId, patient_id: patientId, template_id: t.id, title: t.name, body })
    .select("id")
    .single();
  revalidatePath(`/pacientes/${patientId}`);
  if (doc) redirect(`/pacientes/${patientId}/documentos/${doc.id}`);
}

export async function cancelDocument(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return;
  const supabase = await createClient();
  await supabase.from("patient_documents").update({ status: "cancelado" }).eq("id", String(data.get("id")));
  const patientId = String(data.get("patient_id"));
  revalidatePath(`/pacientes/${patientId}`);
  redirect(`/pacientes/${patientId}`);
}

export async function freezePackage(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Sem permissão." };
  const from = String(data.get("from") ?? "");
  const until = String(data.get("until") ?? "");
  if (!from || !until) return { error: "Informe o início e o fim." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("freeze_package", { p_package: String(data.get("id")), p_from: from, p_until: until });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/pacientes/${String(data.get("patient_id"))}`);
  return { ok: "Congelado. A validade foi estendida pelos dias parados e não haverá mensalidade nesse período." };
}

export async function updateSummary(id: string, summary: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda && !ctx.canSeeClinical) return { error: "Sem permissão." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({ summary: summary.trim().slice(0, 140) || null })
    .eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/pacientes/${id}`);
  revalidatePath("/pacientes");
  return { ok: true };
}

export async function requestPreAssessment(data: FormData) {
  const id = String(data.get("patient_id"));
  const kind = data.get("kind") === "aula" ? "aula" : "consulta";
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("request_pre_assessment", { p_patient: id, p_kind: kind });
  if (error || !token) redirect(`/pacientes/${id}?erro=pre`);
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}?pre=${token}`);
}
