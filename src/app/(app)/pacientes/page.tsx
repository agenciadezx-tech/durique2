import Link from "next/link";
import { AlertTriangle, ChevronRight, FileSpreadsheet, Package, Phone, Plus, Search, Users } from "lucide-react";
import { WaSendButton } from "@/components/wa-send";
import { firstName } from "@/lib/messages";
import { Avatar, Card, cx, EmptyState, Input, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format";

export const metadata = { title: "Pacientes" };

function endingLabel(e: { sessions_left: number | null; expires_on: string | null }) {
  if (e.sessions_left != null && e.sessions_left <= 0) return "Pacote acabou";
  if (e.sessions_left != null && e.sessions_left <= 2) return `Pacote: falta${e.sessions_left === 1 ? "" : "m"} ${e.sessions_left}`;
  return "Pacote vencendo";
}

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inativos?: string; servico?: string }>;
}) {
  const ctx = await getContext();
  const { q = "", inativos, servico } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("patients")
    .select("id, name, phone, active, access_via")
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
  const { data: services } = await supabase.from("services").select("id, name").eq("clinic_id", ctx.clinicId).eq("active", true).order("name");
  const svc = (services ?? []).find((x) => x.id === servico);
  if (svc) {
    const { data: ids } = await supabase.from("patient_services").select("patient_id").eq("service_id", svc.id).limit(2000);
    query = query.in("id", [...new Set((ids ?? []).map((r) => r.patient_id))].concat("00000000-0000-0000-0000-000000000000"));
  }
  const { data: patients } = await query;
  const pids = (patients ?? []).map((p) => p.id);
  const [{ data: ps }, { data: pkgs }, { data: ending }] = pids.length
    ? await Promise.all([
        supabase.from("patient_services").select("patient_id, service_id, service_name").in("patient_id", pids),
        supabase.from("patient_packages").select("patient_id, name").in("patient_id", pids).eq("status", "ativo"),
        supabase.from("packages_ending").select("patient_id, sessions_left, expires_on").in("patient_id", pids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const servicesOf = new Map<string, string[]>();
  (ps ?? []).forEach((r) => servicesOf.set(r.patient_id!, [...(servicesOf.get(r.patient_id!) ?? []), r.service_name!]));
  const pkgOf = new Map<string, string>();
  (pkgs ?? []).forEach((r) => !pkgOf.has(r.patient_id) && pkgOf.set(r.patient_id, r.name));
  const endingOf = new Map<string, { sessions_left: number | null; expires_on: string | null }>();
  (ending ?? []).forEach((r) => endingOf.set(r.patient_id!, { sessions_left: r.sessions_left, expires_on: r.expires_on }));
  const href = (sv?: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (inativos) sp.set("inativos", "1");
    if (sv) sp.set("servico", sv);
    const str = sp.toString();
    return `/pacientes${str ? `?${str}` : ""}`;
  };
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
            {svc && <input type="hidden" name="servico" value={svc.id} />}
          </form>

          {(services ?? []).length > 1 && (
            <nav aria-label="Filtrar por serviço" className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              {[{ id: "", name: "Todos" }, ...(services ?? [])].map((x) => {
                const on = (svc?.id ?? "") === x.id;
                return (
                  <Link
                    key={x.id || "todos"}
                    href={href(x.id || undefined)}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
                      on ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-ink",
                    )}
                  >
                    {x.name}
                  </Link>
                );
              })}
            </nav>
          )}

          {patients && patients.length > 0 ? (
            <Card className="divide-y divide-line overflow-hidden">
              {patients.map((p) => (
                <Link key={p.id} href={`/pacientes/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="flex items-center gap-1 truncate text-sm text-muted">
                      <Phone size={13} className="shrink-0" /> {formatPhone(p.phone) || "Sem telefone"}
                    </p>
                    {(servicesOf.has(p.id) || pkgOf.has(p.id) || p.access_via) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(servicesOf.get(p.id) ?? []).map((n) => (
                          <span key={n} className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent">
                            {n}
                          </span>
                        ))}
                        {p.access_via && (
                          <span className="rounded-full bg-info-soft px-2 py-0.5 text-[12px] font-medium text-info">
                            {p.access_via === "wellhub" ? "Wellhub" : "TotalPass"}
                          </span>
                        )}
                        {pkgOf.has(p.id) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[12px] text-muted">
                            <Package size={12} /> {pkgOf.get(p.id)}
                          </span>
                        )}
                        {endingOf.has(p.id) && (
                          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-medium text-warn">
                            {endingLabel(endingOf.get(p.id)!)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-faint" />
                </Link>
              ))}
            </Card>
          ) : (
            <p className="py-10 text-center text-muted">
              Nenhum paciente encontrado{term && ` para “${term}”`}
              {svc && ` em ${svc.name}`}.
            </p>
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
