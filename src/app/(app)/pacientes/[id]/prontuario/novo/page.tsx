import { notFound, redirect } from "next/navigation";
import { Alert, Card, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { createRecord } from "../actions";
import { aiEnabled } from "@/lib/ai";
import { RecordForm } from "../record-form";
import { PreAnswers } from "@/components/pre-answers";

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
  const { data: pre } =
    kind === "avaliacao"
      ? await supabase
          .from("pre_assessments")
          .select("answers, config, answered_at")
          .eq("patient_id", id)
          .not("answered_at", "is", null)
          .order("answered_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  return (
    <>
      <PageHeader
        title={kind === "avaliacao" ? "Avaliação" : "Evolução da sessão"}
        description={patient.name}
        back={{ href: `/pacientes/${id}/prontuario`, label: "Prontuário" }}
      />
      {!ctx.professionalId ? (
        <Alert tone="info">
          Para escrever no prontuário, seu usuário precisa estar ligado a um profissional. Em Configurações → Profissionais, o administrador faz essa ligação.
        </Alert>
      ) : (
        <>
          {pre && (
            <details className="mb-4 rounded-2xl border border-info/30 bg-info-soft/40" open>
              <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium text-info">
                O que o paciente respondeu na pré-avaliação
              </summary>
              <div className="border-t border-info/20 px-4 py-4">
                <PreAnswers
                  answers={(pre.answers ?? {}) as Record<string, unknown>}
                  questions={((pre.config as { questions?: { id: string; label: string }[] } | null)?.questions ?? [])}
                />
              </div>
            </details>
          )}
        <Card className="p-5 sm:p-7">
          <RecordForm aiOn={aiEnabled()} action={createRecord} kind={kind} patientId={id} attendeeId={sp.sessao} today={todayISO()} />
        </Card>
        </>
      )}
    </>
  );
}
