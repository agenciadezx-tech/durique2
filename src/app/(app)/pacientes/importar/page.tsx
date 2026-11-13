import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { Importer } from "./importer";

export const metadata = { title: "Importar pacientes" };

export default async function ImportarPage() {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/pacientes");
  return (
    <>
      <PageHeader
        title="Importar pacientes"
        description="Traga todos os pacientes de uma planilha de uma vez."
        back={{ href: "/pacientes", label: "Pacientes" }}
      />
      <Importer />
    </>
  );
}
