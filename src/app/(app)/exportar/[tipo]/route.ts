import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { buildCarneLeao, CARNE_LEAO_MAX_LINES } from "@/lib/carne-leao";
import { monthRange } from "@/lib/format";

// Exporta os dados da clínica em CSV (abre no Excel: separador ; e BOM UTF-8)
const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) =>
  "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
const brl = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export async function GET(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const ctx = await getContext();
  const { tipo } = await params;
  const supabase = await createClient();
  let body = "";

  // Carnê-Leão Web: arquivo oficial de importação (ISO-8859-1, ";" e sem cabeçalho)
  if (tipo === "carne-leao" && ctx.canSeeExpenses) {
    const mes = req.nextUrl.searchParams.get("mes") ?? "";
    if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
    const { data: st } = await supabase.from("clinic_settings").select("carne_leao_ocupacao").eq("clinic_id", ctx.clinicId).maybeSingle();
    if (!st?.carne_leao_ocupacao) return NextResponse.json({ error: "Informe o código de ocupação" }, { status: 400 });
    const { from, to } = monthRange(mes);
    const { data } = await supabase
      .from("transactions")
      .select("paid_on, amount_cents, description, patients!inner(name, cpf)")
      .eq("clinic_id", ctx.clinicId)
      .eq("type", "receita")
      .gte("paid_on", from)
      .lte("paid_on", to)
      .order("paid_on");
    type R = { paid_on: string; amount_cents: number; description: string; patients: { name: string; cpf: string | null } };
    const { lines } = buildCarneLeao(
      ((data ?? []) as unknown as R[]).map((r) => ({
        paid_on: r.paid_on,
        amount_cents: r.amount_cents,
        description: r.description,
        patient_name: r.patients.name,
        patient_cpf: r.patients.cpf,
      })),
      st.carne_leao_ocupacao,
    );
    const parts = lines.length ? lines.slice(0, CARNE_LEAO_MAX_LINES) : [];
    return new NextResponse(Buffer.from(parts.join("\r\n") + (parts.length ? "\r\n" : ""), "latin1"), {
      headers: {
        "Content-Type": "text/csv; charset=iso-8859-1",
        "Content-Disposition": `attachment; filename="carne-leao-${mes}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (tipo === "pacientes" && ctx.role !== "profissional") {
    const { data } = await supabase
      .from("patients")
      .select("name, phone, email, cpf, birth_date, notes, active, created_at")
      .eq("clinic_id", ctx.clinicId)
      .order("name");
    body = csv(
      ["Nome", "WhatsApp", "E-mail", "CPF", "Nascimento", "Observações", "Ativo", "Cadastrado em"],
      (data ?? []).map((p) => [p.name, p.phone, p.email, p.cpf, p.birth_date, p.notes, p.active ? "sim" : "não", p.created_at.slice(0, 10)]),
    );
  } else if (tipo === "sessoes") {
    const { data } = await supabase
      .from("appointment_attendees")
      .select("status, is_makeup, patients(name), appointments!inner(starts_at, status, services(name), professionals(name))")
      .eq("clinic_id", ctx.clinicId)
      .limit(20000);
    type R = { status: string; is_makeup: boolean; patients: { name: string } | null; appointments: { starts_at: string; status: string; services: { name: string } | null; professionals: { name: string } | null } };
    const rows = ((data ?? []) as unknown as R[]).sort((a, b) => a.appointments.starts_at.localeCompare(b.appointments.starts_at));
    body = csv(
      ["Data e hora", "Paciente", "Serviço", "Profissional", "Situação do paciente", "Reposição", "Sessão cancelada"],
      rows.map((r) => [
        new Date(r.appointments.starts_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        r.patients?.name,
        r.appointments.services?.name,
        r.appointments.professionals?.name,
        r.status,
        r.is_makeup ? "sim" : "não",
        r.appointments.status === "cancelado" ? "sim" : "não",
      ]),
    );
  } else if (tipo === "financeiro" && ctx.canSeeExpenses) {
    const { data } = await supabase
      .from("transactions")
      .select("type, description, amount_cents, due_date, paid_on, payment_method, categories(name), patients(name)")
      .eq("clinic_id", ctx.clinicId)
      .order("due_date");
    type T = { type: string; description: string; amount_cents: number; due_date: string; paid_on: string | null; payment_method: string | null; categories: { name: string } | null; patients: { name: string } | null };
    body = csv(
      ["Tipo", "Descrição", "Categoria", "Paciente", "Valor (R$)", "Vencimento", "Pago em", "Forma de pagamento"],
      ((data ?? []) as unknown as T[]).map((t) => [t.type, t.description, t.categories?.name, t.patients?.name, brl(t.amount_cents), t.due_date, t.paid_on, t.payment_method]),
    );
  } else {
    return NextResponse.json({ error: "Exportação não disponível" }, { status: 404 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="durique-${tipo}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
