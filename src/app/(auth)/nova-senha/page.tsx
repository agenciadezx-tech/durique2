import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input } from "@/components/ui";
import { setNewPassword } from "../actions";

export const metadata = { title: "Criar senha nova" };

export default function NovaSenhaPage() {
  return (
    <Card className="p-6 sm:p-7">
      <h1 className="text-xl font-semibold">Criar senha nova</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">Escolha a senha que você vai usar daqui para frente.</p>
      <ActionForm action={setNewPassword}>
        <Field label="Senha nova" htmlFor="password" hint="Pelo menos 8 caracteres.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Repita a senha" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <SubmitButton full pendingText="Salvando…">
          Salvar senha
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}
