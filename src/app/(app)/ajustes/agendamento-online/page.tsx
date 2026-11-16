import { headers } from "next/headers";
import { ExternalLink, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Avatar, Card, cx, EmptyState, Field, Input, PageHeader, Section, Select, Textarea } from "@/components/ui";
import { getContext } from "@/lib/context";
import { proColor } from "@/lib/colors";
import { WEEKDAYS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addAvailability, removeAvailability, saveBooking, saveIdentity } from "./actions";
import { ColorField } from "../product-fields";
import { formatPhone } from "@/lib/format";

export const metadata = { title: "Agendamento online" };

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export default async function BookingSettingsPage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const [{ data: clinic }, { data: services }, { data: pros }, { data: avail }] = await Promise.all([
    supabase.from("clinics").select("name, booking_slug, booking_enabled, booking_message, brand_color, contact_whatsapp, instagram, address, show_prices, waitlist_public").eq("id", ctx.clinicId).single(),
    supabase.from("services").select("id, name, kind, bookable").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("professionals").select("id, name, color").eq("clinic_id", ctx.clinicId).eq("active", true).order("name"),
    supabase.from("availability").select("id, professional_id, weekday, start_time, end_time").eq("clinic_id", ctx.clinicId).order("weekday").order("start_time"),
  ]);
  const hh = await headers();
  const origin = `${hh.get("x-forwarded-proto") ?? "https"}://${hh.get("host")}`;
  const suggested = (clinic?.name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const link = clinic?.booking_slug ? `${origin}/agendar/${clinic.booking_slug}` : null;
  const admin = ctx.isAdmin;
  const hasIndividual = (services ?? []).some((s) => s.bookable && s.kind === "individual");
  const t = (s: string) => s.slice(0, 5);

  return (
    <>
      <PageHeader
        title="Agendamento online"
        description="Um link só: quem ainda não é paciente marca sozinho; quem já é entra no próprio painel."
        back={{ href: "/ajustes", label: "Minha clínica" }}
      />
      <div className="space-y-10">
        {link && clinic?.booking_enabled && (
          <Card className="flex flex-wrap items-center gap-3 bg-accent-soft p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-accent">Seu link está no ar</p>
              <p className="truncate text-[15px] font-medium">{link}</p>
              <p className="text-sm text-muted">Coloque na bio do Instagram e no WhatsApp da clínica.</p>
            </div>
            <CopyButton text={link} label="Copiar link" />
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-hover">
              <ExternalLink size={16} /> Abrir
            </a>
          </Card>
        )}

        <Section title="1. Ligar e escolher os atendimentos">
          <Card className="p-5 sm:p-6">
            <ActionForm action={saveBooking}>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="enabled" defaultChecked={clinic?.booking_enabled} disabled={!admin} className="size-5 accent-[var(--color-accent)]" />
                <span className="font-medium">Aceitar agendamentos pelo link</span>
              </label>
              <Field label="Endereço do link" hint={`Fica assim: ${origin}/agendar/${clinic?.booking_slug || suggested || "sua-clinica"}`}>
                <Input name="slug" defaultValue={clinic?.booking_slug ?? suggested} disabled={!admin} placeholder="sua-clinica" />
              </Field>
              <Field label="Recado no topo da página (opcional)">
                <Textarea
                  name="message"
                  rows={2}
                  defaultValue={clinic?.booking_message ?? ""}
                  disabled={!admin}
                  placeholder="Ex.: Primeira aula experimental grátis! Chegue 10 minutos antes."
                />
              </Field>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">O que o paciente pode marcar sozinho</legend>
                {(services ?? []).length === 0 && <p className="text-sm text-muted">Cadastre serviços em Minha clínica primeiro.</p>}
                {(services ?? []).map((s) => (
                  <label key={s.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3">
                    <input type="checkbox" name="bookable" value={s.id} defaultChecked={s.bookable} disabled={!admin} className="size-5 accent-[var(--color-accent)]" />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-sm text-muted">{s.kind === "turma" ? "Escolhe uma turma com vaga" : "Escolhe um horário livre"}</span>
                  </label>
                ))}
              </fieldset>
              {admin && <SubmitButton size="md">Salvar</SubmitButton>}
            </ActionForm>
          </Card>
        </Section>

        <Section title="2. Aparência e contato">
          <Card className="p-5 sm:p-6">
            <ActionForm action={saveIdentity}>
              <ColorField value={clinic?.brand_color} legend="Cor da clínica na página" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="WhatsApp da clínica" hint="Botão de contato na página e no painel do aluno.">
                  <Input name="whatsapp" type="tel" inputMode="tel" defaultValue={formatPhone(clinic?.contact_whatsapp)} disabled={!admin} placeholder="(11) 99999-8888" />
                </Field>
                <Field label="Instagram">
                  <Input name="instagram" defaultValue={clinic?.instagram ? `@${clinic.instagram}` : ""} disabled={!admin} placeholder="@suaclinica" />
                </Field>
              </div>
              <Field label="Endereço" hint="Aparece com o botão 'Ver no mapa'.">
                <Input name="address" defaultValue={clinic?.address ?? ""} disabled={!admin} placeholder="Rua, número, bairro, cidade" />
              </Field>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="show_prices" defaultChecked={clinic?.show_prices ?? true} disabled={!admin} className="size-5 accent-[var(--color-accent)]" />
                <span>Mostrar o preço dos serviços na página</span>
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="waitlist_public" defaultChecked={clinic?.waitlist_public ?? true} disabled={!admin} className="size-5 accent-[var(--color-accent)]" />
                <span>Turma cheia: deixar a pessoa entrar na lista de espera pelo link</span>
              </label>
              {admin && <SubmitButton size="md">Salvar aparência</SubmitButton>}
            </ActionForm>
          </Card>
        </Section>

        <Section title="3. Horários de atendimento">
          <p className="-mt-1 text-[15px] text-muted">
            Para atendimentos individuais, o sistema mostra só os horários livres dentro destes períodos, sem conflito com a agenda.
            Para aulas em grupo, aparecem as vagas livres das turmas.
          </p>
          {hasIndividual && (avail ?? []).length === 0 && (
            <Alert tone="info">Sem horários de atendimento, o paciente não vai ver horários livres para os atendimentos individuais.</Alert>
          )}
          {(pros ?? []).length === 0 ? (
            <EmptyState title="Nenhum profissional ativo" text="Cadastre os profissionais em Minha clínica para definir os horários." />
          ) : (
            <div className="space-y-3">
              {(pros ?? []).map((p) => {
                const list = (avail ?? []).filter((a) => a.professional_id === p.id);
                return (
                  <Card key={p.id} className="overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                      <span className="size-3 rounded-full" style={{ background: proColor(p.color, p.id) }} />
                      <Avatar name={p.name} />
                      <span className="font-medium">{p.name}</span>
                    </div>
                    {list.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted">Sem horários de atendimento.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {list.map((a) => (
                          <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                            <span className="w-24 font-medium capitalize">{WEEKDAYS[a.weekday]}</span>
                            <span className="flex-1 tabular-nums text-muted">
                              {t(a.start_time)} às {t(a.end_time)}
                            </span>
                            {admin && (
                              <form action={removeAvailability}>
                                <input type="hidden" name="id" value={a.id} />
                                <button type="submit" aria-label="Remover" className="grid size-11 place-items-center rounded-full text-muted hover:bg-hover hover:text-bad">
                                  <Trash2 size={18} />
                                </button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          {admin && (pros ?? []).length > 0 && (
            <Card className="p-5 sm:p-6">
              <ActionForm action={addAvailability} resetOnSuccess>
                <h3 className="font-semibold">Adicionar período</h3>
                <Field label="Profissional">
                  <Select name="professional_id" required defaultValue={(pros ?? []).length === 1 ? pros![0].id : ""}>
                    <option value="">Escolha…</option>
                    {(pros ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Dias da semana</legend>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((d) => (
                      <label key={d} className="cursor-pointer">
                        <input type="checkbox" name="weekday" value={d} defaultChecked={d <= 5} className="peer sr-only" />
                        <span
                          className={cx(
                            "inline-flex h-11 min-w-14 items-center justify-center rounded-xl border border-line px-3 text-sm font-medium capitalize transition-colors",
                            "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                          )}
                        >
                          {WEEKDAYS[d].slice(0, 3)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Das">
                    <Input name="start_time" type="time" required defaultValue="08:00" />
                  </Field>
                  <Field label="Até">
                    <Input name="end_time" type="time" required defaultValue="12:00" />
                  </Field>
                </div>
                <SubmitButton size="md">Adicionar</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </Section>
      </div>
    </>
  );
}
