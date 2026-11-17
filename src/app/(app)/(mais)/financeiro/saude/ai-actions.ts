"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/forms";
import { askClaude } from "@/lib/ai";
import { getContext } from "@/lib/context";
import { addDaysISO, friendlyError, isoWeekday, todayISO } from "@/lib/format";
import { goalMap } from "@/lib/goals";
import { createClient } from "@/lib/supabase/server";

const Summary = z.object({
  frase: z.string().describe("Uma frase curta resumindo como foi a semana"),
  foi_bem: z.array(z.string()).describe("Até 3 coisas que foram bem, com números"),
  atencao: z.array(z.string()).describe("Até 3 pontos de atenção, com números"),
  faca_esta_semana: z
    .array(z.object({ acao: z.string().describe("Ação prática e curta"), motivo: z.string().describe("Por que, em uma frase") }))
    .describe("Até 4 ações para esta semana, da mais importante para a menos"),
});
export type WeeklySummary = z.infer<typeof Summary>;

const SYSTEM = `Você é consultor de gestão de clínicas de fisioterapia e estúdios de pilates no Brasil.
Escreve para a dona da clínica, que não é da área de números: português simples, frases curtas, sem jargão, sem termos em inglês.
Use só os números recebidos; não invente dados. Quando um número for zero ou faltar, não tire conclusão dele.
Compare com a semana anterior e com as metas quando fizer sentido. Seja específica e prática: cada ação deve dar para fazer nesta semana dentro do sistema (cobrar atrasados, mandar lembretes, oferecer aula experimental, chamar quem sumiu, renovar pacotes).
No máximo 3 itens em "foi_bem", 3 em "atencao" e 4 em "faca_esta_semana".`;

export async function generateWeeklySummary(): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.canSeeExpenses) return { error: "Somente administrador ou financeiro." };
  const today = todayISO();
  const weekStart = addDaysISO(today, 1 - isoWeekday(today));
  const supabase = await createClient();
  const [{ data: now }, { data: before }, { data: goals }, { count: ending }, { data: risk }, { count: leads }] = await Promise.all([
    supabase.rpc("business_health", { p_clinic: ctx.clinicId, p_from: addDaysISO(today, -6), p_to: today }),
    supabase.rpc("business_health", { p_clinic: ctx.clinicId, p_from: addDaysISO(today, -13), p_to: addDaysISO(today, -7) }),
    supabase.from("clinic_goals").select("key, target").eq("clinic_id", ctx.clinicId),
    supabase.from("packages_ending").select("package_id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId),
    supabase.rpc("patients_at_risk", { p_clinic: ctx.clinicId }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId).in("stage", ["novo", "contato", "avaliacao"]),
  ]);
  if (!now) return { error: "Não foi possível ler os números da clínica." };
  const dados = {
    clinica: ctx.clinicName,
    ultimos_7_dias: now,
    semana_anterior: before,
    metas: goalMap(goals),
    pacotes_acabando: ending ?? 0,
    pacientes_em_risco_de_desistir: Array.isArray(risk) ? risk.length : 0,
    contatos_em_aberto_no_funil: leads ?? 0,
    observacao: "Valores em dinheiro estão em centavos (100 = R$ 1,00). Ocupação de consultas = sessões ÷ capacidade.",
  };
  const r = await askClaude({
    system: SYSTEM,
    prompt: `Escreva o resumo da semana da clínica com estes dados (JSON):\n${JSON.stringify(dados)}`,
    schema: Summary,
    effort: "low",
  });
  if (!r.ok) return { error: r.error };
  const { error } = await supabase
    .from("ai_summaries")
    .upsert({ clinic_id: ctx.clinicId, kind: "semana", period_start: weekStart, content: r.data, created_at: new Date().toISOString() }, { onConflict: "clinic_id,kind,period_start" });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/financeiro/saude");
  return { ok: "Resumo pronto." };
}
