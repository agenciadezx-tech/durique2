import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cx } from "./ui";

/** Primeiros passos: aparece para o administrador até a clínica ficar pronta para usar. */
export async function FirstSteps({ clinicId }: { clinicId: string }) {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [pros, services, products, patients, avail, series, settings, clinic] = await Promise.all([
    supabase.from("professionals").select("id", head).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("services").select("id", head).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("products").select("id", head).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("patients").select("id", head).eq("clinic_id", clinicId),
    supabase.from("availability").select("id", head).eq("clinic_id", clinicId),
    supabase.from("recurring_series").select("id", head).eq("clinic_id", clinicId),
    supabase.from("clinic_settings").select("pix_key").eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("clinics").select("booking_enabled").eq("id", clinicId).maybeSingle(),
  ]);
  const steps = [
    { done: (pros.count ?? 0) > 0, title: "Cadastre os profissionais", href: "/ajustes#profissionais" },
    { done: (services.count ?? 0) > 0, title: "Crie os serviços (consultas e aulas)", href: "/catalogo" },
    { done: (products.count ?? 0) > 0, title: "Monte pacotes e planos com preço", href: "/catalogo" },
    { done: (avail.count ?? 0) > 0 || (series.count ?? 0) > 0, title: "Defina horários de atendimento ou turmas", href: "/ajustes/agendamento-online" },
    { done: (patients.count ?? 0) > 0, title: "Cadastre ou importe os pacientes", href: "/pacientes" },
    { done: !!settings.data?.pix_key, title: "Coloque a chave Pix para receber", href: "/ajustes#pix" },
    { done: !!clinic.data?.booking_enabled, title: "Ligue o link da clínica (agendamento online)", href: "/ajustes/agendamento-online" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <details className="group mb-5 rounded-2xl border border-accent/30 bg-accent-soft/50">
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-accent">
            Primeiros passos · {done} de {steps.length}
          </span>
          <span className="block text-[15px]">Próximo: {next.title}</span>
        </span>
        <span className="order-last h-2 w-full overflow-hidden rounded-full bg-surface sm:order-none sm:w-28">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${(done / steps.length) * 100}%` }} />
        </span>
        <span className="text-sm text-muted group-open:hidden">Ver tudo</span>
        <span className="hidden text-sm text-muted group-open:inline">Fechar</span>
      </summary>
      <ol className="space-y-1 border-t border-accent/20 px-2 py-2">
        {steps.map((s, i) => (
          <li key={i}>
            <Link href={s.href} className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface">
              <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold", s.done ? "bg-ok text-white" : "border border-line bg-surface text-muted")}>
                {s.done ? <Check size={15} /> : i + 1}
              </span>
              <span className={cx("flex-1 text-[15px]", s.done && "text-muted line-through")}>{s.title}</span>
              {!s.done && <ArrowRight size={16} className="text-accent" />}
            </Link>
          </li>
        ))}
      </ol>
    </details>
  );
}
