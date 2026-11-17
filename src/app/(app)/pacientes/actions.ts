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
  // Matrícula: já coloca o aluno nas turmas escolhidas
  const seriesIds = data.getAll("series_id").map(String).filter(Boolean);
  for (const sid of seriesIds) {
    const { error: e2 } = await supabase.rpc("enroll_patient", { p_series: sid, p_patient: patientId });
    if (e2) return { error: `Venda feita, mas não deu para entrar numa das turmas: ${friendlyError(e2)}` };
  }
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath("/financeiro", "layout");
  revalidatePath("/horarios");
  redirect(`/pacientes/${patientId}?vendido=1`);
}

/** Aula experimental (grátis ou com valor) ou aula avulsa: coloca o aluno só naquela aula, sem usar pacote. */
export async function bookSingleClass(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Você não tem permissão para marcar aulas." };
  const patientId = String(data.get("patient_id"));
  const appointmentId = String(data.get("appointment_id") ?? "");
  const kind = data.get("charge_kind") === "avulsa" ? "avulsa" : "experimental";
  const price = parseMoney(String(data.get("price") ?? "")) ?? 0;
  const paidNow = data.get("paid_now") === "on";
  const method = String(data.get("payment_method") ?? "") || null;
  if (!appointmentId) return { error: "Escolha a aula." };
  if (kind === "avulsa" && price <= 0) return { error: "Informe o valor da aula avulsa." };
  if (price > 0 && paidNow && !method) return { error: "Escolha a forma de pagamento." };
  const supabase = await createClient();
  const { data: appt } = await supabase.from("appointments").select("starts_at, services(name)").eq("id", appointmentId).maybeSingle();
  if (!appt) return { error: "Aula não encontrada." };
  const { data: att, error } = await supabase
    .from("appointment_attendees")
    .insert({ clinic_id: ctx.clinicId, appointment_id: appointmentId, patient_id: patientId, charge_kind: kind } as never)
    .select("id")
    .single();
  if (error) return { error: friendlyError(error) };
  if (price > 0) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(appt.starts_at));
    const { data: cat } = await supabase.from("categories").select("id").eq("clinic_id", ctx.clinicId).eq("system_key", "avulsas").maybeSingle();
    const svc = (appt.services as unknown as { name: string } | null)?.name ?? "Aula";
    const { error: e2 } = await supabase.from("transactions").insert({
      clinic_id: ctx.clinicId,
      type: "receita",
      description: `${kind === "experimental" ? "Aula experimental" : "Aula avulsa"} · ${svc}`,
      category_id: cat?.id ?? null,
      amount_cents: price,
      due_date: String(data.get("first_due") || day),
      paid_on: paidNow ? todayISO() : null,
      payment_method: (paidNow ? method : null) as "pix" | null,
      patient_id: patientId,
      attendee_id: att.id,
    });
    if (e2) return { error: `Aula marcada, mas não deu para lançar o valor: ${friendlyError(e2)}` };
  }
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda");
  revalidatePath("/horarios");
  revalidatePath("/financeiro", "layout");
  redirect(`/agenda/${appointmentId}?marcado=${kind}`);
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

/** Alta, pausa ou abandono do tratamento (só registra; não apaga nada). */
export async function registerDischarge(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (ctx.role === "financeiro") return { error: "Sem permissão." };
  const kind = String(data.get("kind"));
  if (!["alta", "pausa", "abandono"].includes(kind)) return { error: "Escolha o que aconteceu." };
  const date = String(data.get("discharged_on") ?? "") || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) return { error: "Confira a data." };
  const patientId = String(data.get("patient_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("discharges").insert({
    clinic_id: ctx.clinicId,
    patient_id: patientId,
    kind,
    discharged_on: date,
    notes: String(data.get("notes") ?? "").trim() || null,
    professional_id: ctx.professionalId,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: kind === "alta" ? "Alta registrada. Parabéns pelo resultado!" : "Registrado." };
}

/** Liga/desliga o pedido de confirmação de presença para este paciente. */
export async function setSkipConfirmation(id: string, skip: boolean): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Só a recepção ou o administrador muda isso." };
  const supabase = await createClient();
  const { error } = await supabase.from("patients").update({ skip_confirmation: skip }).eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/pacientes/${id}`);
  revalidatePath("/agenda");
  revalidatePath("/whatsapp");
  return { ok: true };
}

// ===== Gerir aulas (matrícula) =====
type Res = { ok?: string; error?: string };
const refreshPatient = (id: string) => {
  revalidatePath(`/pacientes/${id}`);
  revalidatePath("/horarios");
  revalidatePath("/agenda");
};

export async function addEnrollment(patientId: string, seriesId: string): Promise<Res> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Sem permissão." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_patient", { p_series: seriesId, p_patient: patientId });
  if (error) return { error: friendlyError(error) };
  refreshPatient(patientId);
  return { ok: "Horário adicionado." };
}

export async function leaveEnrollment(patientId: string, enrollmentId: string): Promise<Res> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Sem permissão." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_enrollment", { p_enrollment: enrollmentId });
  if (error) return { error: friendlyError(error) };
  refreshPatient(patientId);
  return { ok: "Saiu do horário. As próximas aulas foram liberadas." };
}

export async function swapEnrollment(patientId: string, enrollmentId: string, newSeriesId: string): Promise<Res> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Sem permissão." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_patient", { p_series: newSeriesId, p_patient: patientId });
  if (error) return { error: friendlyError(error) };
  const { error: e2 } = await supabase.rpc("end_enrollment", { p_enrollment: enrollmentId });
  if (e2) return { error: friendlyError(e2) };
  refreshPatient(patientId);
  return { ok: "Horário trocado." };
}

/** Cancelar matrícula: sai de todas as turmas fixas e encerra o plano mensal (o histórico fica). */
export async function cancelMembership(patientId: string, planId: string | null): Promise<Res> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) return { error: "Sem permissão." };
  const supabase = await createClient();
  const today = todayISO();
  const { data: enr } = await supabase.from("enrollments").select("id").eq("patient_id", patientId).or(`ends_on.is.null,ends_on.gte.${today}`);
  for (const e of enr ?? []) {
    const { error } = await supabase.rpc("end_enrollment", { p_enrollment: e.id });
    if (error) return { error: friendlyError(error) };
  }
  if (planId) await supabase.from("patient_packages").update({ status: "encerrado", expires_on: today }).eq("id", planId);
  refreshPatient(patientId);
  return { ok: "Matrícula cancelada." };
}
