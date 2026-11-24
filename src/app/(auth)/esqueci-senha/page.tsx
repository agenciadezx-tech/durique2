import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";
import { requestPasswordReset } from "../actions";

export const metadata = { title: "Esqueci minha senha" };

export default function EsqueciSenhaPage() {
  return (
    <>
      <Card className="p-6 sm:p-7">
        <h1 className="text-xl font-semibold">Esqueci minha senha</h1>
        <p className="mt-1 mb-6 text-[15px] text-muted">Digite o e-mail da sua conta. Vamos mandar um link para você criar uma senha nova.</p>
        <ActionForm action={requestPasswordReset}>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="voce@clinica.com" />
          </Field>
          <SubmitButton full pendingText="Enviando…">
            Enviar link
          </SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-6 text-center text-[15px] text-muted">
        Lembrou?{" "}
        <Link href="/entrar" className="font-medium text-accent hover:underline">
          Voltar para entrar
        </Link>
      </p>
    </>
  );
}
