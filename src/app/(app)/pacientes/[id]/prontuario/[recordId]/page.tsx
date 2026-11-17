import { notFound, redirect } from "next/navigation";
import { PenLine, ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Card, cx, PageHeader, Section, Textarea } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, todayISO, TZ } from "@/lib/format";
import { ASSESSMENT_FIELDS, bmi, bmiLabel, EVOLUTION_FIELDS, painColor } from "@/lib/clinical";
import { BodyMap } from "@/components/body-map";
import { addAddendum, updateRecord } from "../actions";
import { aiEnabled } from "@/lib/ai";
import { RecordForm } from "../record-form";

export const metadata = { title: "Registro do prontuário" };

const KIND_LABEL: Record<string, string> = { avaliacao: "Avaliação", evolucao: "Evolução da sessão", adendo: "Adendo" };
const stamp = (ts: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(ts));

export default async function RegistroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; recordId: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) redirect("/pacientes");
  const { id, recordId } = await params;
  const { salvo } = await searchParams;
  const supabase = await createClient();
  const [{ data: rec }, { data: patient }, { data: addenda }] = await Promise.all([
    supabase.from("clinical_records").select("*, professionals(name, crefito)").eq("id", recordId).maybeSingle(),
    supabase.from("patients").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("clinical_records")
      .select("id, texto, signed_at, signature_hash, professionals(name, crefito)")
      .eq("parent_id", recordId)
      .order("created_at"),
  ]);
  if (!rec || !patient) notFound();
  await supabase.rpc("log_record_access", { p_patient: id, p_action: "abriu registro" });

  const pro = rec.professionals as unknown as { name: string; crefito: string | null } | null;
  const isAuthor = rec.professional_id === ctx.professionalId;
  const signed = !!rec.signed_at;
  const fields = rec.kind === "avaliacao" ? ASSESSMENT_FIELDS : EVOLUTION_FIELDS;
  const regions = Array.isArray(rec.mapa_dor) ? (rec.mapa_dor as string[]) : [];
  const adds = (addenda ?? []) as unknown as { id: string; texto: string; signed_at: string | null; signature_hash: string | null; professionals: { name: string; crefito: string | null } | null }[];

  return (
    <>
      <PageHeader
        title={`${KIND_LABEL[rec.kind]} · ${formatDateShort(rec.record_date)}`}
        description={patient.name}
        back={{ href: `/pacientes/${id}/prontuario`, label: "Prontuário" }}
        action={signed && <PrintButton />}
      />

      <div className="space-y-6">
        {salvo && <Alert tone="ok">{signed ? "Registro salvo e assinado." : "Rascunho salvo. Assine quando terminar."}</Alert>}

        {!signed && isAuthor ? (
          <Card className="p-5 sm:p-7">
            <RecordForm aiOn={aiEnabled()}
              action={updateRecord}
              kind={rec.kind as "avaliacao" | "evolucao"}
              patientId={id}
              recordId={rec.id}
              initial={rec as unknown as Record<string, string>}
              today={todayISO()}
            />
          </Card>
        ) : (
          <Card className="p-5 sm:p-7 print:border-0 print:p-0">
            <div className="mb-5 hidden print:block">
              <p className="text-lg font-semibold">{ctx.clinicName}</p>
              <p>
                Paciente: {patient.name} · {KIND_LABEL[rec.kind]} de {formatDateShort(rec.record_date)}
              </p>
            </div>
            {(rec.peso_kg != null || rec.altura_cm != null || rec.pressao || rec.freq_cardiaca != null || rec.dor_eva != null) && (
              <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  { l: "Dor (EVA)", v: rec.dor_eva != null ? `${rec.dor_eva}/10` : null },
                  { l: "Peso", v: rec.peso_kg != null ? `${String(rec.peso_kg).replace(".", ",")} kg` : null },
                  { l: "Altura", v: rec.altura_cm != null ? `${String(rec.altura_cm).replace(".", ",")} cm` : null },
                  {
                    l: "IMC",
                    v: bmi(rec.peso_kg, rec.altura_cm) != null ? bmi(rec.peso_kg, rec.altura_cm)!.toFixed(1).replace(".", ",") : null,
                    s: bmiLabel(bmi(rec.peso_kg, rec.altura_cm)),
                  },
                  { l: "Pressão", v: rec.pressao },
                  { l: "FC", v: rec.freq_cardiaca != null ? `${rec.freq_cardiaca} bpm` : null },
                ]
                  .filter((x) => x.v)
                  .map((x) => (
                    <div key={x.l} className="rounded-xl border border-line bg-bg/50 px-3 py-2">
                      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{x.l}</p>
                      <p className="text-[18px] font-semibold tabular-nums">{x.v}</p>
                      {"s" in x && x.s && <p className="text-[11px] text-muted">{x.s}</p>}
                    </div>
                  ))}
              </div>
            )}
            {regions.length > 0 && (
              <div className="mb-5 print:hidden">
                <BodyMap value={regions} readOnly />
              </div>
            )}
            <dl className="space-y-4">
              {rec.dor_eva != null && (
                <div>
                  <dt className="text-sm font-medium text-muted">Dor (0 a 10)</dt>
                  <dd>
                    <span className={cx("mt-1 inline-block rounded-full px-2.5 py-0.5 font-semibold", painColor(rec.dor_eva))}>{rec.dor_eva}</span>
                  </dd>
                </div>
              )}
              {regions.length > 0 && (
                <div>
                  <dt className="text-sm font-medium text-muted">Regiões com dor</dt>
                  <dd className="mt-1 text-[15px]">{regions.join(", ")}</dd>
                </div>
              )}
              {fields
                .filter((f) => rec[f.key as keyof typeof rec])
                .map((f) => (
                  <div key={f.key}>
                    <dt className="text-sm font-medium text-muted">{f.label}</dt>
                    <dd className="mt-1 text-[15px] whitespace-pre-wrap">{String(rec[f.key as keyof typeof rec])}</dd>
                  </div>
                ))}
            </dl>
            <div className="mt-6 border-t border-line pt-4 text-sm">
              <p className="font-medium">
                {pro?.name}
                {pro?.crefito && ` · CREFITO ${pro.crefito}`}
              </p>
              {signed ? (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-muted">
                  <ShieldCheck size={16} className="text-ok" /> Assinado eletronicamente em {stamp(rec.signed_at!)} · código{" "}
                  <code className="text-[12px]">{rec.signature_hash?.slice(0, 16)}</code>
                </p>
              ) : (
                <p className="mt-1 text-warn">Rascunho ainda não assinado pelo autor.</p>
              )}
            </div>
          </Card>
        )}

        {adds.length > 0 && (
          <Section title="Adendos">
            {adds.map((a) => (
              <Card key={a.id} className="p-4">
                <p className="text-[15px] whitespace-pre-wrap">{a.texto}</p>
                <p className="mt-2 text-[13px] text-muted">
                  {a.professionals?.name}
                  {a.professionals?.crefito && ` · CREFITO ${a.professionals.crefito}`} · assinado em {a.signed_at ? stamp(a.signed_at) : "—"}
                </p>
              </Card>
            ))}
          </Section>
        )}

        {signed && ctx.professionalId && (
          <details className="rounded-2xl border border-line bg-surface print:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 font-medium text-accent [&::-webkit-details-marker]:hidden">
              <PenLine size={18} /> Adicionar adendo (correção ou complemento)
            </summary>
            <div className="border-t border-line px-4 py-5">
              <ActionForm action={addAddendum}>
                <input type="hidden" name="parent_id" value={rec.id} />
                <input type="hidden" name="patient_id" value={id} />
                <Textarea name="texto" rows={3} required placeholder="Ex.: Onde se lê joelho direito, leia-se joelho esquerdo." />
                <SubmitButton size="md">Assinar adendo</SubmitButton>
              </ActionForm>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
