"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { friendlyError, parseMoney } from "@/lib/format";
import type { ActionState } from "@/components/forms";

const NOT_ADMIN = { error: "Somente o administrador pode alterar o catálogo." };
const CYCLES = [1, 3, 6, 12] as const;

async function admin() {
  const ctx = await getContext();
  return ctx.isAdmin ? ctx : null;
}
function done(serviceId: string) {
  revalidatePath("/catalogo");
  void serviceId;
}
const num = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(",", ".")));

/** Campos soltos do serviço (preço avulsa, experimental pelo link, pós-pago, descontos, modo da grade, evolução). */
export async function saveServiceExtras(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const id = String(data.get("id"));
  const patch: Record<string, unknown> = {};
  if (data.has("price")) {
    const raw = String(data.get("price") ?? "").trim();
    const p = raw ? parseMoney(raw) : null;
    if (raw && p == null) return { error: "Valor inválido." };
    patch.price_cents = p;
  }
  for (const k of ["booking_trial", "postpaid", "requires_evolution"]) if (data.has(`${k}_present`)) patch[k] = data.get(k) === "on";
  if (data.has("start_mode")) patch.start_mode = data.get("start_mode") === "sequencia" ? "sequencia" : "meia";
  if (data.has("discounts_present")) {
    const fam = data.get("family_on") === "on" ? num(data.get("family_discount_pct")) : null;
    const pun = data.get("punctual_on") === "on" ? num(data.get("punctual_discount_pct")) : null;
    for (const v of [fam, pun]) if (v != null && !(v > 0 && v <= 100)) return { error: "O desconto precisa ser entre 1% e 100%." };
    patch.family_discount_pct = fam;
    patch.punctual_discount_pct = pun;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("services").update(patch as never).eq("id", id);
  if (error) return { error: friendlyError(error) };
  done(id);
  return { ok: "Salvo." };
}

/** Regras de falta, aviso, remarcação e reposição do serviço. */
export async function saveServiceRules(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const id = String(data.get("id"));
  const hours = num(data.get("cancel_notice_hours"));
  if (hours != null && !(hours >= 0 && hours <= 72)) return { error: "O prazo precisa ser entre 0 e 72 horas." };
  const pick = <T extends string>(k: string, opts: readonly T[], def: T) => (opts.includes(String(data.get(k)) as T) ? (String(data.get(k)) as T) : def);
  const mdays = num(data.get("makeup_days"));
  if (mdays != null && !(mdays >= 1 && mdays <= 365)) return { error: "A validade da reposição precisa ser entre 1 e 365 dias." };
  const patch = {
    cancel_notice_hours: hours,
    early_eve: data.get("early_eve") === "on",
    self_cancel: data.get("self_cancel") === "on",
    self_reschedule: data.get("self_reschedule") === "on",
    reschedule_max_month: Math.max(0, Math.min(30, num(data.get("reschedule_max_month")) ?? 0)),
    late_reschedule: pick("late_reschedule", ["falta", "bloqueia", "deixa"] as const, "falta"),
    noshow_rule: pick("noshow_rule", ["perde_comissao", "so_falta", "perde_sem_comissao"] as const, "perde_sem_comissao"),
    notice_rule: pick("notice_rule", ["credito", "perde", "nao_perde"] as const, "credito"),
    makeup_days: mdays,
    makeup_max_month: Math.max(0, Math.min(30, num(data.get("makeup_max_month")) ?? 0)),
    requires_evolution: data.get("requires_evolution") === "on",
    rules_reviewed: true,
  };
  const supabase = await createClient();
  const { error } = await supabase.from("services").update(patch as never).eq("id", id);
  if (error) return { error: friendlyError(error) };
  done(id);
  return { ok: "Regras salvas. Já valem na chamada e no app do aluno." };
}

/** Uma linha da tabela de mensalidade: mesma frequência/formato, um produto por ciclo (mensal, tri, sem, anual). Vazio = não vende. */
export async function savePlanRow(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const serviceId = String(data.get("service_id"));
  const perWeek = Number(data.get("sessions_per_week"));
  const format = data.get("format") === "individual" ? "individual" : "grupo";
  const perMonth = num(data.get("classes_per_month"));
  if (!(perWeek >= 1 && perWeek <= 7)) return { error: "Escolha quantas vezes por semana." };
  if (perMonth != null && !(perMonth >= 1 && perMonth <= 60)) return { error: "Aulas por mês inválido." };
  const prices = Object.fromEntries(CYCLES.map((c) => [c, String(data.get(`p${c}`) ?? "").trim()]));
  if (!prices[1]) return { error: "O valor mensal é obrigatório." };
  const supabase = await createClient();
  const { data: svc } = await supabase.from("services").select("name").eq("id", serviceId).single();
  const { data: existing } = await supabase
    .from("products")
    .select("id, cycle_months, active")
    .eq("service_id", serviceId)
    .eq("kind", "plano")
    .eq("sessions_per_week", perWeek)
    .eq("format" as never, format);
  const label: Record<number, string> = { 1: "", 3: " · trimestral", 6: " · semestral", 12: " · anual" };
  for (const c of CYCLES) {
    const raw = prices[c];
    const cents = raw ? parseMoney(raw) : null;
    if (raw && cents == null) return { error: "Algum valor está inválido." };
    const cur = ((existing ?? []) as { id: string; cycle_months: number; active: boolean }[]).find((e) => e.cycle_months === c);
    const name = `${svc?.name ?? "Plano"} ${perWeek}x${format === "individual" ? " individual" : ""}${label[c]}`;
    if (cents != null) {
      const values = { name, kind: "plano" as const, price_cents: cents, service_id: serviceId, sessions_per_week: perWeek, active: true, cycle_months: c, format, classes_per_month: perMonth };
      const r = cur
        ? await supabase.from("products").update(values as never).eq("id", cur.id)
        : await supabase.from("products").insert({ ...values, clinic_id: ctx.clinicId } as never);
      if (r.error) return { error: friendlyError(r.error) };
    } else if (cur?.active) {
      await supabase.from("products").update({ active: false }).eq("id", cur.id); // para de vender (quem já comprou continua)
    }
  }
  done(serviceId);
  if (data.get("close") === "1") redirect(`/catalogo?s=${serviceId}&aba=precos&b=mensal&salvo=${Date.now()}`);
  return { ok: "Plano salvo." };
}

/** Profissionais que fazem o serviço (marca/desmarca a partir do serviço). */
export async function saveServicePros(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const serviceId = String(data.get("service_id"));
  const wanted = new Set(data.getAll("pro").map(String));
  const supabase = await createClient();
  const [{ data: pros }, { data: links }, { data: services }] = await Promise.all([
    supabase.from("professionals").select("id").eq("clinic_id", ctx.clinicId).eq("active", true),
    supabase.from("professional_services" as never).select("professional_id, service_id").eq("clinic_id", ctx.clinicId),
    supabase.from("services").select("id").eq("clinic_id", ctx.clinicId).eq("active", true),
  ]);
  const L = (links ?? []) as { professional_id: string; service_id: string }[];
  for (const p of pros ?? []) {
    const mine = L.filter((l) => l.professional_id === p.id);
    const doesAll = mine.length === 0;
    const does = doesAll || mine.some((l) => l.service_id === serviceId);
    if (wanted.has(p.id) && !does) {
      await supabase.from("professional_services" as never).insert({ clinic_id: ctx.clinicId, professional_id: p.id, service_id: serviceId } as never);
    } else if (!wanted.has(p.id) && does) {
      if (doesAll) {
        // fazia tudo: passa a fazer todos os outros serviços, menos este
        const rows = (services ?? []).filter((s) => s.id !== serviceId).map((s) => ({ clinic_id: ctx.clinicId, professional_id: p.id, service_id: s.id }));
        if (rows.length) await supabase.from("professional_services" as never).insert(rows as never);
      } else {
        await supabase.from("professional_services" as never).delete().eq("professional_id", p.id).eq("service_id", serviceId);
      }
    }
  }
  done(serviceId);
  revalidatePath("/equipe", "layout");
  return { ok: "Profissionais salvos." };
}

export async function saveRoom(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const name = String(data.get("name") ?? "").trim();
  const cap = num(data.get("capacity"));
  if (!name) return { error: "Dê um nome para a sala." };
  const supabase = await createClient();
  const { error } = await supabase.from("rooms" as never).insert({ clinic_id: ctx.clinicId, name, capacity: cap } as never);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/catalogo", "layout");
  return { ok: "Sala criada." };
}

export async function archiveRoom(data: FormData) {
  if (!(await admin())) return;
  const supabase = await createClient();
  await supabase.from("rooms" as never).update({ active: false } as never).eq("id", String(data.get("id")));
  revalidatePath("/catalogo", "layout");
}

export async function duplicateService(data: FormData) {
  const ctx = await admin();
  if (!ctx) return;
  const id = String(data.get("id"));
  const supabase = await createClient();
  const { data: s } = await supabase.from("services").select("*").eq("id", id).single();
  if (!s) return;
  const { id: _old, created_at: _c, ...rest } = s as Record<string, unknown>;
  void _old;
  void _c;
  const { data: copy } = await supabase
    .from("services")
    .insert({ ...rest, name: `${s.name} (cópia)`, clinic_id: ctx.clinicId } as never)
    .select("id")
    .single();
  if (!copy) return;
  const { data: prods } = await supabase.from("products").select("*").eq("service_id", id).eq("active", true);
  if (prods?.length) {
    await supabase.from("products").insert(
      prods.map((p) => {
        const { id: _i, created_at: _d, ...r } = p as Record<string, unknown>;
        void _i;
        void _d;
        return { ...r, service_id: copy.id };
      }) as never,
    );
  }
  revalidatePath("/catalogo", "layout");
  redirect(`/catalogo?s=${copy.id}`);
}

/** Excluir só se nunca foi usado; senão, arquiva (o histórico continua). */
export async function deleteService(data: FormData) {
  const ctx = await admin();
  if (!ctx) return;
  const id = String(data.get("id"));
  const supabase = await createClient();
  const [{ count: appts }, { count: series }, { count: sold }] = await Promise.all([
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("service_id", id),
    supabase.from("recurring_series").select("id", { count: "exact", head: true }).eq("service_id", id),
    supabase.from("patient_packages").select("id", { count: "exact", head: true }).eq("service_id", id),
  ]);
  if ((appts ?? 0) + (series ?? 0) + (sold ?? 0) > 0) {
    await supabase.from("services").update({ active: false }).eq("id", id);
    revalidatePath("/catalogo", "layout");
    redirect(`/catalogo?s=${id}&arquivado=1`);
  }
  await supabase.from("products").delete().eq("service_id", id);
  await supabase.from("services").delete().eq("id", id);
  revalidatePath("/catalogo", "layout");
  redirect("/catalogo");
}

export async function setStartMode(data: FormData) {
  if (!(await admin())) return;
  const supabase = await createClient();
  await supabase
    .from("services")
    .update({ start_mode: data.get("start_mode") === "sequencia" ? "sequencia" : "meia" } as never)
    .eq("id", String(data.get("id")));
  revalidatePath("/catalogo");
}
