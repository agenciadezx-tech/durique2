import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PatientPicker } from "@/components/patient-picker";
import { Card, EmptyState, Field, Input, LinkButton, PageHeader } from "@/components/ui";
import { ServiceProFields } from "@/components/service-pro-fields";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { createAppointment } from "../actions";

export const metadata = { title: "Agendar" };

export default async function NovaSessaoPage({ searchParams }: { searchParams: Promise<{ d?: string; pro?: string; h?: string; tipo?: string; paciente?: string }> }) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/agenda");
  const { d, pro, h, tipo, paciente } = await searchParams;
  const hour = h && /^\d{2}:\d{2}$/.test(h) ? h : "08:00";
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO();
  const supabase = await createClient();
  const [{ data: services }, { data: pros }, { data: patients }, { data: ps }] = await Promise.all([
    supabase.from("services").select("id, name, kind").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("professionals").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("patients").select("id, name, phone").eq("clinic_id", ctx.clinicId).eq("active", true).order("name").limit(2000),
    supabase.from("professional_services" as never).select("professional_id, service_id").eq("clinic_id", ctx.clinicId),
  ]);
  const links = (ps ?? []) as { professional_id: string; service_id: string }[];
  const prosWith = (pros ?? []).map((p) => ({ ...p, services: links.filter((l) => l.professional_id === p.id).map((l) => l.service_id) }));

  return (
    <>
      <PageHeader
        title={tipo === "experimental" ? "Aula experimental" : tipo === "aula" ? "Agendar aula" : "Nova consulta"}
        description={tipo === "experimental" ? "Marque a primeira aula de quem ainda não é aluno. Cadastre a pessoa antes em Pacientes, se for nova." : "Uma consulta ou um atendimento avulso. Para algo que se repete toda semana, crie uma turma em Turmas."}
        back={{ href: `/agenda?d=${day}`, label: "Agenda" }}
      />
      {!pros?.length || !services?.length ? (
        <EmptyState
          title={!pros?.length ? "Cadastre um profissional primeiro" : "Cadastre um serviço primeiro"}
          text={!pros?.length ? "Leva 10 segundos, em Mais › Equipe." : "Leva 10 segundos, no Catálogo."}
          action={<LinkButton href={!pros?.length ? "/equipe" : "/catalogo"}>{!pros?.length ? "Ir para Equipe" : "Ir para o Catálogo"}</LinkButton>}
        />
      ) : (
        <Card className="p-5 sm:p-7">
          <ActionForm action={createAppointment}>
            <Field label="Paciente" hint="Busque pelo nome ou telefone. Se for a primeira vez, toque em “Cadastrar paciente novo”.">
              <PatientPicker patients={patients ?? []} initialId={paciente} allowNew />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <ServiceProFields
                services={services}
                pros={prosWith}
                defaultService={services.find((s) => s.kind === (tipo === "aula" ? "turma" : "individual"))?.id ?? services[0]?.id}
                defaultPro={pro}
              />
              <Field label="Dia">
                <Input name="date" type="date" required defaultValue={day} />
              </Field>
              <Field label="Horário">
                <Input name="time" type="time" required step={300} defaultValue={hour} />
              </Field>
            </div>
            <SubmitButton full pendingText="Marcando…">
              Marcar sessão
            </SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
