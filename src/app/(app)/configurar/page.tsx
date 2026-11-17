import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, FileSpreadsheet, Layers, MessageCircle, Stethoscope, UserPlus, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Badge, buttonClass, Card, cx, Field, Input, Select } from "@/components/ui";
import { getContext, ROLE_LABEL } from "@/lib/context";
import { WEEKDAYS_SHORT, WEEKDAYS } from "@/lib/format";
import { DEFAULT_SERVICES, EXTRA_SERVICES, SETUP_STEPS, type PracticeType } from "@/lib/setup";
import { createClient } from "@/lib/supabase/server";
import { addQuickPatient, addTeamMember, dismissSetup, finishSetup, saveHours, saveLink, saveProfile, saveServices, saveType } from "./actions";
import { ServicesEditor } from "./services-editor";

export const metadata = { title: "Configurar clínica" };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const fmtCep = (c: string | null) => (c ? `${c.slice(0, 5)}-${c.slice(5)}` : "");
const fmtCnpj = (c: string | null) => (c ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "");
const toPrice = (c: number | null) => (c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));

/** Rodapé de cada passo: Voltar · Não preciso de ajuda · Pular · Salvar e continuar. */
function Footer({ n, inForm, skip, primary, solo }: { n: number; inForm: boolean; skip?: boolean; primary: ReactNode; solo?: boolean }) {
  if (solo)
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-bg/70 px-5 py-3.5 sm:px-8">
        <input type="hidden" name="so" value="1" />
        <Link href="/ajustes" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft size={16} /> Configurações
        </Link>
        <span className="ml-auto">
          <SubmitButton size="md">Salvar</SubmitButton>
        </span>
      </div>
    );
  const inner = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-bg/70 px-5 py-3.5 sm:px-8">
      {n > 1 && (
        <Link href={`/configurar?passo=${n - 1}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft size={16} /> Voltar
        </Link>
      )}
      <button formAction={dismissSetup} formNoValidate className="min-h-11 text-sm text-faint hover:text-muted">
        Não preciso de ajuda
      </button>
      <span className="ml-auto flex items-center gap-3">
        {skip && (
          <Link href={`/configurar?passo=${n + 1}`} className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-ink">
            Pular por agora
          </Link>
        )}
        {primary}
      </span>
    </div>
  );
  return inForm ? inner : <form action={dismissSetup}>{inner}</form>;
}

const formCls = "flex min-h-0 flex-1 flex-col space-y-0! [&>[role=alert]]:mx-5 [&>[role=alert]]:mt-4 sm:[&>[role=alert]]:mx-8 [&>[role=status]]:mx-5 [&>[role=status]]:mt-4";
const bodyCls = "flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-8";

export default async function ConfigurarPage({ searchParams }: { searchParams: Promise<{ passo?: string; so?: string }> }) {
  const ctx = await getContext();
  if (!ctx.isAdmin) redirect("/agenda");
  const sp = await searchParams;
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [{ data: clinic }, { count: nPatients }, { data: hours }, { data: services }, { data: wa }, { data: invites }, { count: nPros }] = await Promise.all([
    supabase
      .from("clinics")
      .select("name, practice_type, session_minutes, cep, address, cnpj, legal_responsible, responsible_crefito, booking_slug, booking_enabled")
      .eq("id", ctx.clinicId)
      .single(),
    supabase.from("patients").select("id", head).eq("clinic_id", ctx.clinicId),
    supabase.from("clinic_hours").select("weekday, opens, closes").eq("clinic_id", ctx.clinicId).order("weekday"),
    supabase.from("services").select("id, name, kind, duration_min, default_capacity, price_cents").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("whatsapp_settings").select("connected").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase
      .from("invites")
      .select("id, email, role, token")
      .eq("clinic_id", ctx.clinicId)
      .is("accepted_at", null)
      .eq("revoked", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("professionals").select("id", head).eq("clinic_id", ctx.clinicId).eq("active", true),
  ]);
  if (!clinic) redirect("/agenda");
  const type = (clinic.practice_type ?? "ambos") as PracticeType;
  type Member = { member_id: string; email: string; role: string; active: boolean; professional_name: string | null };
  const members = ((await supabase.rpc("clinic_members", { p_clinic: ctx.clinicId })).data ?? []) as Member[];

  const done: Record<number, boolean> = {
    1: !!clinic.practice_type,
    2: (nPatients ?? 0) > 0,
    3: !!wa?.connected,
    4: (hours ?? []).length > 0,
    5: (services ?? []).some((s) => s.price_cents != null),
    6: !!(clinic.address || clinic.cnpj || clinic.cep),
    7: !!clinic.booking_enabled,
    8: members.length > 1 || (invites ?? []).length > 0,
  };
  const firstOpen = SETUP_STEPS.find((s) => !done[s.n])?.n ?? 8;
  const isEnd = sp.passo === "fim";
  const solo = !!sp.so && (sp.passo === "4" || sp.passo === "6"); // aberto pelas Configurações: só este passo
  const n = isEnd ? 9 : Math.min(8, Math.max(1, Number(sp.passo) || firstOpen));
  const step = SETUP_STEPS.find((s) => s.n === n);
  const doneCount = SETUP_STEPS.filter((s) => done[s.n]).length;
  const hh = await headers();
  const origin = `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("host")}`;

  // ===== Conteúdo de cada passo =====
  let title = "";
  let desc = "";
  let content: ReactNode = null;

  if (n === 1) {
    title = "Como sua clínica trabalha?";
    desc = "Isso ajusta o que aparece para você e os serviços sugeridos. Dá para mudar depois.";
    const opts = [
      { v: "fisio", icon: Stethoscope, t: "Só consultas", d: "Atendimento individual: avaliação, fisioterapia, RPG…" },
      { v: "aulas", icon: Users, t: "Só aulas em grupo", d: "Pilates, funcional e outras práticas em turma." },
      { v: "ambos", icon: Layers, t: "Os dois", d: "Consultas individuais e turmas em grupo." },
    ];
    content = (
      <ActionForm action={saveType} className={formCls}>
        <div className={bodyCls}>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">Tipo de clínica</legend>
            {opts.map((o) => (
              <label key={o.v} className="cursor-pointer">
                <input type="radio" name="practice_type" value={o.v} defaultChecked={(clinic.practice_type ?? "") === o.v} className="peer sr-only" required />
                <span className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:ring-2 peer-checked:ring-accent/30 peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft hover:border-faint">
                  <span className="grid size-11 place-items-center rounded-xl bg-hover text-ink">
                    <o.icon size={21} />
                  </span>
                  <span className="mt-4 font-semibold">{o.t}</span>
                  <span className="mt-0.5 text-sm text-muted">{o.d}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <Footer n={1} inForm primary={<SubmitButton size="md">Salvar e continuar</SubmitButton>} />
      </ActionForm>
    );
  } else if (n === 2) {
    title = "Traga seus pacientes";
    desc = "O sistema fica útil de verdade com seus pacientes dentro. Pode ser agora ou depois.";
    content = (
      <>
        <div className={bodyCls}>
          {(nPatients ?? 0) > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-[15px] text-ok">
              <Check size={18} /> Você já tem {nPatients} paciente{nPatients === 1 ? "" : "s"} cadastrado{nPatients === 1 ? "" : "s"}.
            </p>
          )}
          <Card className="flex flex-wrap items-center gap-4 border-accent/40 bg-accent-soft/40 p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-surface text-accent">
              <FileSpreadsheet size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Subir uma planilha</span>
              <span className="text-sm text-muted">Já tem os pacientes no Excel ou em outro sistema? Tem planilha modelo lá dentro.</span>
            </span>
            <Link href="/pacientes/importar?volta=configurar" className={buttonClass("primary", "md")}>
              Escolher arquivo
            </Link>
          </Card>
          <Card className="p-4">
            <p className="font-semibold">Adicionar alguns à mão</p>
            <p className="mb-4 text-sm text-muted">Comece com 2 ou 3 para sentir o sistema. O resto depois.</p>
            <ActionForm action={addQuickPatient} resetOnSuccess className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_auto] sm:items-end">
                <Field label="Nome">
                  <Input name="name" required autoComplete="off" />
                </Field>
                <Field label="WhatsApp">
                  <Input name="phone" type="tel" inputMode="tel" placeholder="(11) 99999-8888" />
                </Field>
                <SubmitButton size="md" variant="secondary" pendingText="Salvando…">
                  Adicionar
                </SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
        <Footer
          n={2}
          inForm={false}
          skip={(nPatients ?? 0) === 0}
          primary={
            (nPatients ?? 0) > 0 ? (
              <Link href="/configurar?passo=3" className={buttonClass("primary", "md")}>
                Continuar
              </Link>
            ) : null
          }
        />
      </>
    );
  } else if (n === 3) {
    title = "WhatsApp";
    desc = "Lembretes, confirmações e cobranças direto no WhatsApp do paciente.";
    content = (
      <>
        <div className={bodyCls}>
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-ok-soft text-ok">
              <MessageCircle size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Conectar o WhatsApp da clínica</span>
              <span className={cx("text-sm", wa?.connected ? "text-ok" : "text-muted")}>
                {wa?.connected ? "Conectado. Os avisos já saem sozinhos." : "A conexão pelo QR Code chega em breve."}
              </span>
            </span>
            {!wa?.connected && <Badge tone="warn">Em breve</Badge>}
          </Card>
          <div className="rounded-2xl border border-line bg-bg p-4 text-[15px]">
            <p className="font-medium">Enquanto isso, já funciona assim:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
              <li>Na Central do WhatsApp aparecem os lembretes de amanhã, as cobranças e os pacotes acabando.</li>
              <li>Você toca em Enviar e o WhatsApp abre com a mensagem pronta.</li>
              <li>Os textos e o que fica ligado você escolhe em Avisos automáticos.</li>
            </ul>
            <Link href="/whatsapp/avisos" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent">
              Ver os avisos →
            </Link>
          </div>
        </div>
        <Footer
          n={3}
          inForm={false}
          primary={
            <Link href="/configurar?passo=4" className={buttonClass("primary", "md")}>
              Continuar
            </Link>
          }
        />
      </>
    );
  } else if (n === 4) {
    title = "Horários de atendimento";
    desc = "Define os horários livres na agenda e no agendamento online.";
    const byDay = new Map((hours ?? []).map((h) => [h.weekday, h]));
    const first = (hours ?? [])[0];
    const opens = first?.opens?.slice(0, 5) ?? "08:00";
    const closes = first?.closes?.slice(0, 5) ?? "18:00";
    const order = [7, 1, 2, 3, 4, 5, 6];
    const checked = (d: number) => (hours?.length ? byDay.has(d) : d >= 1 && d <= 5);
    const different = (hours ?? []).some((h) => h.opens.slice(0, 5) !== opens || h.closes.slice(0, 5) !== closes);
    content = (
      <ActionForm action={saveHours} className={formCls}>
        <div className={bodyCls}>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Dias de atendimento</legend>
            <div className="flex flex-wrap gap-2">
              {order.map((d) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="days" value={d} defaultChecked={checked(d)} className="peer sr-only" />
                  <span className="grid h-11 min-w-14 place-items-center rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold text-muted capitalize peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft">
                    {WEEKDAYS_SHORT[d]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Abre às">
              <Input type="time" name="opens" defaultValue={opens} required />
            </Field>
            <Field label="Fecha às">
              <Input type="time" name="closes" defaultValue={closes} required />
            </Field>
            <Field label="Duração da sessão">
              <Select name="session_minutes" defaultValue={String(clinic.session_minutes ?? 50)}>
                {[30, 40, 45, 50, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <details className="group" open={different}>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
              + Algum dia tem horário diferente?
            </summary>
            <div className="mt-2 space-y-2 rounded-2xl border border-line p-4">
              <p className="text-sm text-muted">Preencha só os dias diferentes (ex.: sábado até 12h). Vazio = horário de cima.</p>
              {order.map((d) => (
                <div key={d} className="grid grid-cols-[80px_1fr_1fr] items-center gap-2">
                  <span className="text-sm font-medium">{WEEKDAYS[d]}</span>
                  <Input type="time" name={`o_${d}`} aria-label={`${WEEKDAYS[d]}: abre`} defaultValue={different && byDay.get(d) ? byDay.get(d)!.opens.slice(0, 5) : ""} />
                  <Input type="time" name={`c_${d}`} aria-label={`${WEEKDAYS[d]}: fecha`} defaultValue={different && byDay.get(d) ? byDay.get(d)!.closes.slice(0, 5) : ""} />
                </div>
              ))}
            </div>
          </details>
          <p className="text-[13px] text-muted">
            Os profissionais que ainda não têm horário próprio passam a atender nesse horário. Feriados e folgas você marca depois em Configurações.
          </p>
        </div>
        <Footer n={4} inForm solo={solo} primary={<SubmitButton size="md">Salvar e continuar</SubmitButton>} />
      </ActionForm>
    );
  } else if (n === 5) {
    title = "Serviços e valores";
    desc = "Já deixamos os principais prontos. Ajuste os preços e acrescente o que faltar.";
    const existing = (services ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      kind: (s.kind === "turma" ? "turma" : "individual") as "individual" | "turma",
      duration: s.duration_min,
      price: toPrice(s.price_cents),
    }));
    const wantC = type !== "aulas";
    const wantA = type !== "fisio";
    const suggestions = [...(wantC ? DEFAULT_SERVICES.individual : []), ...(wantA ? DEFAULT_SERVICES.turma : [])]
      .filter((s) => !existing.some((e) => e.kind === s.kind))
      .map((s) => ({ name: s.name, kind: s.kind, duration: s.kind === "individual" ? s.duration : s.duration, price: "" }));
    const cap = (services ?? []).find((s) => s.kind === "turma")?.default_capacity ?? 6;
    content = (
      <ActionForm action={saveServices} className={formCls}>
        <div className={bodyCls}>
          <ServicesEditor initial={[...existing, ...suggestions]} extras={EXTRA_SERVICES} showConsultas={wantC} showAulas={wantA} capacity={cap} />
        </div>
        <Footer n={5} inForm primary={<SubmitButton size="md">Salvar e continuar</SubmitButton>} />
      </ActionForm>
    );
  } else if (n === 6) {
    title = "Dados da clínica";
    desc = "Identificação e dados legais, usados em recibos, contratos e na página da clínica.";
    content = (
      <ActionForm action={saveProfile} className={formCls}>
        <div className={bodyCls}>
          <p className="rounded-xl bg-bg px-4 py-3 text-sm text-muted">
            Só o nome é obrigatório. O resto aparece em recibos e contratos. Pode preencher agora ou depois em Configurações.
          </p>
          <Field label="Nome da clínica">
            <Input name="name" defaultValue={clinic.name} required maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Field label="CEP">
              <Input name="cep" inputMode="numeric" defaultValue={fmtCep(clinic.cep)} placeholder="00000-000" />
            </Field>
            <Field label="Endereço">
              <Input name="address" defaultValue={clinic.address ?? ""} placeholder="Rua, número, bairro, cidade" maxLength={200} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="CNPJ (se tiver)">
              <Input name="cnpj" inputMode="numeric" defaultValue={fmtCnpj(clinic.cnpj)} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="Responsável técnico">
              <Input name="legal_responsible" defaultValue={clinic.legal_responsible ?? ""} placeholder="Nome completo" />
            </Field>
            <Field label="CREFITO do responsável">
              <Input name="responsible_crefito" defaultValue={clinic.responsible_crefito ?? ""} placeholder="000000-F" />
            </Field>
          </div>
        </div>
        <Footer n={6} inForm solo={solo} primary={<SubmitButton size="md">Salvar e continuar</SubmitButton>} />
      </ActionForm>
    );
  } else if (n === 7) {
    title = "Página da clínica";
    desc = "Um link só: o paciente novo marca sozinho e quem já é paciente entra no painel dele.";
    const slug = clinic.booking_slug ?? slugify(clinic.name);
    content = (
      <ActionForm action={saveLink} className={formCls}>
        <div className={bodyCls}>
          <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-line bg-surface p-4">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Ligar a página da clínica</span>
              <span className="text-sm text-muted">Pacientes marcam sozinhos, 24h por dia, nos horários livres. Você vê tudo na agenda.</span>
            </span>
            <input type="checkbox" name="enabled" defaultChecked={clinic.booking_enabled || !clinic.booking_slug} className="peer sr-only" />
            <span className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          </label>
          <Field label="Endereço do seu link" hint="É esse link que você coloca no Instagram e manda pelo WhatsApp.">
            <div className="flex overflow-hidden rounded-xl border border-line bg-surface focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
              <span className="hidden items-center bg-bg pl-3.5 text-[15px] text-muted sm:flex">{origin.replace(/^https?:\/\//, "")}/agendar/</span>
              <input name="slug" defaultValue={slug} required className="h-12 min-w-0 flex-1 bg-transparent px-2 text-[16px] font-medium focus:outline-none" aria-label="Final do link" />
            </div>
          </Field>
          {clinic.booking_enabled && clinic.booking_slug && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={`${origin}/agendar/${clinic.booking_slug}`} />
              <a href={`/agendar/${clinic.booking_slug}`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
                Abrir a página ↗
              </a>
            </div>
          )}
          <p className="text-[13px] text-muted">Cor, foto, Instagram e quais serviços aparecem você ajusta depois em Mais › Página da clínica.</p>
        </div>
        <Footer n={7} inForm skip primary={<SubmitButton size="md">Salvar e continuar</SubmitButton>} />
      </ActionForm>
    );
  } else if (n === 8) {
    title = "Sua equipe";
    desc = "Você já faz parte da equipe e pode usar o sistema sem mais ninguém. Adicione as outras pessoas agora ou depois.";
    content = (
      <>
        <div className={bodyCls}>
          <Card className="divide-y divide-line">
            {members.map((m) => (
              <div key={m.member_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.professional_name ?? m.email} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.professional_name ?? m.email} {m.email === ctx.email && <Badge tone="ok">você</Badge>}
                  </span>
                  <span className="block truncate text-sm text-muted">{m.email}</span>
                </span>
                <Badge>{ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? m.role}</Badge>
              </div>
            ))}
            {(invites ?? []).map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={i.email} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.email}</span>
                  <span className="text-sm text-warn">Convite enviado · aguardando · {ROLE_LABEL[i.role as keyof typeof ROLE_LABEL]}</span>
                </span>
                <CopyButton text={`${origin}/convite/${i.token}`} label="Copiar convite" />
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 font-semibold">
              <UserPlus size={18} className="text-accent" /> Adicionar pessoa
            </p>
            <ActionForm action={addTeamMember} resetOnSuccess className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome">
                  <Input name="name" required autoComplete="off" />
                </Field>
                <Field label="E-mail (para o convite)">
                  <Input name="email" type="email" required autoComplete="off" />
                </Field>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <Field label="Função">
                    <Select name="role" defaultValue="profissional">
                      <option value="profissional">Profissional (atende)</option>
                      <option value="recepcao">Recepção</option>
                      <option value="financeiro">Financeiro</option>
                      <option value="admin">Administrador / sócio</option>
                    </Select>
                  </Field>
                </div>
                <SubmitButton size="md" variant="secondary">
                  Adicionar
                </SubmitButton>
              </div>
              <p className="text-[13px] text-muted">
                Cada pessoa recebe um link de convite para criar a senha e entrar. Profissional vê a própria agenda e os próprios pacientes; recepção marca
                horários e recebe pagamentos.
              </p>
            </ActionForm>
          </Card>
        </div>
        <Footer
          n={8}
          inForm={false}
          primary={
            <Link href="/configurar?passo=fim" className={buttonClass("primary", "md")}>
              Revisar e concluir
            </Link>
          }
        />
      </>
    );
  } else {
    title = doneCount >= 5 ? "Sua clínica está pronta!" : "Quase lá";
    desc = "Veja o que ficou configurado. O que faltar dá para fazer depois. A barra na tela Hoje lembra você.";
    content = (
      <>
        <div className={bodyCls}>
          <Card className="divide-y divide-line">
            {SETUP_STEPS.map((s) => (
              <Link key={s.n} href={`/configurar?passo=${s.n}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-hover">
                <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold", done[s.n] ? "bg-ok text-white" : "border border-line text-muted")}>
                  {done[s.n] ? <Check size={16} /> : s.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.title}</span>
                  <span className="text-sm text-muted">
                    {s.n === 1 && (clinic.practice_type ? { fisio: "Só consultas", aulas: "Só aulas em grupo", ambos: "Consultas e aulas" }[type] : "Não respondido")}
                    {s.n === 2 && `${nPatients ?? 0} pacientes`}
                    {s.n === 3 && (wa?.connected ? "Conectado" : "Pela Central, por enquanto")}
                    {s.n === 4 &&
                      ((hours ?? []).length
                        ? (hours ?? []).map((h) => WEEKDAYS_SHORT[h.weekday]).join(", ") +
                          ` · ${(hours ?? [])[0].opens.slice(0, 5)}–${(hours ?? [])[0].closes.slice(0, 5)}` +
                          (hours ?? [])
                            .filter((h) => h.opens !== (hours ?? [])[0].opens || h.closes !== (hours ?? [])[0].closes)
                            .map((h) => ` · ${WEEKDAYS_SHORT[h.weekday]} ${h.opens.slice(0, 5)}–${h.closes.slice(0, 5)}`)
                            .join("")
                        : "Não definido")}
                    {s.n === 5 && `${(services ?? []).length} serviços`}
                    {s.n === 6 && (done[6] ? "Preenchido" : "Só o nome")}
                    {s.n === 7 && (clinic.booking_enabled ? `Ligada · /agendar/${clinic.booking_slug}` : "Desligada")}
                    {s.n === 8 && `${members.length} na equipe${(invites ?? []).length ? ` · ${(invites ?? []).length} convite(s)` : ""}${nPros ? ` · ${nPros} atendem` : ""}`}
                  </span>
                </span>
                {!done[s.n] && <span className="text-sm text-accent">Fazer</span>}
              </Link>
            ))}
          </Card>
        </div>
        <form action={finishSetup}>
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-bg/70 px-5 py-3.5 sm:px-8">
            <Link href="/configurar?passo=8" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-ink">
              <ArrowLeft size={16} /> Voltar
            </Link>
            <span className="ml-auto">
              <SubmitButton size="md" pendingText="Aguarde…">
                Concluir e ir para a agenda
              </SubmitButton>
            </span>
          </div>
        </form>
      </>
    );
  }

  return (
    <div data-split className="min-h-dvh lg:flex lg:items-center lg:justify-center lg:bg-ink/[0.04] lg:p-8">
      <div className="flex min-h-dvh w-full flex-col bg-surface pb-16 lg:h-[min(780px,calc(100dvh-4rem))] lg:min-h-0 lg:max-w-5xl lg:flex-row lg:overflow-hidden lg:rounded-3xl lg:border lg:border-line lg:pb-0 lg:shadow-xl">
        {/* Passos (computador) */}
        <aside className={cx("hidden w-64 shrink-0 flex-col border-r border-line bg-bg", !solo && "lg:flex")}>
          <div className="border-b border-line px-5 py-5">
            <p className="font-semibold">Configurar clínica</p>
            <p className="text-sm text-muted">{isEnd ? "Revisão" : `${n} de ${SETUP_STEPS.length}`}</p>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Passos">
            {(["Essencial", "Recomendado"] as const).map((g) => (
              <div key={g} className="mb-4">
                <p className="mb-1 px-2 text-[12px] font-semibold tracking-wide text-muted uppercase">{g}</p>
                {SETUP_STEPS.filter((s) => s.group === g).map((s) => (
                  <Link
                    key={s.n}
                    href={`/configurar?passo=${s.n}`}
                    aria-current={s.n === n ? "step" : undefined}
                    className={cx("flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 text-[15px]", s.n === n ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-hover")}
                  >
                    <span
                      className={cx(
                        "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                        s.n === n ? "bg-accent text-white" : done[s.n] ? "bg-ok text-white" : "border border-line bg-surface",
                      )}
                    >
                      {done[s.n] && s.n !== n ? <Check size={13} /> : s.n}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">{s.title}</span>
                    {s.optional && <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-medium text-warn">opcional</span>}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <p className="border-t border-line px-5 py-3 text-[13px] text-muted">
            {doneCount} de {SETUP_STEPS.length} prontos
          </p>
        </aside>

        {/* Conteúdo */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-line px-5 pt-5 pb-4 sm:px-8 lg:pt-7">
            <div className={cx("mb-3 flex items-center gap-3 lg:hidden", solo && "hidden")}>
              <span className="text-sm font-medium text-muted">{isEnd ? "Revisão" : `Passo ${n} de ${SETUP_STEPS.length}`}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(Math.min(n, 8) / 8) * 100}%` }} />
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {step && (
                  <p className={cx("text-[12px] font-semibold tracking-wide uppercase", step.optional ? "text-warn" : "text-accent")}>
                    {step.group}
                    {step.optional ? " · opcional" : ""}
                  </p>
                )}
                <h1 className="text-[24px] leading-tight font-semibold tracking-tight">{title}</h1>
                <p className="mt-1 text-[15px] text-muted">{desc}</p>
              </div>
              <Link href={solo ? "/ajustes" : "/agenda"} aria-label="Fechar e continuar depois" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover">
                <X size={20} />
              </Link>
            </div>
          </div>
          {content}
        </section>
      </div>
    </div>
  );
}
