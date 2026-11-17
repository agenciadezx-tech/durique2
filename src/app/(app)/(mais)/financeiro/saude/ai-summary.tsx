import { CheckCircle2, AlertTriangle, ListChecks, Sparkles } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { generateWeeklySummary, type WeeklySummary } from "./ai-actions";

/** Cartão "Resumo da semana" escrito pela IA (fica salvo; dá para atualizar). */
export function AiSummaryCard({ summary, createdAt }: { summary: WeeklySummary | null; createdAt: string | null }) {
  const enabled = aiEnabled();
  return (
    <Card className="overflow-hidden border-accent/30">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft/40 px-5 py-4">
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-white">
          <Sparkles size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Resumo da semana com IA</p>
          <p className="text-sm text-muted">
            {summary && createdAt
              ? `Escrito em ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(createdAt))} · revise antes de compartilhar`
              : "A IA lê os números da clínica e diz o que foi bem, o que pede atenção e o que fazer."}
          </p>
        </div>
        {enabled && (
          <ActionForm action={generateWeeklySummary} className="space-y-0! [&>[role=alert]]:mb-2">
            <SubmitButton size="md" variant={summary ? "secondary" : "primary"} pendingText="Escrevendo…">
              <Sparkles size={16} /> {summary ? "Atualizar" : "Gerar resumo"}
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      {!enabled ? (
        <p className="px-5 py-4 text-[15px] text-muted">
          A IA ainda não foi ligada neste sistema. Quando a chave for colocada, o botão “Gerar resumo” aparece aqui.
        </p>
      ) : summary ? (
        <div className="space-y-4 px-5 py-5">
          <p className="text-[17px] font-medium">{summary.frase}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {summary.foi_bem.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ok">
                  <CheckCircle2 size={16} /> Foi bem
                </p>
                <ul className="space-y-1 text-[15px]">
                  {summary.foi_bem.slice(0, 3).map((t, i) => (
                    <li key={i}>• {t}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.atencao.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-warn">
                  <AlertTriangle size={16} /> Pede atenção
                </p>
                <ul className="space-y-1 text-[15px]">
                  {summary.atencao.slice(0, 3).map((t, i) => (
                    <li key={i}>• {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {summary.faca_esta_semana.length > 0 && (
            <div className="rounded-xl bg-bg p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <ListChecks size={16} className="text-accent" /> Faça esta semana
              </p>
              <ol className="space-y-2">
                {summary.faca_esta_semana.slice(0, 4).map((a, i) => (
                  <li key={i} className="flex gap-3 text-[15px]">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-semibold text-white">{i + 1}</span>
                    <span>
                      <span className="font-medium">{a.acao}</span>
                      <span className="block text-sm text-muted">{a.motivo}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <p className="px-5 py-4 text-[15px] text-muted">Toque em “Gerar resumo”. Leva uns segundos.</p>
      )}
    </Card>
  );
}
