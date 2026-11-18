import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { saveProfessional } from "../../ajustes/actions";
import { ColorField } from "../../ajustes/product-fields";

export const metadata = { title: "Profissional sem login" };

/** Profissional que só aparece na agenda (sem entrar no sistema). Depois dá para convidar. */
export default async function NovoProPage() {
  const ctx = await getContext();
  if (!ctx.isAdmin) redirect("/equipe");
  return (
    <>
      <PageHeader title="Profissional sem login" description="Aparece na agenda e na comissão, mas não entra no sistema." back={{ href: "/equipe", label: "Equipe" }} />
      <Card className="p-5">
        <ActionForm action={saveProfessional}>
          <input type="hidden" name="back" value="equipe" />
          <Field label="Nome">
            <Input name="name" required placeholder="Ex.: Carlos Lima" />
          </Field>
          <Field label="WhatsApp">
            <Input name="phone" type="tel" placeholder="(11) 99999-8888" />
          </Field>
          <ColorField />
          <SubmitButton full>Cadastrar e escolher serviços</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
