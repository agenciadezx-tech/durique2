import { FileSpreadsheet, Plus, Users } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pacientes" };

/**
 * A lista de pacientes fica no layout (coluna da esquerda no computador; tela inteira no celular).
 * Aqui só o aviso de clínica sem pacientes e, no computador, o "escolha um paciente".
 */
export default async function PacientesPage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const { count } = await supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", ctx.clinicId);

  if (!count) {
    return (
      <EmptyState
        icon={<Users size={22} />}
        title="Nenhum paciente ainda"
        text="Cadastre um por um ou traga todos de uma vez a partir de uma planilha do Excel."
        action={
          ctx.canManageAgenda && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <LinkButton href="/pacientes/novo">
                <Plus size={18} /> Cadastrar paciente
              </LinkButton>
              <LinkButton href="/pacientes/importar" variant="secondary">
                <FileSpreadsheet size={18} /> Importar planilha
              </LinkButton>
            </div>
          )
        }
      />
    );
  }

  return (
    <div className="hidden min-h-[50vh] flex-col items-center justify-center text-center lg:flex">
      <span className="grid size-16 place-items-center rounded-2xl border border-line bg-surface text-muted">
        <Users size={28} />
      </span>
      <p className="mt-4 text-lg font-semibold">Escolha um paciente na lista</p>
      <p className="mt-1 max-w-sm text-[15px] text-muted">A ficha completa abre aqui: sessões, pacote, avaliação, financeiro e documentos.</p>
    </div>
  );
}
