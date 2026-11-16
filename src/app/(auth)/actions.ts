"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/forms";

const safeNext = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : null;
};

export async function signIn(_: ActionState, data: FormData): Promise<ActionState> {
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  if (!email || !password) return { error: "Preencha e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed")
      return { error: "Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada (e no spam)." };
    return { error: "E-mail ou senha incorretos." };
  }
  redirect(safeNext(data.get("next")) ?? "/agenda");
}

export async function signUp(_: ActionState, data: FormData): Promise<ActionState> {
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  if (!email) return { error: "Informe seu e-mail." };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data: res, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm${safeNext(data.get("next")) ? `?next=${encodeURIComponent(safeNext(data.get("next"))!)}` : ""}` },
  });
  if (error) {
    if (error.code === "user_already_exists") return { error: "Já existe uma conta com este e-mail. Tente entrar." };
    if (error.code === "weak_password") return { error: "Senha fraca. Use letras e números, com pelo menos 8 caracteres." };
    if (error.code === "email_address_invalid") return { error: "Este e-mail não foi aceito. Confira se digitou certo." };
    if (error.code === "over_email_send_rate_limit" || error.status === 429) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    return { error: "Não foi possível criar a conta. Tente de novo." };
  }
  if (res.session) redirect(safeNext(data.get("next")) ?? "/comecar");
  return { ok: `Quase lá! Enviamos um link de confirmação para ${email}. Abra o e-mail e toque no link para ativar sua conta.` };
}
