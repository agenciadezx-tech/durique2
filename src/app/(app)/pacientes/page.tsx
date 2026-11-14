import Link from "next/link";
import { AlertTriangle, ChevronRight, FileSpreadsheet, Plus, Search, Users } from "lucide-react";
import { WaSendButton } from "@/components/wa-send";
import { firstName } from "@/lib/messages";
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
  type Risk = { patient_id: string; name: string; phone: string | null; motivo: string };
  const risk: Risk[] =
    ctx.canManageAgenda && !inativos && !q
      ? (((await supabase.rpc("patients_at_risk", { p_clinic: ctx.clinicId })).data ?? []) as Risk[])
      : [];
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
          {risk && risk.length > 0 && (
            <details className="mb-4 rounded-2xl border border-warn/30 bg-warn-soft/40" open={risk.length <= 3}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-warn [&::-webkit-details-marker]:hidden">
                <AlertTriangle size={18} /> {risk.length} aluno{risk.length === 1 ? "" : "s"} em risco de desistir
              </summary>
              <ul className="divide-y divide-warn/20 border-t border-warn/20">
                {risk.slice(0, 10).map((r) => (
                  <li key={r.patient_id} className="flex items-center gap-3 px-4 py-2.5">
                    <Link href={`/pacientes/${r.patient_id}`} className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="text-sm text-muted">{r.motivo}</span>
                    </Link>
                    {r.phone && (
                      <WaSendButton
                        compact
                        phone={r.phone}
                        kind="outro"
                        patientId={r.patient_id}
                        body={`Olá, ${firstName(r.name)}! Sentimos sua falta por aqui na ${ctx.clinicName}. Está tudo bem? Quer que eu reserve seu próximo horário?`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

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
