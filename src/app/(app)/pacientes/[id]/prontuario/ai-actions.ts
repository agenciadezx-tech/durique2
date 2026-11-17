"use server";

import { z } from "zod";
import { askClaude } from "@/lib/ai";
import { ASSESSMENT_FIELDS, EVOLUTION_FIELDS } from "@/lib/clinical";
import { getContext } from "@/lib/context";

export type OrganizedNote = { fields: Record<string, string>; dor_eva: number | null };

/**
 * Organiza um texto ditado pelo profissional nos campos do prontuário.
 * Só o texto ditado vai para a IA (sem nome do paciente). Nada é salvo aqui: o profissional revisa e salva.
 */
export async function organizeNote(kind: "avaliacao" | "evolucao", text: string): Promise<{ ok: true; data: OrganizedNote } | { ok: false; error: string }> {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) return { ok: false, error: "Sem permissão." };
  const t = text.trim();
  if (t.length < 15) return { ok: false, error: "Fale um pouco mais antes de organizar." };
  if (t.length > 12000) return { ok: false, error: "O texto ficou muito longo. Divida em partes." };
  const fields = kind === "avaliacao" ? ASSESSMENT_FIELDS : EVOLUTION_FIELDS;
  const schema = z.object({
    ...Object.fromEntries(fields.map((f) => [f.key, z.string().describe(`${f.label}${f.hint ? ` (${f.hint})` : ""}. Vazio se não foi falado.`)])),
    dor_eva: z.number().nullable().describe("Nota de dor de 0 a 10 se o profissional falou; senão null"),
  });
  const r = await askClaude({
    system: `Você organiza anotações de fisioterapeutas brasileiros para o prontuário (Resolução COFFITO 414/2012).
Recebe um texto ditado, com a fala natural do profissional, e distribui o conteúdo nos campos pedidos.
Regras: use só o que foi dito, sem inventar achados, testes, números ou diagnósticos. Corrija a escrita e tire repetições e vícios de fala,
mas mantenha os termos técnicos e as medidas. Escreva em português, de forma objetiva e em terceira pessoa ("Paciente relata..."). Campo não mencionado = texto vazio.`,
    prompt: `Tipo de registro: ${kind === "avaliacao" ? "avaliação inicial" : "evolução de sessão"}.\nTexto ditado:\n"""${t}"""`,
    schema,
    effort: "low",
  });
  if (!r.ok) return r;
  const out = r.data as Record<string, unknown>;
  const map: Record<string, string> = {};
  for (const f of fields) {
    const v = typeof out[f.key] === "string" ? (out[f.key] as string).trim() : "";
    if (v) map[f.key] = v;
  }
  const eva = typeof out.dor_eva === "number" && out.dor_eva >= 0 && out.dor_eva <= 10 ? Math.round(out.dor_eva) : null;
  return { ok: true, data: { fields: map, dor_eva: eva } };
}
