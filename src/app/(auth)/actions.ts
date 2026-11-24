"use server";

import { headers } from "next/headers";
import { TERMS_VERSION } from "@/lib/legal";
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
  if (data.get("terms") !== "on") return { error: "Para criar a conta, marque que aceita os Termos de uso e a Política de privacidade." };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data: res, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
      emailRedirectTo: `${origin}/auth/confirm${safeNext(data.get("next")) ? `?next=${encodeURIComponent(safeNext(data.get("next"))!)}` : ""}` },
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

/** Esqueci a senha: manda o link por e-mail (a resposta é a mesma exista ou não a conta). */
export async function requestPasswordReset(_: ActionState, data: FormData): Promise<ActionState> {
  const email = String(data.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Informe o e-mail da sua conta." };
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/nova-senha` });
  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  return { ok: `Se existir uma conta com ${email}, você vai receber um link para criar uma senha nova. Olhe também no spam.` };
}

/** Nova senha (depois de abrir o link do e-mail). */
export async function setNewPassword(_: ActionState, data: FormData): Promise<ActionState> {
  const password = String(data.get("password") ?? "");
  const confirm = String(data.get("confirm") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As duas senhas não são iguais." };
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: "O link expirou. Peça um novo em “Esqueci minha senha”." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Use uma senha diferente da anterior." };
    if (error.code === "weak_password") return { error: "Senha fraca. Use letras e números, com pelo menos 8 caracteres." };
    return { error: "Não deu para trocar a senha. Tente de novo." };
  }
  redirect("/agenda?senha=1");
}
