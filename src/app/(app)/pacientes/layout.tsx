import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatPhone, todayISO } from "@/lib/format";
import { PatientsAside, type AsidePatient } from "./patients-aside";

/** Pacientes no computador: lista à esquerda, ficha à direita. No celular, telas separadas. */
export default async function PacientesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const supabase = await createClient();
  const [{ data: pats }, { data: ps }, { data: svcs }] = await Promise.all([
    supabase.from("patients").select("id, name, phone, summary, birth_date, active").eq("clinic_id", ctx.clinicId).order("name").limit(3000),
    supabase.from("patient_services").select("patient_id, service_id").eq("clinic_id", ctx.clinicId).limit(10000),
    supabase.from("services").select("id, kind").eq("clinic_id", ctx.clinicId),
  ]);
  const kindOf = new Map((svcs ?? []).map((s) => [s.id, s.kind === "turma" ? "aula" : "consulta"] as const));
  const kinds = new Map<string, Set<"consulta" | "aula">>();
  (ps ?? []).forEach((r) => {
    const k = kindOf.get(r.service_id!);
    if (!k) return;
    const set = kinds.get(r.patient_id!) ?? new Set();
    set.add(k);
    kinds.set(r.patient_id!, set);
  });
  const patients: AsidePatient[] = (pats ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone ? formatPhone(p.phone) : null,
    summary: p.summary,
    birth: p.birth_date ? p.birth_date.slice(5) : null,
    active: p.active,
    kinds: [...(kinds.get(p.id) ?? [])],
  }));
  return (
    <div data-split className="lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 border-r border-line bg-surface lg:block print:!hidden">
        <PatientsAside patients={patients} month={todayISO().slice(5, 7)} canAdd={ctx.canManageAgenda} />
      </aside>
      <div className="min-w-0 flex-1 overflow-x-clip px-5 pt-6 pb-28 lg:px-10 lg:pt-10 lg:pb-16">
        <div className="mx-auto w-full max-w-4xl has-[[data-wide]]:max-w-6xl">{children}</div>
      </div>
    </div>
  );
}
