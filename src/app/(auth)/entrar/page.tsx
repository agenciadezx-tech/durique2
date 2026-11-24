import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";
import { signIn } from "../actions";

export const metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ confirmado?: string; next?: string }> }) {
  const { confirmado, next } = await searchParams;
  return (
    <>
      <Card className="p-6 sm:p-7">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="mt-1 mb-6 text-[15px] text-muted">Que bom ter você de volta.</p>
        {confirmado && (
          <p className="mb-5 rounded-xl bg-ok-soft px-4 py-3 text-[15px] text-ok">E-mail confirmado! Agora é só entrar.</p>
        )}
        <ActionForm action={signIn}>
          {next && <input type="hidden" name="next" value={next} />}
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="voce@clinica.com" />
          </Field>
          <Field label="Senha" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <p className="-mt-2 text-right">
            <Link href="/esqueci-senha" className="text-[14px] font-medium text-accent hover:underline">
              Esqueci minha senha
            </Link>
          </p>
          <SubmitButton full pendingText="Entrando…">
            Entrar
          </SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-6 text-center text-[15px] text-muted">
        Ainda não tem conta?{" "}
        <Link href={next ? `/criar-conta?next=${encodeURIComponent(next)}` : "/criar-conta"} className="font-medium text-accent hover:underline">
          Criar conta grátis
        </Link>
      </p>
    </>
  );
}
