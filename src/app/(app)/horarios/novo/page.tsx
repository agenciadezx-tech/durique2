import { redirect } from "next/navigation";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { SeriesForm } from "./series-form";

export const metadata = { title: "Nova turma" };

export default async function NovoHorarioPage({ searchParams }: { searchParams: Promise<{ servico?: string; dia?: string; h?: string; sala?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/horarios");
  const supabase = await createClient();
  const [{ data: services }, { data: prosRaw }, { data: ps }, { data: rooms }] = await Promise.all([
    supabase.from("services").select("id, name, kind, duration_min, default_capacity").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("professionals").select("id, name, color").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("professional_services" as never).select("professional_id, service_id").eq("clinic_id", ctx.clinicId),
    supabase.from("rooms" as never).select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
  ]);

  const links = (ps ?? []) as { professional_id: string; service_id: string }[];
  const pros = (prosRaw ?? []).map((p) => ({ ...p, services: links.filter((l) => l.professional_id === p.id).map((l) => l.service_id) }));
  return (
    <>
      <PageHeader title="Nova turma" back={{ href: "/horarios", label: "Turmas" }} />
      {!pros?.length || !services?.length ? (
        <EmptyState
          title={!pros?.length ? "Cadastre um profissional primeiro" : "Cadastre um serviço primeiro"}
          text={!pros?.length ? "Leva 10 segundos, em Configurações." : "Leva 10 segundos, no Catálogo."}
          action={<LinkButton href={!pros?.length ? "/equipe" : "/catalogo"}>{!pros?.length ? "Ir para Equipe" : "Ir para o Catálogo"}</LinkButton>}
        />
      ) : (
        <Card className="p-5 sm:p-7">
          <SeriesForm
            services={services}
            pros={pros}
            today={todayISO()}
            rooms={(rooms ?? []) as { id: string; name: string }[]}
            initial={{
              service: sp.servico,
              day: Number(sp.dia) >= 1 && Number(sp.dia) <= 7 ? Number(sp.dia) : undefined,
              start: sp.h && /^\d{2}:\d{2}$/.test(sp.h) ? sp.h : undefined,
              room: sp.sala,
            }}
          />
        </Card>
      )}
    </>
  );
}
