import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createPatient } from "../actions";
import { PatientFields } from "../patient-fields";

export const metadata = { title: "Novo paciente" };

export default async function NovoPacientePage() {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/pacientes");
  return (
    <>
      <PageHeader title="Novo paciente" back={{ href: "/pacientes", label: "Pacientes" }} />
      <Card className="p-5 sm:p-7">
        <ActionForm action={createPatient}>
          <PatientFields />
          <div className="pt-1">
            <SubmitButton full>Salvar paciente</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
