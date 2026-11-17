import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PatientPicker } from "@/components/patient-picker";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { startEnrollment } from "../actions";

export const metadata = { title: "Nova matrícula" };

/** Nova matrícula: escolhe (ou cadastra) o aluno e segue para os passos de plano e turma. */
export default async function MatriculaPage({ searchParams }: { searchParams: Promise<{ tipo?: string; aula?: string }> }) {
  const ctx = await getContext();
  const { tipo, aula } = await searchParams;
  const exp = tipo === "experimental";
  if (!ctx.canManageAgenda) redirect("/horarios");
  const supabase = await createClient();
  const { data: patients } = await supabase.from("patients").select("id, name, phone").eq("clinic_id", ctx.clinicId).eq("active", true).order("name").limit(2000);
  return (
    <>
      <PageHeader
        title={exp ? "Aula experimental" : "Nova matrícula"}
        description={exp ? "Quem vem conhecer: escolha ou cadastre a pessoa. Depois a aula e se é grátis." : "Primeiro o aluno; depois plano, turmas e pagamento."}
        back={{ href: "/horarios", label: "Turmas" }}
      />
      <Card className="p-5 sm:p-7">
        <ActionForm action={startEnrollment}>
          <input type="hidden" name="tipo" value={exp ? "experimental" : "plano"} />
          {aula && <input type="hidden" name="aula" value={aula} />}
          <p className="text-[14px] font-semibold text-accent">{exp ? "Quem vem conhecer?" : "Quem vai fazer aula?"}</p>
          <PatientPicker patients={patients ?? []} allowNew />
          <SubmitButton full pendingText="Abrindo…">
            Continuar
          </SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
