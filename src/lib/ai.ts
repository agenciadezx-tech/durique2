/**
 * Claude (Anthropic) no servidor. A chave fica só na variável ANTHROPIC_API_KEY da Vercel; nunca vai para o navegador.
 * Usado no resumo da semana (Saúde do negócio) e para organizar evoluções ditadas.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

const MODEL = "claude-opus-5-5";

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Pede uma resposta em JSON validada pelo schema (structured outputs). */
export async function askClaude<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  effort?: "low" | "medium" | "high";
}): Promise<AiResult<z.infer<S>>> {
  if (!aiEnabled()) return { ok: false, error: "A inteligência artificial ainda não foi ligada neste sistema." };
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
      messages: [{ role: "user", content: opts.prompt }],
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "A IA não conseguiu responder a este pedido. Tente reescrever." };
    if (response.stop_reason === "max_tokens" || !response.parsed_output) return { ok: false, error: "A resposta veio incompleta. Tente de novo." };
    return { ok: true, data: response.parsed_output as z.infer<S> };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "Muitos pedidos agora. Tente de novo em um minuto." };
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "A chave da IA está errada ou foi desativada." };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, error: "Não foi possível falar com a IA agora. Tente de novo." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: "A IA teve um problema agora. Tente de novo em instantes." };
    return { ok: false, error: "Não foi possível gerar agora. Tente de novo." };
  }
}
