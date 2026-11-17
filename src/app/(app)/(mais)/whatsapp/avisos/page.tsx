import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Cake,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  Coins,
  FileText,
  Globe,
  Heart,
  List,
  MessageCircle,
  Moon,
  Package,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, cx, Textarea } from "@/components/ui";
import { AUTOMATIONS, automationState, GROUPS, VAR_LABEL, type Automation } from "@/lib/automations";
import { getContext } from "@/lib/context";
import { renderTemplate } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { saveAutomationText, saveSendWindow, toggleAutomation } from "../actions";

export const metadata = { title: "Avisos automáticos" };

const ICONS: Record<Automation["icon"], LucideIcon> = {
  check: Check,
  refresh: RefreshCw,
  bell: Bell,
  clock: Clock,
  globe: Globe,
  list: List,
  users: Users,
  cake: Cake,
  heart: Heart,
  moon: Moon,
  star: Star,
  alert: AlertTriangle,
  coins: Coins,
  calendar: CalendarDays,
  package: Package,
  file: FileText,
  clipboard: ClipboardList,
};

const SAMPLE: Record<string, string> = {
  nome: "Maria",
  paciente: "Maria Oliveira",
  servico: "Fisioterapia",
  dia: "terça, 18/11",
  hora: "15:00",
  profissional: "Ana",
  link: "durique.app/p/…",
  descricao: "Pacote 10 sessões (2/3)",
  valor: "R$ 400,00",
  vencimento: "20/11",
  restantes: "2",
  pacote: "Pacote 10 sessões",
  validade: "15/12",
  nota: "5",
  turma: "terças e quintas às 7h",
};

const HOURS = Array.from({ length: 25 }, (_, h) => h);

export default async function AvisosPage() {
  const ctx = await getContext();
  const admin = ctx.isAdmin;
  const supabase = await createClient();
  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabase.from("whatsapp_settings").select("mode, connected, send_from, send_to, tpl_lembrete, tpl_cobranca, tpl_renovacao").eq("clinic_id", ctx.clinicId).maybeSingle(),
    supabase.from("whatsapp_automations").select("key, enabled, template").eq("clinic_id", ctx.clinicId),
  ]);
  const state = automationState(rows, settings);
  const on = AUTOMATIONS.filter((a) => state[a.key].enabled).length;
  const connected = !!settings?.connected;
  const from = settings?.send_from ?? 8;
  const to = settings?.send_to ?? 20;

  return (
    <div data-wide>
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Avisos automáticos</h1>
        <p className="text-[15px] text-muted">
          Mensagens de WhatsApp que a clínica manda para pacientes e equipe. <strong className="text-ink">{on} de {AUTOMATIONS.length}</strong> ligados.
        </p>
      </header>

      <div className="mb-8 grid gap-3 xl:grid-cols-2">
        <Card className="flex flex-wrap items-start gap-4 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok">
            <MessageCircle size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">WhatsApp da clínica</p>
            <p className={cx("flex items-center gap-1.5 text-sm", connected ? "text-ok" : "text-warn")}>
              <span className={cx("size-2 rounded-full", connected ? "bg-ok" : "bg-warn")} />
              {connected ? "Conectado · envia sozinho" : "Ainda não conectado"}
            </p>
            {!connected && (
              <p className="mt-1 text-[13px] text-muted">
                Por enquanto os avisos marcados com <span className="font-medium text-ink">Pela Central</span> ficam prontos na Central: um toque e o
                WhatsApp abre com o texto.
              </p>
            )}
          </div>
          <Link href="/whatsapp" className={buttonClass("secondary", "sm")}>
            Abrir Central
          </Link>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-hover text-muted">
              <Clock size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Horário de envio <span className="text-sm font-normal text-muted">· vale para todos</span>
              </p>
              <p className="text-[13px] text-muted">Fora desse horário o aviso sai antes. Ex.: o lembrete de uma aula às 7h sai às {to}h da véspera.</p>
            </div>
          </div>
          <form action={saveSendWindow} className="mt-3 flex flex-wrap items-center gap-2 pl-[60px] text-sm">
            Das
            <select name="send_from" defaultValue={from} disabled={!admin} aria-label="Começa às" className="h-10 rounded-lg border border-line bg-surface px-2 text-[16px]">
              {HOURS.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}h
                </option>
              ))}
            </select>
            às
            <select name="send_to" defaultValue={to} disabled={!admin} aria-label="Termina às" className="h-10 rounded-lg border border-line bg-surface px-2 text-[16px]">
              {HOURS.slice(1).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}h
                </option>
              ))}
            </select>
            {admin && <button className={buttonClass("secondary", "sm")}>Salvar</button>}
          </form>
        </Card>
      </div>

      <div className="space-y-10">
        {GROUPS.map((g) => {
          const list = AUTOMATIONS.filter((a) => a.group === g.key);
          const n = list.filter((a) => state[a.key].enabled).length;
          return (
            <section key={g.key} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[17px] font-semibold">
                  {g.title} <span className="text-sm font-normal text-muted">· {n} de {list.length} ligados</span>
                </h2>
                {admin && (
                  <form action={toggleAutomation}>
                    <input type="hidden" name="group" value={g.key} />
                    <input type="hidden" name="enabled" value={n === list.length ? "0" : "1"} />
                    <button className={buttonClass("secondary", "sm")}>{n === list.length ? "Desligar todos" : "Ligar todos"}</button>
                  </form>
                )}
              </div>
              <p className="-mt-2 flex items-center gap-1.5 text-sm text-muted">
                <Users size={15} /> Quem recebe: {g.who}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((a) => {
                  const st = state[a.key];
                  const Icon = ICONS[a.icon];
                  return (
                    <Card key={a.key} className={cx("flex flex-col p-4", !st.enabled && "bg-bg")}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={cx("grid size-10 place-items-center rounded-xl", st.enabled ? "bg-accent-soft text-accent" : "bg-hover text-faint")}>
                          <Icon size={19} />
                        </span>
                        <form action={toggleAutomation}>
                          <input type="hidden" name="key" value={a.key} />
                          <input type="hidden" name="enabled" value={st.enabled ? "0" : "1"} />
                          <button
                            disabled={!admin}
                            role="switch"
                            aria-checked={st.enabled}
                            aria-label={`${a.title}: ${st.enabled ? "ligado" : "desligado"}`}
                            className={cx(
                              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-100",
                              st.enabled ? "bg-ok-soft text-ok" : "bg-hover text-muted",
                            )}
                          >
                            <span className={cx("size-2 rounded-full", st.enabled ? "bg-ok" : "bg-faint")} />
                            {st.enabled ? "Ligado" : "Desligado"}
                          </button>
                        </form>
                      </div>
                      <p className={cx("mt-3 font-semibold", !st.enabled && "text-muted")}>{a.title}</p>
                      <p className="mt-0.5 flex-1 text-sm text-muted">{a.text}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge>
                          <Clock size={12} /> {a.when}
                        </Badge>
                        {a.team && <Badge tone="info">Equipe</Badge>}
                        {a.central && !connected && <Badge tone="accent">Pela Central</Badge>}
                        {st.custom && <Badge>Texto da clínica</Badge>}
                      </div>
                      <details className="group mt-3 border-t border-line pt-2">
                        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                          <span className="group-open:hidden">{admin ? "Ver e editar mensagem" : "Ver mensagem"}</span>
                          <span className="hidden group-open:inline">Fechar</span>
                        </summary>
                        <div className="space-y-3 pt-1">
                          <p className="rounded-xl rounded-tl-sm bg-ok-soft/60 px-3 py-2 text-sm whitespace-pre-wrap">
                            {renderTemplate(st.template, { ...SAMPLE, clinica: ctx.clinicName })}
                          </p>
                          {admin && (
                            <ActionForm action={saveAutomationText} className="space-y-3">
                              <input type="hidden" name="key" value={a.key} />
                              <Textarea name="template" rows={4} defaultValue={st.template} maxLength={1000} aria-label={`Texto de ${a.title}`} />
                              <p className="text-[12px] text-muted">
                                Pode usar: {a.vars.map((v) => `{${v}} = ${VAR_LABEL[v] ?? v}`).join(" · ")}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <SubmitButton size="sm">Salvar</SubmitButton>
                                {st.custom && (
                                  <button name="restore" value="1" className={buttonClass("ghost", "sm")}>
                                    Voltar ao padrão
                                  </button>
                                )}
                              </div>
                            </ActionForm>
                          )}
                        </div>
                      </details>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
