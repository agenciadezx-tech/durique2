import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Logo } from "@/components/logo";
import { Card, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createClinic } from "./actions";

export const metadata = { title: "Começar" };

export default async function ComecarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect("/agenda");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 sm:p-8">
          <p className="text-sm font-medium text-accent">Passo 1 de 1</p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Como se chama sua clínica?</h1>
          <p className="mt-1 mb-6 text-[15px] text-muted">
            É o nome que aparece para sua equipe. Dá para mudar depois em Minha clínica.
          </p>
          <ActionForm action={createClinic}>
            <Field label="Nome da clínica ou estúdio" htmlFor="name">
              <Input id="name" name="name" required autoFocus placeholder="Ex.: Estúdio Movimento Pilates" />
            </Field>
            <Field label="Seu nome" htmlFor="professional" hint="Se você também atende, já entra como profissional.">
              <Input id="professional" name="professional" placeholder="Ex.: Ana Souza" />
            </Field>
            <SubmitButton full pendingText="Preparando tudo…">
              Começar a usar
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </main>
  );
}
