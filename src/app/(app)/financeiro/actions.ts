"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { addMonthsKey, friendlyError, parseMoney, todayISO } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const METHODS = ["pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "outro"] as const;
type Method = (typeof METHODS)[number];
const asMethod = (v: FormDataEntryValue | null): Method | null =>
  METHODS.includes(String(v) as Method) ? (String(v) as Method) : null;

function refresh(extra?: string) {
  revalidatePath("/financeiro", "layout");
  revalidatePath("/pacientes", "layout");
  if (extra) revalidatePath(extra);
}

/** Dar baixa: recebido / pago hoje (ou na data informada). */
export async function markPaid(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (ctx.role === "profissional") return { error: "Sem permissão." };
  const id = String(data.get("id"));
  const method = asMethod(data.get("payment_method"));
  if (!method) return { error: "Escolha a forma de pagamento." };
  const paidOn = String(data.get("paid_on") ?? "") || todayISO();
  const amount = parseMoney(String(data.get("amount") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ paid_on: paidOn, payment_method: method, ...(amount ? { amount_cents: amount } : {}) })
    .eq("id", id);
  if (error) return { error: friendlyError(error) };
  refresh(String(data.get("back") ?? ""));
  return { ok: "Baixa registrada." };
}

export async function unmarkPaid(data: FormData) {
  const ctx = await getContext();
  if (ctx.role === "profissional") return;
  const supabase = await createClient();
  await supabase.from("transactions").update({ paid_on: null, payment_method: null }).eq("id", String(data.get("id")));
  refresh(String(data.get("back") ?? ""));
}

export async function deleteTransaction(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) return;
  const supabase = await createClient();
  await supabase.from("transactions").delete().eq("id", String(data.get("id")));
  refresh();
  redirect(String(data.get("back") || "/financeiro/lancamentos"));
}

/** Nova receita ou despesa, com opção de repetir todo mês (ex.: aluguel). */
export async function createTransaction(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const type = data.get("type") === "despesa" ? "despesa" : "receita";
  if (type === "despesa" && !ctx.canSeeExpenses) return { error: "Sem permissão para lançar despesas." };
  if (ctx.role === "profissional") return { error: "Sem permissão." };

  const description = String(data.get("description") ?? "").trim();
  const amount = parseMoney(String(data.get("amount") ?? ""));
  const due = String(data.get("due_date") ?? "") || todayISO();
  const paidNow = data.get("paid_now") === "on";
  const method = asMethod(data.get("payment_method"));
  const repeat = Math.min(Math.max(Number(data.get("repeat")) || 1, 1), 24);
  if (!description) return { error: "Descreva o lançamento. Ex.: Aluguel de dezembro." };
  if (!amount) return { error: "Informe o valor." };
  if (paidNow && !method) return { error: "Escolha a forma de pagamento." };

  const rows = Array.from({ length: repeat }, (_, i) => {
    const d = i === 0 ? due : `${addMonthsKey(due.slice(0, 7), i)}-${due.slice(8, 10)}`;
    // dia 29–31 em meses mais curtos: usa o último dia válido
    const [y, m, dd] = d.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dueDate = `${d.slice(0, 7)}-${String(Math.min(dd, last)).padStart(2, "0")}`;
    return {
      clinic_id: ctx.clinicId,
      type: type as "receita" | "despesa",
      description: repeat > 1 ? `${description} (${i + 1}/${repeat})` : description,
      category_id: String(data.get("category_id") ?? "") || null,
      amount_cents: amount,
      due_date: dueDate,
      paid_on: i === 0 && paidNow ? todayISO() : null,
      payment_method: i === 0 && paidNow ? method : null,
      patient_id: String(data.get("patient_id") ?? "") || null,
      notes: String(data.get("notes") ?? "").trim() || null,
    };
  });
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert(rows);
  if (error) return { error: friendlyError(error) };
  refresh();
  redirect(`/financeiro/lancamentos?tipo=${type === "despesa" ? "pagar" : "receber"}&mes=${due.slice(0, 7)}&salvo=1`);
}

/** Registra o pagamento da comissão do período como despesa paga. */
export async function payCommission(data: FormData) {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) return;
  const amount = Number(data.get("amount_cents"));
  const month = String(data.get("month"));
  if (!amount || amount <= 0) return;
  const supabase = await createClient();
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("clinic_id", ctx.clinicId)
    .eq("system_key", "comissoes")
    .maybeSingle();
  await supabase.from("transactions").insert({
    clinic_id: ctx.clinicId,
    type: "despesa",
    description: `Comissão ${String(data.get("name"))} · ${month.slice(5)}/${month.slice(0, 4)}`,
    category_id: cat?.id ?? null,
    amount_cents: amount,
    due_date: `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()).padStart(2, "0")}`,
    paid_on: todayISO(),
    payment_method: asMethod(data.get("payment_method")) ?? "pix",
    professional_id: String(data.get("professional_id")),
  });
  refresh("/financeiro/comissoes");
}

/** Cobrar sessão avulsa (paciente sem pacote). */
export async function chargeAttendee(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canManageAgenda && !ctx.canSeeExpenses) return { error: "Sem permissão." };
  const amount = parseMoney(String(data.get("amount") ?? ""));
  const paidNow = data.get("paid_now") === "on";
  const method = asMethod(data.get("payment_method"));
  if (!amount) return { error: "Informe o valor." };
  if (paidNow && !method) return { error: "Escolha a forma de pagamento." };
  const supabase = await createClient();
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("clinic_id", ctx.clinicId)
    .eq("system_key", "avulsas")
    .maybeSingle();
  const { error } = await supabase.from("transactions").insert({
    clinic_id: ctx.clinicId,
    type: "receita",
    description: String(data.get("description")),
    category_id: cat?.id ?? null,
    amount_cents: amount,
    due_date: String(data.get("due_date") || todayISO()),
    paid_on: paidNow ? todayISO() : null,
    payment_method: paidNow ? method : null,
    patient_id: String(data.get("patient_id")),
    attendee_id: String(data.get("attendee_id")),
  });
  if (error) return { error: friendlyError(error) };
  refresh(`/agenda/${String(data.get("appointment_id"))}`);
  return { ok: paidNow ? "Pagamento registrado." : "Cobrança lançada em Contas a receber." };
}
