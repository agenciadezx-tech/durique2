import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";
import { signUp } from "../actions";

export const metadata = { title: "Criar conta" };

export default async function CriarContaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <Card className="p-6 sm:p-7">
        <h1 className="text-xl font-semibold">Criar sua conta</h1>
        <p className="mt-1 mb-6 text-[15px] text-muted">Leva menos de um minuto. Depois você cadastra sua clínica.</p>
        <ActionForm action={signUp}>
          {next && <input type="hidden" name="next" value={next} />}
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="voce@clinica.com" />
          </Field>
          <Field label="Crie uma senha" htmlFor="password" hint="Pelo menos 8 caracteres.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <SubmitButton full pendingText="Criando…">
            Criar conta
          </SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-6 text-center text-[15px] text-muted">
        Já tem conta?{" "}
        <Link href={next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar"} className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
