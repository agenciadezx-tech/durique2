import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { buildCarneLeao, CARNE_LEAO_MAX_LINES } from "@/lib/carne-leao";
import { monthRange, todayISO } from "@/lib/format";
import { buildAccountantWorkbook, SHEETS, type SheetKey, type Tx } from "@/lib/accountant";
import { loadAttendances, readFilters } from "@/lib/attendances";
import { ATTENDEE_LABEL, type AttendeeStatus } from "@/components/status";

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

  // Planilha do contador (.xlsx com várias abas)
  if (tipo === "contador" && ctx.canSeeExpenses) {
    const sp = req.nextUrl.searchParams;
    const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    let from: string, to: string;
    if (sp.get("modo") === "intervalo" && iso(sp.get("de")) && iso(sp.get("ate"))) {
      from = iso(sp.get("de"))!;
      to = iso(sp.get("ate"))!;
      if (from > to) [from, to] = [to, from];
    } else {
      const mes = /^\d{4}-\d{2}$/.test(sp.get("mes") ?? "") ? sp.get("mes")! : todayISO().slice(0, 7);
      ({ from, to } = monthRange(mes));
    }
    const pro = /^[0-9a-f-]{36}$/.test(sp.get("pro") ?? "") ? sp.get("pro")! : null;
    const sheets = sp.getAll("aba").filter((k): k is SheetKey => SHEETS.some((x) => x.key === k));
    const methods = sp.getAll("forma");
    let q = supabase
      .from("transactions")
      .select("type, description, amount_cents, due_date, paid_on, payment_method, professional_id, categories(name, system_key), patients(name, cpf, phone), professionals(name)")
      .eq("clinic_id", ctx.clinicId)
      .or(`and(paid_on.gte.${from},paid_on.lte.${to}),and(due_date.gte.${from},due_date.lte.${to})`)
      .limit(20000);
    if (pro) q = q.eq("professional_id", pro);
    const { data } = await q;
    let txs = (data ?? []) as unknown as Tx[];
    if (methods.length) txs = txs.filter((t) => (t.payment_method ? methods.includes(t.payment_method) : methods.includes("nao_informada")));
    const [{ data: clinic }, { data: proRow }] = await Promise.all([
      supabase.from("clinics").select("name, brand_color").eq("id", ctx.clinicId).single(),
      pro ? supabase.from("professionals").select("name").eq("id", pro).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const buf = await buildAccountantWorkbook({
      clinic: clinic?.name ?? ctx.clinicName,
      from,
      to,
      professional: proRow?.name ?? null,
      sheets: sheets.length ? sheets : SHEETS.map((x) => x.key),
      txs,
      today: todayISO(),
      color: clinic?.brand_color ?? "#0f766e",
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contador-${from}-a-${to}.xlsx"`,
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
  } else if (tipo === "atendimentos" && ctx.role !== "profissional") {
    const f = readFilters(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const rows = await loadAttendances(supabase, ctx.clinicId, f);
    body = csv(
      ["Data", "Hora", "Paciente", "Serviço", "Tipo", "Profissional", "Situação", "Reposição", "Vem por"],
      rows.map((r) => {
        const d = new Date(r.appointments.starts_at);
        const aula = r.appointments.services?.kind === "turma" || r.appointments.capacity > 1;
        return [
          d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
          d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
          r.patients?.name,
          r.appointments.services?.name,
          aula ? "Aula" : "Consulta",
          r.appointments.professionals?.name,
          ATTENDEE_LABEL[r.status as AttendeeStatus] ?? r.status,
          r.is_makeup ? "sim" : "não",
          r.patients?.access_via === "wellhub" ? "Wellhub" : r.patients?.access_via === "totalpass" ? "TotalPass" : "",
        ];
      }),
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
