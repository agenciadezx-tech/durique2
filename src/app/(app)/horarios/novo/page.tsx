import { redirect } from "next/navigation";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { SeriesForm } from "./series-form";

export const metadata = { title: "Nova turma" };

export default async function NovoHorarioPage() {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/horarios");
  const supabase = await createClient();
  const [{ data: services }, { data: pros }] = await Promise.all([
    supabase.from("services").select("id, name, kind, duration_min, default_capacity").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("professionals").select("id, name, color").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
  ]);

  return (
    <>
      <PageHeader title="Nova turma" back={{ href: "/horarios", label: "Turmas" }} />
      {!pros?.length || !services?.length ? (
        <EmptyState
          title={!pros?.length ? "Cadastre um profissional primeiro" : "Cadastre um serviço primeiro"}
          text={!pros?.length ? "Leva 10 segundos, em Configurações." : "Leva 10 segundos, no Catálogo."}
          action={<LinkButton href={!pros?.length ? "/ajustes/profissionais" : "/catalogo"}>{!pros?.length ? "Ir para Configurações" : "Ir para o Catálogo"}</LinkButton>}
        />
      ) : (
        <Card className="p-5 sm:p-7">
          <SeriesForm services={services} pros={pros} today={todayISO()} />
        </Card>
      )}
    </>
  );
}
