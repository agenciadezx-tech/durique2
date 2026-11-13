import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PatientPicker } from "@/components/patient-picker";
import { Card, EmptyState, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { createAppointment } from "../actions";

export const metadata = { title: "Nova sessão" };

export default async function NovaSessaoPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/agenda");
  const { d } = await searchParams;
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO();
  const supabase = await createClient();
  const [{ data: services }, { data: pros }, { data: patients }] = await Promise.all([
    supabase.from("services").select("id, name, kind").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("professionals").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("patients").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name").limit(2000),
  ]);

  return (
    <>
      <PageHeader
        title="Nova sessão"
        description="Para um atendimento avulso. Para turmas que se repetem, use Horários fixos."
        back={{ href: `/agenda?d=${day}`, label: "Agenda" }}
      />
      {!pros?.length || !services?.length ? (
        <EmptyState
          title={!pros?.length ? "Cadastre um profissional primeiro" : "Cadastre um serviço primeiro"}
          text="Leva 10 segundos, em Ajustes."
          action={<LinkButton href="/ajustes">Ir para Ajustes</LinkButton>}
        />
      ) : (
        <Card className="p-5 sm:p-7">
          <ActionForm action={createAppointment}>
            <Field label="Paciente" hint="Pode deixar em branco e adicionar depois.">
              <PatientPicker patients={patients ?? []} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Serviço">
                <Select name="service_id" required defaultValue={services.find((s) => s.kind === "individual")?.id}>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Profissional">
                <Select name="professional_id" required defaultValue={pros.length === 1 ? pros[0].id : ""}>
                  {pros.length !== 1 && <option value="">Escolha…</option>}
                  {pros.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dia">
                <Input name="date" type="date" required defaultValue={day} />
              </Field>
              <Field label="Horário">
                <Input name="time" type="time" required step={300} defaultValue="08:00" />
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
