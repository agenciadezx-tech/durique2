"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, normalizeCpf, normalizePhone } from "@/lib/format";
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
