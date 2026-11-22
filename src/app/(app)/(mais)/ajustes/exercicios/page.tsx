import { redirect } from "next/navigation";
import { Dumbbell, PlayCircle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Section, Textarea } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { youtubeId } from "@/lib/video";
import { saveExercise, setExerciseActive } from "./actions";

export const metadata = { title: "Exercícios para casa" };

type Ex = { id: string; name: string; video_url: string | null; region: string | null; instructions: string | null; active: boolean };

function ExerciseFields({ e }: { e?: Ex }) {
  return (
    <>
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <Input name="name" required defaultValue={e?.name} placeholder="Ex.: Ponte de glúteo" />
        </Field>
        <Field label="Região (opcional)">
          <Input name="region" defaultValue={e?.region ?? ""} placeholder="Ex.: Lombar, joelho, ombro" />
        </Field>
      </div>
      <Field label="Link do vídeo (opcional)" hint="Pode ser do YouTube (até vídeo não listado), Instagram ou Google Drive.">
        <Input name="video_url" type="url" inputMode="url" defaultValue={e?.video_url ?? ""} placeholder="https://youtube.com/…" />
      </Field>
      <Field label="Como fazer (opcional)">
        <Textarea name="instructions" rows={3} defaultValue={e?.instructions ?? ""} placeholder="Deitado de barriga para cima, joelhos dobrados. Suba o quadril e segure 3 segundos." />
      </Field>
    </>
  );
}

export default async function ExercisesPage() {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) redirect("/ajustes");
  const supabase = await createClient();
  const { data } = await supabase
    .from("exercises")
    .select("id, name, video_url, region, instructions, active")
    .eq("clinic_id", ctx.clinicId)
    .order("active", { ascending: false })
    .order("name");
  const list = (data ?? []) as Ex[];

  return (
    <>
      <PageHeader
        title="Exercícios para casa"
        description="Monte sua biblioteca uma vez e passe para cada paciente em segundos. O paciente vê com o vídeo no link dele."
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <div className="space-y-10">
        <Section title="Novo exercício">
          <Card className="p-5 sm:p-6">
            <ActionForm action={saveExercise} resetOnSuccess>
              <ExerciseFields />
              <SubmitButton size="md">Adicionar à biblioteca</SubmitButton>
            </ActionForm>
          </Card>
        </Section>

        <Section title={`Biblioteca (${list.filter((e) => e.active).length})`}>
          {list.length === 0 ? (
            <EmptyState
              icon={<Dumbbell size={28} />}
              title="Nenhum exercício ainda"
              text="Comece pelos 5 que você mais passa. Depois é só escolher na ficha do paciente."
            />
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {list.map((e) => {
                const yt = youtubeId(e.video_url);
                return (
                  <details key={e.id} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
                      {yt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`https://i.ytimg.com/vi/${yt}/default.jpg`} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-hover text-faint">
                          {e.video_url ? <PlayCircle size={20} /> : <Dumbbell size={20} />}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{e.name}</span>
                        <span className="text-sm text-muted">{e.region ?? (e.video_url ? "Com vídeo" : "Sem vídeo")}</span>
                      </span>
                      {!e.active && <Badge>Arquivado</Badge>}
                      <span className="text-sm text-muted group-open:hidden">Editar</span>
                      <span className="hidden text-sm text-muted group-open:inline">Fechar</span>
                    </summary>
                    <div className="space-y-4 border-t border-line bg-bg/60 px-4 py-5">
                      <ActionForm action={saveExercise}>
                        <ExerciseFields e={e} />
                        <SubmitButton size="md">Salvar</SubmitButton>
                      </ActionForm>
                      <form action={setExerciseActive}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="active" value={String(!e.active)} />
                        <button type="submit" className="min-h-11 text-sm font-medium text-muted hover:text-ink">
                          {e.active ? "Arquivar (some da lista de escolha)" : "Voltar a usar"}
                        </button>
                      </form>
                    </div>
                  </details>
                );
              })}
            </Card>
          )}
        </Section>
      </div>
    </>
  );
}
