import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { getContext } from "@/lib/context";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createBlock } from "../actions";
import { BlockTimeFields } from "./time-fields";

export const metadata = { title: "Bloquear horário" };

export default async function BloquearPage({ searchParams }: { searchParams: Promise<{ d?: string; pro?: string }> }) {
  const ctx = await getContext();
  const { d, pro } = await searchParams;
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO();
  const supabase = await createClient();
  const { data: pros } = await supabase.from("professionals").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name");
  const mine = !ctx.canManageAgenda && ctx.professionalId;

  return (
    <>
      <PageHeader
        title="Bloquear horário"
        description="Folga, reunião, curso ou feriado. Ninguém consegue marcar nesse período pelo agendamento online."
        back={{ href: `/agenda?d=${day}`, label: "Hoje" }}
      />
      <Card className="p-5 sm:p-7">
        <ActionForm action={createBlock}>
          <Field label="De quem">
            <Select name="professional_id" defaultValue={mine ? ctx.professionalId! : (pro ?? "")}>
              {ctx.canManageAgenda && <option value="">Clínica toda (feriado, recesso)</option>}
              {(pros ?? [])
                .filter((p) => ctx.canManageAgenda || p.id === ctx.professionalId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Dia">
            <Input name="date" type="date" required defaultValue={day} />
          </Field>
          <BlockTimeFields />
          <Field label="Motivo (opcional)">
            <Input name="reason" maxLength={120} placeholder="Ex.: Feriado, curso, consulta médica" />
          </Field>
          <SubmitButton full pendingText="Bloqueando…">
            Bloquear
          </SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
