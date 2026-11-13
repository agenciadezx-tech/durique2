import Link from "next/link";
import { ChevronRight, FileSpreadsheet, Plus, Search, Users } from "lucide-react";
import { Avatar, Card, EmptyState, Input, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format";

export const metadata = { title: "Pacientes" };

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inativos?: string }>;
}) {
  const ctx = await getContext();
  const { q = "", inativos } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("patients")
    .select("id, name, phone, active")
    .eq("clinic_id", ctx.clinicId)
    .eq("active", !inativos)
    .order("name")
    .limit(200);
  // Remove caracteres especiais do filtro do PostgREST (vírgula, parênteses, curingas)
  const term = q.replace(/[,()%*\\:"']/g, " ").trim().slice(0, 80);
  if (term) {
    const digits = term.replace(/\D/g, "");
    query = digits.length >= 4 ? query.or(`name.ilike.%${term}%,phone.ilike.%${digits}%,cpf.ilike.%${digits}%`) : query.ilike("name", `%${term}%`);
  }
  const { data: patients } = await query;
  const { count: total } = await supabase
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", ctx.clinicId)
    .eq("active", true);

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={total ? `${total} paciente${total === 1 ? "" : "s"} ativo${total === 1 ? "" : "s"}` : undefined}
        action={
          ctx.canManageAgenda && (
            <>
              <LinkButton href="/pacientes/importar" variant="secondary" className="hidden sm:inline-flex">
                <FileSpreadsheet size={18} /> Importar planilha
              </LinkButton>
              <LinkButton href="/pacientes/novo">
                <Plus size={18} /> Novo paciente
              </LinkButton>
            </>
          )
        }
      />

      {!total && !inativos ? (
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
      ) : (
        <>
          <form className="relative mb-4" role="search">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
            <Input name="q" defaultValue={q} placeholder="Buscar por nome, telefone ou CPF" className="pl-10" type="search" />
            {inativos && <input type="hidden" name="inativos" value="1" />}
          </form>

          {patients && patients.length > 0 ? (
            <Card className="divide-y divide-line overflow-hidden">
              {patients.map((p) => (
                <Link key={p.id} href={`/pacientes/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-sm text-muted">{formatPhone(p.phone) || "Sem telefone"}</p>
                  </div>
                  <ChevronRight size={18} className="text-faint" />
                </Link>
              ))}
            </Card>
          ) : (
            <p className="py-10 text-center text-muted">Nenhum paciente encontrado{term && ` para “${term}”`}.</p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href={inativos ? "/pacientes" : "/pacientes?inativos=1"} className="text-muted hover:text-ink">
              {inativos ? "← Voltar para pacientes ativos" : "Ver pacientes arquivados"}
            </Link>
            {ctx.canManageAgenda && (
              <Link href="/pacientes/importar" className="text-muted hover:text-ink sm:hidden">
                Importar planilha
              </Link>
            )}
          </div>
        </>
      )}
    </>
  );
}
