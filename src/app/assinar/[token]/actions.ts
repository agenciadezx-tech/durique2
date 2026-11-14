"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/forms";

export async function signDocument(_: ActionState, data: FormData): Promise<ActionState> {
  const token = String(data.get("token") ?? "");
  const name = String(data.get("signer_name") ?? "").trim();
  const png = String(data.get("signature_png") ?? "");
  if (name.length < 3) return { error: "Escreva seu nome completo." };
  if (!png.startsWith("data:image/png;base64,")) return { error: "Faça sua assinatura no quadro." };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_document_by_token", {
    p_token: token,
    p_signer_name: name,
    p_signature_png: png,
    p_ip: ip,
    p_user_agent: h.get("user-agent"),
  });
  if (error) return { error: error.code === "P0001" ? error.message : "Não foi possível assinar. Tente de novo." };
  revalidatePath(`/assinar/${token}`);
  return { ok: "Pronto! Documento assinado." };
}
