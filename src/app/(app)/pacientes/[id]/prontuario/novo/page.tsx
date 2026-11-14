import { notFound, redirect } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { createRecord } from "../actions";
import { RecordForm } from "../record-form";

export const metadata = { title: "Novo registro" };

export default async function NovoRegistroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string; sessao?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) redirect("/pacientes");
  const { id } = await params;
  const sp = await searchParams;
  const kind = sp.tipo === "avaliacao" ? "avaliacao" : "evolucao";
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("id, name").eq("id", id).maybeSingle();
  if (!patient) notFound();

  return (
    <>
      <PageHeader
        title={kind === "avaliacao" ? "Avaliação" : "Evolução da sessão"}
        description={patient.name}
        back={{ href: `/pacientes/${id}/prontuario`, label: "Prontuário" }}
      />
      {!ctx.professionalId ? (
        <Alert tone="info">
          Para escrever no prontuário, seu usuário precisa estar ligado a um profissional. Em Ajustes → Profissionais, o administrador faz essa ligação.
        </Alert>
      ) : (
        <Card className="p-5 sm:p-7">
          <RecordForm action={createRecord} kind={kind} patientId={id} attendeeId={sp.sessao} today={todayISO()} />
        </Card>
      )}
    </>
  );
}
