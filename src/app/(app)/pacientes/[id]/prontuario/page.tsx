import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardList, FileText, Lock, PenLine, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, cx, EmptyState, Field, Input, LinkButton, PageHeader, Section, Select } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { formatDateShort, todayISO } from "@/lib/format";
import { painColor, SCALE_LABEL, SCALES } from "@/lib/clinical";
import { addScale } from "./actions";

export const metadata = { title: "Prontuário" };

type Rec = {
  id: string;
  kind: "avaliacao" | "evolucao" | "adendo";
  record_date: string;
  queixa_principal: string | null;
  diagnostico: string | null;
  subjetivo: string | null;
  conduta: string | null;
  texto: string | null;
  dor_eva: number | null;
  signed_at: string | null;
  parent_id: string | null;
  professionals: { name: string; crefito: string | null } | null;
};

const KIND_LABEL = { avaliacao: "Avaliação", evolucao: "Evolução", adendo: "Adendo" } as const;

function Sparkline({ points, max, better }: { points: { v: number; d: string }[]; max: number; better: string }) {
  if (points.length < 2) return null;
  const w = 120,
    h = 36,
    pad = 4;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const first = points[0].v,
    last = points[points.length - 1].v;
  const improved = better === "lower" ? last < first : last > first;
  const color = last === first ? "var(--color-muted)" : improved ? "var(--color-ok)" : "var(--color-bad)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`De ${first} para ${last}`} className="shrink-0">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={points.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.v)} r={i === points.length - 1 ? 3.5 : 2.5} fill={color}>
          <title>{`${formatDateShort(p.d)}: ${p.v}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default async function ProntuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx.canSeeClinical) redirect("/pacientes");
  const { id } = await params;
  const supabase = await createClient();
  const { data: patient } = await supabase.from("patients").select("id, name, birth_date").eq("id", id).maybeSingle();
  if (!patient) notFound();
  await supabase.rpc("log_record_access", { p_patient: id, p_action: "abriu prontuário" });

  const [{ data: recs }, { data: scales }] = await Promise.all([
    supabase
      .from("clinical_records")
      .select("id, kind, record_date, queixa_principal, diagnostico, subjetivo, conduta, texto, dor_eva, signed_at, parent_id, professionals(name, crefito)")
      .eq("patient_id", id)
      .order("record_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("scale_results").select("scale, score, max_score, measured_on").eq("patient_id", id).order("measured_on"),
  ]);
  const records = (recs ?? []) as unknown as Rec[];
  const main = records.filter((r) => r.kind !== "adendo");
  const addendaCount = new Map<string, number>();
  records.filter((r) => r.kind === "adendo").forEach((r) => addendaCount.set(r.parent_id!, (addendaCount.get(r.parent_id!) ?? 0) + 1));
  const lastAssessment = main.find((r) => r.kind === "avaliacao");

  const byScale = new Map<string, { v: number; d: string; max: number | null }[]>();
  (scales ?? []).forEach((s) => byScale.set(s.scale, [...(byScale.get(s.scale) ?? []), { v: Number(s.score), d: s.measured_on, max: s.max_score }]));

  const age = patient.birth_date ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / 3.15576e10) : null;

  return (
    <>
      <PageHeader
        title="Prontuário"
        description={`${patient.name}${age != null ? ` · ${age} anos` : ""}`}
        back={{ href: `/pacientes/${id}`, label: patient.name }}
        action={
          ctx.professionalId && (
            <>
              <LinkButton href={`/pacientes/${id}/prontuario/novo?tipo=avaliacao`} variant="secondary">
                <ClipboardList size={18} /> Avaliação
              </LinkButton>
              <LinkButton href={`/pacientes/${id}/prontuario/novo?tipo=evolucao`}>
                <Plus size={18} /> Evolução
              </LinkButton>
            </>
          )
        }
      />

      <p className="-mt-3 mb-6 flex items-center gap-1.5 text-[13px] text-faint">
        <Lock size={13} /> Conteúdo sigiloso. Só profissionais e o administrador veem, e cada acesso fica registrado.
      </p>

      <div className="space-y-8">
        {lastAssessment && (lastAssessment.queixa_principal || lastAssessment.diagnostico) && (
          <Card className="p-5">
            <p className="text-sm font-medium text-muted">Resumo da última avaliação · {formatDateShort(lastAssessment.record_date)}</p>
            {lastAssessment.queixa_principal && (
              <p className="mt-2 text-[15px]">
                <span className="font-medium">Queixa:</span> {lastAssessment.queixa_principal}
              </p>
            )}
            {lastAssessment.diagnostico && (
              <p className="mt-1 text-[15px]">
                <span className="font-medium">Diagnóstico:</span> {lastAssessment.diagnostico}
              </p>
            )}
          </Card>
        )}

        <Section title="Escalas e evolução da dor">
          {byScale.size > 0 && (
            <Card className="divide-y divide-line">
              {[...byScale.entries()].map(([k, pts]) => {
                const def = SCALES.find((s) => s.key === k);
                const last = pts[pts.length - 1];
                const first = pts[0];
                const better = def?.better ?? "lower";
                const improved = pts.length > 1 && (better === "lower" ? last.v < first.v : last.v > first.v);
                const worse = pts.length > 1 && (better === "lower" ? last.v > first.v : last.v < first.v);
                return (
                  <div key={k} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{SCALE_LABEL[k] ?? k}</p>
                      <p className="text-sm text-muted">
                        {pts.length > 1 ? `${first.v}${def?.unit ?? ""} → ` : ""}
                        <span className="font-semibold text-ink">
                          {last.v}
                          {def?.unit}
                        </span>
                        {def?.max ? ` de ${def.max}` : ""} · {formatDateShort(last.d)}
                      </p>
                    </div>
                    <Sparkline points={pts} max={def?.max ?? Math.max(...pts.map((p) => p.v), 1)} better={better} />
                    {improved && <TrendingDown size={18} className={cx(better === "higher" && "rotate-180", "text-ok")} aria-label="Melhorou" />}
                    {worse && <TrendingUp size={18} className={cx(better === "higher" && "rotate-180", "text-bad")} aria-label="Piorou" />}
                  </div>
                );
              })}
            </Card>
          )}
          <details className="group rounded-2xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-[15px] font-medium text-accent [&::-webkit-details-marker]:hidden">
              <Plus size={18} /> Registrar resultado de escala
            </summary>
            <div className="border-t border-line px-4 py-5">
              <ActionForm action={addScale} resetOnSuccess>
                <input type="hidden" name="patient_id" value={id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Escala">
                    <Select name="scale" defaultValue="eva">
                      {SCALES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Resultado">
                    <Input name="score" inputMode="decimal" required placeholder="Ex.: 32" />
                  </Field>
                  <Field label="Data">
                    <Input name="measured_on" type="date" defaultValue={todayISO()} />
                  </Field>
                </div>
                <SubmitButton size="md">Registrar</SubmitButton>
              </ActionForm>
            </div>
          </details>
        </Section>

        <Section title="Registros">
          {main.length === 0 ? (
            <EmptyState
              icon={<FileText size={22} />}
              title="Prontuário vazio"
              text="Comece pela avaliação. Depois, registre a evolução de cada sessão (exigência do COFFITO)."
              action={
                ctx.professionalId && (
                  <LinkButton href={`/pacientes/${id}/prontuario/novo?tipo=avaliacao`}>
                    <ClipboardList size={18} /> Fazer avaliação
                  </LinkButton>
                )
              }
            />
          ) : (
            <ol className="relative space-y-3 border-l-2 border-line pl-5">
              {main.map((r) => (
                <li key={r.id} className="relative">
                  <span
                    className={cx(
                      "absolute top-5 -left-[27px] size-3 rounded-full border-2 border-surface",
                      r.kind === "avaliacao" ? "bg-accent" : "bg-faint",
                    )}
                    aria-hidden
                  />
                  <Link href={`/pacientes/${id}/prontuario/${r.id}`} className="block">
                    <Card className="p-4 transition-colors hover:border-faint">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{KIND_LABEL[r.kind]}</span>
                        <span className="text-sm text-muted">{formatDateShort(r.record_date)}</span>
                        {r.dor_eva != null && <span className={cx("rounded-full px-2 py-0.5 text-[12px] font-medium", painColor(r.dor_eva))}>Dor {r.dor_eva}</span>}
                        <span className="ml-auto">
                          {r.signed_at ? (
                            <Badge tone="ok">
                              <PenLine size={12} /> Assinado
                            </Badge>
                          ) : (
                            <Badge tone="warn">Rascunho</Badge>
                          )}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[15px] text-muted">
                        {r.kind === "avaliacao" ? r.queixa_principal || r.diagnostico : r.conduta || r.subjetivo}
                      </p>
                      <p className="mt-1.5 text-[13px] text-faint">
                        {r.professionals?.name}
                        {r.professionals?.crefito && ` · CREFITO ${r.professionals.crefito}`}
                        {addendaCount.get(r.id) ? ` · ${addendaCount.get(r.id)} adendo(s)` : ""}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </>
  );
}
