import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SETUP_STEPS } from "@/lib/setup";

/** Lembrete do assistente "Configurar clínica" na tela Hoje (só admin), até concluir ou dispensar. */
export async function FirstSteps({ clinicId }: { clinicId: string }) {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [{ data: clinic }, patients, hours, services, wa, members, invites] = await Promise.all([
    supabase.from("clinics").select("practice_type, address, cnpj, cep, booking_enabled, setup_completed_at, setup_dismissed").eq("id", clinicId).single(),
    supabase.from("patients").select("id", head).eq("clinic_id", clinicId),
    supabase.from("clinic_hours").select("weekday", head).eq("clinic_id", clinicId),
    supabase.from("services").select("id", head).eq("clinic_id", clinicId).eq("active", true).not("price_cents", "is", null),
    supabase.from("whatsapp_settings").select("connected").eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("members").select("id", head).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("invites").select("id", head).eq("clinic_id", clinicId),
  ]);
  if (!clinic || clinic.setup_completed_at || clinic.setup_dismissed) return null;
  const done: Record<number, boolean> = {
    1: !!clinic.practice_type,
    2: (patients.count ?? 0) > 0,
    3: !!wa.data?.connected,
    4: (hours.count ?? 0) > 0,
    5: (services.count ?? 0) > 0,
    6: !!(clinic.address || clinic.cnpj || clinic.cep),
    7: !!clinic.booking_enabled,
    8: (members.count ?? 0) > 1 || (invites.count ?? 0) > 0,
  };
  const n = SETUP_STEPS.filter((s) => done[s.n]).length;
  const next = SETUP_STEPS.find((s) => !done[s.n]);
  return (
    <Link
      href={`/configurar?passo=${next?.n ?? "fim"}`}
      className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-accent/30 bg-accent-soft/50 px-4 py-3 hover:bg-accent-soft"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-accent">
          Configurar clínica · {n} de {SETUP_STEPS.length}
        </span>
        <span className="block text-[15px]">{next ? `Próximo: ${next.title}` : "Falta só revisar e concluir"}</span>
      </span>
      <span className="order-last h-2 w-full overflow-hidden rounded-full bg-surface sm:order-none sm:w-28">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${(n / SETUP_STEPS.length) * 100}%` }} />
      </span>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
        Continuar <ArrowRight size={16} />
      </span>
    </Link>
  );
}
