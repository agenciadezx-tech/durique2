import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Dumbbell, PlayCircle } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Card, cx, EmptyState, Field, Input, LinkButton, PageHeader, Section } from "@/components/ui";
import { WaSendButton } from "@/components/wa-send";
import { getContext } from "@/lib/context";
import { addDaysISO, formatDateShort, todayISO } from "@/lib/format";
import { firstName } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { youtubeId } from "@/lib/video";
import { createPlan, endPlan } from "./actions";

export const metadata = { title: "Exercícios para casa" };

type Plan = {
  id: string;
  title: string;
  frequency: string | null;
  created_at: string;
  professionals: { name: string } | null;
  exercise_plan_items: { id: string; sets: string | null; position: number; exercises: { name: string; video_url: string | null } | null }[];
  exercise_logs: { done_on: string; pain: number | null }[];
};

export default async function PatientExercisesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  if (!ctx.canSeeClinical) redirect(`/pacientes/${id}`);
  const supabase = await createClient();
  const [{ data: patient }, { data: plansData }, { data: library }] = await Promise.all([
    supabase.from("patients").select("id, name, phone, portal_token").eq("id", id).maybeSingle(),
    supabase
      .from("exercise_plans")
      .select("id, title, frequency, created_at, professionals(name), exercise_plan_items(id, sets, position, exercises(name, video_url)), exercise_logs(done_on, pain)")
      .eq("patient_id", id)
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase.from("exercises").select("id, name, region, video_url").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
  ]);
  if (!patient) notFound();
  const plans = (plansData ?? []) as unknown as Plan[];
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(today, i - 13));
  const hh = await headers();
  const portal = patient.portal_token ? `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("host")}/p/${patient.portal_token}` : null;

  return (
    <>
      <PageHeader
        title="Exercícios para casa"
        description={`${patient.name} vê os exercícios com vídeo no link pessoal e marca "Fiz hoje".`}
        back={{ href: `/pacientes/${id}`, label: patient.name }}
      />
      <div className="space-y-10">
        {plans.length > 0 && (
          <Section title="Passados agora">
            <div className="space-y-4">
              {plans.map((p) => {
                const done = new Set(p.exercise_logs.map((l) => l.done_on));
                const last = [...p.exercise_logs].sort((a, b) => b.done_on.localeCompare(a.done_on))[0];
                const count = days.filter((d) => done.has(d)).length;
                return (
                  <Card key={p.id} className="overflow-hidden">
                    <div className="px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{p.title}</p>
                          <p className="text-sm text-muted">
                            {p.frequency ? `${p.frequency} · ` : ""}desde {formatDateShort(p.created_at.slice(0, 10))}
                            {p.professionals ? ` · ${p.professionals.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <p className="mb-1.5 text-sm text-muted">
                          Fez em <span className="font-semibold text-ink">{count}</span> dos últimos 14 dias
                          {last?.pain != null && ` · última dor informada: ${last.pain}/10`}
                        </p>
                        <div className="flex gap-1" aria-hidden>
                          {days.map((d) => (
                            <span
                              key={d}
                              title={formatDateShort(d)}
                              className={cx("h-6 flex-1 rounded", done.has(d) ? "bg-accent" : "bg-hover", d === today && "ring-1 ring-ink/30")}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <ul className="divide-y divide-line border-t border-line">
                      {[...p.exercise_plan_items]
                        .sort((a, b) => a.position - b.position)
                        .map((i) => (
                          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                            {i.exercises?.video_url ? <PlayCircle size={18} className="shrink-0 text-accent" /> : <Dumbbell size={18} className="shrink-0 text-faint" />}
                            <span className="flex-1">{i.exercises?.name}</span>
                            {i.sets && <span className="text-sm text-muted">{i.sets}</span>}
                          </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap gap-2 border-t border-line bg-bg/60 px-4 py-3 sm:px-5">
                      {patient.phone && portal && (
                        <WaSendButton
                          phone={patient.phone}
                          kind="outro"
                          patientId={patient.id}
                          label="Enviar pelo WhatsApp"
                          body={`Oi, ${firstName(patient.name)}! Seus exercícios para casa estão aqui, com vídeo: ${portal}\nQuando fizer, toque em "Fiz hoje" para eu acompanhar. 💪`}
                        />
                      )}
                      <form action={endPlan}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="patient_id" value={id} />
                        <ConfirmSubmit question="Encerrar estes exercícios? Eles saem do link do paciente (o histórico fica guardado)." variant="ghost">
                          Encerrar
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Section>
        )}

        <Section title={plans.length ? "Passar mais exercícios" : "Passar exercícios"}>
          {(library ?? []).length === 0 ? (
            <EmptyState
              icon={<Dumbbell size={28} />}
              title="Sua biblioteca está vazia"
              text="Cadastre os exercícios (com link do vídeo) uma vez. Depois é só marcar aqui."
              action={<LinkButton href="/ajustes/exercicios">Cadastrar exercícios</LinkButton>}
            />
          ) : (
            <Card className="p-5 sm:p-6">
              <ActionForm action={createPlan} resetOnSuccess>
                <input type="hidden" name="patient_id" value={id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome">
                    <Input name="title" defaultValue="Exercícios para casa" />
                  </Field>
                  <Field label="Quantas vezes" hint="Ex.: 1x por dia, 3x por semana">
                    <Input name="frequency" placeholder="1x por dia" />
                  </Field>
                </div>
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium">Marque os exercícios</legend>
                  {(library ?? []).map((e) => {
                    const yt = youtubeId(e.video_url);
                    return (
                      <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                          <input type="checkbox" name="exercise_id" value={e.id} className="size-5 accent-[var(--color-accent)]" />
                          {yt && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`https://i.ytimg.com/vi/${yt}/default.jpg`} alt="" className="h-9 w-12 rounded object-cover" />
                          )}
                          <span>
                            <span className="block font-medium">{e.name}</span>
                            {e.region && <span className="text-sm text-muted">{e.region}</span>}
                          </span>
                        </label>
                        <Input name={`sets_${e.id}`} placeholder="3 x 12" aria-label={`Séries de ${e.name}`} className="w-full sm:w-36" />
                      </div>
                    );
                  })}
                </fieldset>
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton size="md">Passar para o paciente</SubmitButton>
                  <Link href="/ajustes/exercicios" className="text-sm font-medium text-muted hover:text-ink">
                    Editar biblioteca
                  </Link>
                </div>
              </ActionForm>
            </Card>
          )}
        </Section>
      </div>
    </>
  );
}
