"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/forms";
import { getContext } from "@/lib/context";
import { friendlyError, normalizePhone, parseMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const NOT_ADMIN = { error: "Somente o administrador configura a clínica." };
/** Vai para o próximo passo; aberto pelas Configurações (so=1), volta para lá. */
const next = (n: number, data?: FormData) => redirect(data?.get("so") ? "/ajustes?salvo=1" : `/configurar?passo=${n}`);

async function admin() {
  const ctx = await getContext();
  return ctx.isAdmin ? ctx : null;
}

// 1 · Como você trabalha
export async function saveType(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const t = String(data.get("practice_type"));
  if (!["fisio", "aulas", "ambos"].includes(t)) return { error: "Escolha uma das opções." };
  const supabase = await createClient();
  const { error } = await supabase.from("clinics").update({ practice_type: t }).eq("id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  next(2);
  return {};
}

// 2 · Pacientes à mão
export async function addQuickPatient(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  const name = String(data.get("name") ?? "").trim();
  const raw = String(data.get("phone") ?? "").trim();
  const phone = normalizePhone(raw);
  if (!name) return { error: "Informe o nome." };
  if (raw && !phone) return { error: "WhatsApp inválido. Use DDD + número." };
  const supabase = await createClient();
  const { error } = await supabase.from("patients").insert({ clinic_id: ctx.clinicId, name, phone });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/configurar");
  return { ok: `${name} foi cadastrado.` };
}

// 4 · Horários
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export async function saveHours(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const days = data.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  const opens = String(data.get("opens") ?? "");
  const closes = String(data.get("closes") ?? "");
  const minutes = Number(data.get("session_minutes"));
  if (!days.length) return { error: "Marque pelo menos um dia de atendimento." };
  if (!TIME.test(opens) || !TIME.test(closes) || closes <= opens) return { error: "O fechamento precisa ser depois da abertura." };
  if (!(minutes >= 10 && minutes <= 240)) return { error: "Escolha a duração da sessão." };
  const rows = days.map((d) => {
    const o = String(data.get(`o_${d}`) ?? "") || opens;
    const c = String(data.get(`c_${d}`) ?? "") || closes;
    return { clinic_id: ctx.clinicId, weekday: d, opens: o, closes: c };
  });
  if (rows.some((r) => !TIME.test(r.opens) || !TIME.test(r.closes) || r.closes <= r.opens))
    return { error: "Confira os horários diferentes: o fechamento precisa ser depois da abertura." };
  const supabase = await createClient();
  const { error } = await supabase.from("clinic_hours").upsert(rows, { onConflict: "clinic_id,weekday" });
  if (error) return { error: friendlyError(error) };
  await supabase.from("clinic_hours").delete().eq("clinic_id", ctx.clinicId).not("weekday", "in", `(${days.join(",")})`);
  await supabase.from("clinics").update({ session_minutes: minutes }).eq("id", ctx.clinicId);
  // Profissionais ainda sem horário de atendimento recebem o horário da clínica (base do agendamento online)
  const [{ data: pros }, { data: avail }] = await Promise.all([
    supabase.from("professionals").select("id").eq("clinic_id", ctx.clinicId).eq("active", true),
    supabase.from("availability").select("professional_id").eq("clinic_id", ctx.clinicId),
  ]);
  const has = new Set((avail ?? []).map((a) => a.professional_id));
  const fresh = (pros ?? []).filter((p) => !has.has(p.id));
  if (fresh.length) {
    await supabase.from("availability").insert(
      fresh.flatMap((p) => rows.map((r) => ({ clinic_id: ctx.clinicId, professional_id: p.id, weekday: r.weekday, start_time: r.opens, end_time: r.closes }))),
    );
  }
  next(5, data);
  return {};
}

// 5 · Serviços e valores
type Row = { id?: string; name: string; kind: "individual" | "turma"; duration: number; price: string; remove?: boolean };
export async function saveServices(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  let rows: Row[] = [];
  try {
    rows = JSON.parse(String(data.get("rows") ?? "[]"));
  } catch {
    return { error: "Não foi possível ler a lista. Tente de novo." };
  }
  const capacity = Number(data.get("capacity")) || 0;
  const keep = rows.filter((r) => !r.remove);
  if (!keep.length) return { error: "Deixe pelo menos um serviço." };
  for (const r of keep) {
    if (!r.name.trim()) return { error: "Todo serviço precisa de nome." };
    if (!(r.duration >= 5 && r.duration <= 480)) return { error: `Confira a duração de “${r.name}”.` };
  }
  if (keep.some((r) => r.kind === "turma") && !(capacity >= 1 && capacity <= 50)) return { error: "Informe quantas vagas tem cada turma (1 a 50)." };
  const supabase = await createClient();
  for (const r of rows) {
    if (r.remove) {
      if (r.id) await supabase.from("services").update({ active: false }).eq("id", r.id);
      continue;
    }
    const values = {
      name: r.name.trim().slice(0, 80),
      kind: r.kind,
      duration_min: Math.round(r.duration),
      default_capacity: r.kind === "turma" ? capacity : 1,
      price_cents: parseMoney(r.price),
      active: true,
    };
    const { error } = r.id
      ? await supabase.from("services").update(values).eq("id", r.id)
      : await supabase.from("services").insert({ ...values, clinic_id: ctx.clinicId });
    if (error) return { error: friendlyError(error) };
  }
  revalidatePath("/catalogo");
  next(6);
  return {};
}

// 6 · Dados da clínica
export async function saveProfile(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const name = String(data.get("name") ?? "").trim();
  const digits = (k: string) => String(data.get(k) ?? "").replace(/\D/g, "");
  const cep = digits("cep");
  const cnpj = digits("cnpj");
  if (!name) return { error: "Informe o nome da clínica." };
  if (cep && cep.length !== 8) return { error: "O CEP tem 8 números." };
  if (cnpj && cnpj.length !== 14) return { error: "O CNPJ tem 14 números." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      name,
      cep: cep || null,
      address: String(data.get("address") ?? "").trim().slice(0, 200) || null,
      cnpj: cnpj || null,
      legal_responsible: String(data.get("legal_responsible") ?? "").trim().slice(0, 120) || null,
      responsible_crefito: String(data.get("responsible_crefito") ?? "").trim().slice(0, 30) || null,
    })
    .eq("id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  next(7, data);
  return {};
}

// 7 · Página da clínica
export async function saveLink(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const slug = String(data.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const enabled = data.get("enabled") === "on";
  if (enabled && !/^[a-z0-9-]{3,40}$/.test(slug)) return { error: "O endereço precisa ter de 3 a 40 letras ou números." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({ booking_slug: slug || null, booking_enabled: enabled })
    .eq("id", ctx.clinicId);
  if (error) return { error: error.code === "23505" ? "Esse endereço já está em uso por outra clínica. Escolha outro." : friendlyError(error) };
  if (enabled) {
    const { count } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId).eq("bookable", true);
    if (!count) await supabase.from("services").update({ bookable: true }).eq("clinic_id", ctx.clinicId).eq("active", true);
  }
  revalidatePath("/ajustes/agendamento-online");
  next(8);
  return {};
}

// 8 · Equipe
export async function addTeamMember(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await admin();
  if (!ctx) return NOT_ADMIN;
  const name = String(data.get("name") ?? "").trim();
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const role = String(data.get("role") ?? "");
  if (!name) return { error: "Informe o nome." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Informe um e-mail válido." };
  if (!["admin", "recepcao", "profissional", "financeiro"].includes(role)) return { error: "Escolha a função." };
  const supabase = await createClient();
  let professionalId: string | null = null;
  if (role === "profissional") {
    const { data: pro, error } = await supabase.from("professionals").insert({ clinic_id: ctx.clinicId, name, email }).select("id").single();
    if (error) return { error: friendlyError(error) };
    professionalId = pro.id;
  }
  const { error } = await supabase.from("invites").insert({ clinic_id: ctx.clinicId, email, role: role as "admin", professional_id: professionalId });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/configurar");
  return { ok: `Convite para ${name} criado. Envie o link abaixo.` };
}

export async function dismissSetup() {
  const ctx = await admin();
  if (ctx) {
    const supabase = await createClient();
    await supabase.from("clinics").update({ setup_dismissed: true }).eq("id", ctx.clinicId);
  }
  redirect("/agenda");
}

export async function finishSetup() {
  const ctx = await admin();
  if (ctx) {
    const supabase = await createClient();
    await supabase.from("clinics").update({ setup_completed_at: new Date().toISOString() }).eq("id", ctx.clinicId);
  }
  redirect("/agenda?pronto=1");
}
