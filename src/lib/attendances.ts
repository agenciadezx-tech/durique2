import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysISO, monthRange, todayISO, TZ_OFFSET } from "@/lib/format";

/** Filtros da tela "Atendimentos realizados" (também usados no CSV). */
export type AttFilters = { de: string; ate: string; pro: string; servico: string; tipo: "" | "consultas" | "aulas"; sit: "veio" | "faltou" | "todos" };

export const SIT_STATUSES: Record<AttFilters["sit"], string[]> = {
  veio: ["presente"],
  faltou: ["falta", "desmarcado_fora_prazo"],
  todos: ["presente", "falta", "desmarcado_fora_prazo", "desmarcado_no_prazo"],
};

const iso = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function readFilters(sp: Record<string, string | undefined>): AttFilters {
  const m = monthRange(todayISO().slice(0, 7));
  let de = iso(sp.de) ?? m.from;
  let ate = iso(sp.ate) ?? todayISO();
  if (de > ate) [de, ate] = [ate, de];
  if (addDaysISO(de, 400) < ate) de = addDaysISO(ate, -400);
  return {
    de,
    ate,
    pro: /^[0-9a-f-]{36}$/.test(sp.pro ?? "") ? sp.pro! : "",
    servico: /^[0-9a-f-]{36}$/.test(sp.servico ?? "") ? sp.servico! : "",
    tipo: sp.tipo === "consultas" || sp.tipo === "aulas" ? sp.tipo : "",
    sit: sp.sit === "faltou" || sp.sit === "todos" ? sp.sit : "veio",
  };
}

export type AttRow = {
  id: string;
  status: string;
  is_makeup: boolean;
  patients: { id: string; name: string; access_via: string | null } | null;
  appointments: {
    id: string;
    starts_at: string;
    capacity: number;
    services: { id: string; name: string; kind: string } | null;
    professionals: { id: string; name: string } | null;
  };
};

export async function loadAttendances(supabase: SupabaseClient, clinicId: string, f: AttFilters): Promise<AttRow[]> {
  let q = supabase
    .from("appointment_attendees")
    .select(
      "id, status, is_makeup, patients(id, name, access_via), appointments!inner(id, starts_at, capacity, status, professional_id, service_id, services(id, name, kind), professionals(id, name))",
    )
    .eq("clinic_id", clinicId)
    .in("status", SIT_STATUSES[f.sit])
    .eq("appointments.status", "agendado")
    .gte("appointments.starts_at", `${f.de}T00:00:00${TZ_OFFSET}`)
    .lt("appointments.starts_at", `${addDaysISO(f.ate, 1)}T00:00:00${TZ_OFFSET}`)
    .limit(5000);
  if (f.pro) q = q.eq("appointments.professional_id", f.pro);
  if (f.servico) q = q.eq("appointments.service_id", f.servico);
  const { data } = await q;
  let rows = (data ?? []) as unknown as AttRow[];
  const isAula = (r: AttRow) => r.appointments.services?.kind === "turma" || r.appointments.capacity > 1;
  if (f.tipo === "aulas") rows = rows.filter(isAula);
  if (f.tipo === "consultas") rows = rows.filter((r) => !isAula(r));
  return rows.sort((a, b) => b.appointments.starts_at.localeCompare(a.appointments.starts_at));
}
