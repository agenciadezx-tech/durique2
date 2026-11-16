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
    supabase.from("professionals").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
  ]);

  return (
    <>
      <PageHeader title="Nova turma" back={{ href: "/horarios", label: "Turmas" }} />
      {!pros?.length || !services?.length ? (
        <EmptyState
          title={!pros?.length ? "Cadastre um profissional primeiro" : "Cadastre um serviço primeiro"}
          text="Leva 10 segundos, em Minha clínica."
          action={<LinkButton href="/ajustes">Ir para Minha clínica</LinkButton>}
        />
      ) : (
        <Card className="p-5 sm:p-7">
          <SeriesForm services={services} pros={pros} today={todayISO()} />
        </Card>
      )}
    </>
  );
}
