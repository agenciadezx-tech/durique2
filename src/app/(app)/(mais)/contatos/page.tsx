import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, MessageCircle, Plus, UserCheck } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Alert, Badge, buttonClass, Card, cx, EmptyState, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatDateShort, formatPhone, todayISO } from "@/lib/format";
import { firstName, waSendLink } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { convertLead, createLead, moveLead, updateLead } from "./actions";

export const metadata = { title: "Interessados" };

const STAGES = [
  { key: "novo", label: "Novos", next: "contato", nextLabel: "Já conversei" },
  { key: "contato", label: "Em conversa", next: "avaliacao", nextLabel: "Marcou avaliação" },
  { key: "avaliacao", label: "Avaliação marcada", next: null, nextLabel: null },
  { key: "efetivado", label: "Viraram pacientes", next: null, nextLabel: null },
  { key: "perdido", label: "Não fecharam", next: null, nextLabel: null },
] as const;
type StageKey = (typeof STAGES)[number]["key"];
const OPEN: StageKey[] = ["novo", "contato", "avaliacao"];
const SOURCES = ["Instagram", "Indicação", "Google", "WhatsApp", "Passou na frente", "Wellhub / TotalPass", "Agendamento online", "Outro"];

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  source: string | null;
  interest: string | null;
  stage: StageKey;
  notes: string | null;
  next_action: string | null;
  next_action_on: string | null;
  lost_reason: string | null;
  patient_id: string | null;
  created_at: string;
  updated_at: string;
};

function LeadFields({ l }: { l?: Lead }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <Input name="name" required defaultValue={l?.name} autoComplete="off" />
        </Field>
        <Field label="WhatsApp">
          <Input name="phone" type="tel" inputMode="tel" defaultValue={l?.phone ? formatPhone(l.phone) : ""} placeholder="(11) 99999-8888" />
        </Field>
        <Field label="Como chegou">
          <Select name="source" defaultValue={l?.source ?? ""}>
            <option value="">Não sei</option>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
            {l?.source && !SOURCES.includes(l.source) && <option>{l.source}</option>}
          </Select>
        </Field>
        <Field label="Procura o quê">
          <Input name="interest" maxLength={120} defaultValue={l?.interest ?? ""} placeholder="Ex.: pilates 2x por semana, dor no joelho" />
        </Field>
        <Field label="Próximo passo">
          <Input name="next_action" maxLength={160} defaultValue={l?.next_action ?? ""} placeholder="Ex.: mandar valores" />
        </Field>
        <Field label="Quando">
          <Input name="next_action_on" type="date" defaultValue={l?.next_action_on ?? ""} />
        </Field>
      </div>
      <Field label="Anotações">
        <Textarea name="notes" maxLength={2000} defaultValue={l?.notes ?? ""} rows={2} />
      </Field>
    </>
  );
}

function LeadCard({ l, clinicName, today }: { l: Lead; clinicName: string; today: string }) {
  const st = STAGES.find((s) => s.key === l.stage)!;
  const late = l.next_action_on && l.next_action_on <= today && OPEN.includes(l.stage);
  const msg = `Olá, ${firstName(l.name)}! Aqui é da ${clinicName}. Tudo bem? Vi que você tem interesse${l.interest ? ` em ${l.interest}` : ""}. Posso te ajudar?`;
  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{l.name}</p>
            <p className="text-sm text-muted">
              {l.phone ? formatPhone(l.phone) : "Sem WhatsApp"}
              {l.source && ` · ${l.source}`}
            </p>
          </div>
          {l.phone && (
            <a
              href={waSendLink(l.phone, msg)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Chamar ${l.name} no WhatsApp`}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok hover:opacity-80"
            >
              <MessageCircle size={20} />
            </a>
          )}
        </div>
        {l.interest && <p className="mt-2 text-[15px]">{l.interest}</p>}
        {l.next_action && (
          <p className={cx("mt-2 flex items-center gap-1.5 text-sm", late ? "font-medium text-bad" : "text-muted")}>
            <CalendarClock size={15} /> {l.next_action}
            {l.next_action_on && ` · ${l.next_action_on === today ? "hoje" : formatDateShort(l.next_action_on)}`}
          </p>
        )}
        {l.stage === "perdido" && l.lost_reason && <p className="mt-2 text-sm text-muted">Motivo: {l.lost_reason}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-bg/50 px-4 py-3">
        {st.next && (
          <form action={moveLead}>
            <input type="hidden" name="id" value={l.id} />
            <button name="stage" value={st.next} className={buttonClass("secondary", "sm")}>
              {st.nextLabel} <ArrowRight size={15} />
            </button>
          </form>
        )}
        {OPEN.includes(l.stage) && (
          <form action={convertLead}>
            <input type="hidden" name="id" value={l.id} />
            <button className={buttonClass(l.stage === "avaliacao" ? "primary" : "ghost", "sm")}>
              <UserCheck size={15} /> Virou paciente
            </button>
          </form>
        )}
        {l.stage === "efetivado" && l.patient_id && (
          <Link href={`/pacientes/${l.patient_id}`} className={buttonClass("ghost", "sm")}>
            Abrir ficha <ArrowRight size={15} />
          </Link>
        )}
        {(l.stage === "perdido" || l.stage === "efetivado") && (
          <form action={moveLead}>
            <input type="hidden" name="id" value={l.id} />
            <button name="stage" value="contato" className={buttonClass("ghost", "sm")}>
              Voltar para conversa
            </button>
          </form>
        )}
        <details className="group w-full">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Editar ou desistir</span>
            <span className="hidden group-open:inline">Fechar</span>
          </summary>
          <div className="space-y-5 pt-2 pb-1">
            <ActionForm action={updateLead}>
              <input type="hidden" name="id" value={l.id} />
              <LeadFields l={l} />
              <SubmitButton size="md">Salvar</SubmitButton>
            </ActionForm>
            {OPEN.includes(l.stage) && (
              <form action={moveLead} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="stage" value="perdido" />
                <div className="min-w-48 flex-1">
                  <Field label="Por que não fechou? (opcional)">
                    <Input name="lost_reason" maxLength={160} placeholder="Ex.: achou caro, mudou de cidade" />
                  </Field>
                </div>
                <ConfirmSubmit size="md" question={`Mover ${l.name} para “Não fecharam”?`}>
                  Não fechou
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </details>
      </div>
    </Card>
  );
}

export default async function ContatosPage({ searchParams }: { searchParams: Promise<{ etapa?: string; erro?: string }> }) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/mais");
  const { etapa, erro } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, name, phone, source, interest, stage, notes, next_action, next_action_on, lost_reason, patient_id, created_at, updated_at")
    .eq("clinic_id", ctx.clinicId)
    .order("updated_at", { ascending: false })
    .limit(500);
  const leads = (data ?? []) as Lead[];
  const today = todayISO();
  const count = (k: StageKey) => leads.filter((l) => l.stage === k).length;
  const closedView = etapa === "efetivado" || etapa === "perdido" ? (etapa as StageKey) : null;
  const shown: StageKey[] = closedView ? [closedView] : OPEN;
  const lateCount = leads.filter((l) => OPEN.includes(l.stage) && l.next_action_on && l.next_action_on <= today).length;

  // conversão dos últimos 90 dias
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const recent = leads.filter((l) => l.created_at >= since);
  const won = recent.filter((l) => l.stage === "efetivado").length;
  const conv = recent.length ? Math.round((won / recent.length) * 100) : null;

  const sortOpen = (a: Lead, b: Lead) => (a.next_action_on ?? "9999").localeCompare(b.next_action_on ?? "9999") || b.updated_at.localeCompare(a.updated_at);

  return (
    <div data-wide>
      <PageHeader
        title="Interessados"
        description="Quem se interessou pela clínica e em que passo está, até virar paciente."
        back={{ href: "/mais", label: "Mais" }}
      />
      {erro && (
        <div className="mb-4">
          <Alert>Não foi possível criar o paciente. Confira o nome e o WhatsApp e tente de novo.</Alert>
        </div>
      )}

      <Card className="mb-5">
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-hover [&::-webkit-details-marker]:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-accent text-white">
              <Plus size={20} />
            </span>
            <span className="font-medium">Novo contato</span>
            <span className="ml-auto text-sm text-muted group-open:hidden">Abrir</span>
            <span className="ml-auto hidden text-sm text-muted group-open:inline">Fechar</span>
          </summary>
          <div className="border-t border-line px-4 py-5">
            <ActionForm action={createLead} resetOnSuccess>
              <LeadFields />
              <SubmitButton size="md">Adicionar</SubmitButton>
            </ActionForm>
          </div>
        </details>
      </Card>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/contatos"
          className={cx("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium", !closedView ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted")}
        >
          Em andamento <span className="tabular-nums">{OPEN.reduce((s, k) => s + count(k), 0)}</span>
        </Link>
        {(["efetivado", "perdido"] as const).map((k) => (
          <Link
            key={k}
            href={`/contatos?etapa=${k}`}
            className={cx("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium", closedView === k ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted")}
          >
            {STAGES.find((s) => s.key === k)!.label} <span className="tabular-nums">{count(k)}</span>
          </Link>
        ))}
        <span className="ml-auto text-sm text-muted">
          {lateCount > 0 && <Badge tone="bad">{lateCount} para retornar hoje</Badge>}
          {conv != null && <span className="ml-2">{conv}% viraram pacientes (90 dias)</span>}
        </span>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="Nenhum contato ainda"
          text="Toque em “Novo contato” e anote quem chamou no WhatsApp, no Instagram ou passou na frente. Quem marca pelo link da clínica entra sozinho."
        />
      ) : (
        <div className={cx("grid gap-5", !closedView && "lg:grid-cols-3")}>
          {shown.map((k) => {
            const st = STAGES.find((s) => s.key === k)!;
            const list = leads.filter((l) => l.stage === k).sort(closedView ? undefined : sortOpen);
            return (
              <section key={k} className="space-y-3">
                <h2 className="flex items-center gap-2 px-1 text-[15px] font-semibold">
                  {st.label} <span className="rounded-full bg-hover px-2 text-[13px] text-muted tabular-nums">{list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Ninguém aqui.</p>
                ) : (
                  <div className={cx("grid gap-3", closedView && "sm:grid-cols-2 lg:grid-cols-3")}>
                    {list.map((l) => (
                      <LeadCard key={l.id} l={l} clinicName={ctx.clinicName} today={today} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
