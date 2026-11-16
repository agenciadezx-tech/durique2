"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, CalendarCheck, CheckCircle2, Clock, User } from "lucide-react";
import { Alert, buttonClass, Card, cx, Field, Input } from "@/components/ui";
import { addDaysISO, formatMoney, todayISO, TZ } from "@/lib/format";
import { book, loadClasses, loadSlots, type ClassSlot, type Slot } from "./actions";

export type BookingService = { id: string; name: string; kind: string; duration: number; price_cents: number | null };

type Pick = { serviceId: string; professionalId?: string; professionalName: string; startsAt: string; appointmentId?: string };

const hour = (ts: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
const dayLabel = (ts: string) => {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(ts));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const chipFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" });

export function BookingFlow({ slug, services }: { slug: string; services: BookingService[] }) {
  const [service, setService] = useState<BookingService | null>(services.length === 1 ? services[0] : null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [done, setDone] = useState<Pick | null>(null);

  if (done) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 size={48} className="mx-auto text-ok" />
        <h2 className="mt-3 text-[20px] font-semibold">Horário agendado!</h2>
        <p className="mt-2 text-[15px] text-muted">
          {dayLabel(done.startsAt)}, às {hour(done.startsAt)}
          <br />
          {service?.name} com {done.professionalName}
        </p>
        <p className="mt-4 text-sm text-muted">A clínica vai confirmar com você pelo WhatsApp. Se não puder ir, avise com antecedência.</p>
      </Card>
    );
  }

  if (!service) {
    return (
      <div className="space-y-3">
        <h2 className="text-[17px] font-semibold">1. Qual atendimento?</h2>
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setService(s)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-4 text-left transition-colors hover:border-accent hover:bg-accent-soft"
          >
            <span>
              <span className="block font-semibold">{s.name}</span>
              <span className="text-sm text-muted">
                {s.duration} min{s.kind === "turma" ? " · em turma" : ""}
              </span>
            </span>
            {s.price_cents != null && <span className="font-medium text-accent">{formatMoney(s.price_cents)}</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {(services.length > 1 || pick) && (
          <button
            type="button"
            aria-label="Voltar"
            onClick={() => (pick ? setPick(null) : setService(null))}
            className="grid size-11 place-items-center rounded-full hover:bg-hover"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <p className="font-semibold">{service.name}</p>
          <p className="text-sm text-muted">{service.duration} min</p>
        </div>
      </div>
      {pick ? (
        <ContactStep slug={slug} pick={pick} onDone={() => setDone(pick)} onTaken={() => setPick(null)} />
      ) : service.kind === "turma" ? (
        <ClassStep slug={slug} service={service} onPick={setPick} />
      ) : (
        <SlotStep slug={slug} service={service} onPick={setPick} />
      )}
    </div>
  );
}

function SlotStep({ slug, service, onPick }: { slug: string; service: BookingService; onPick: (p: Pick) => void }) {
  const today = todayISO();
  const days = Array.from({ length: 21 }, (_, i) => addDaysISO(today, i));
  const [day, setDay] = useState(days[0]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setSlots(null);
    start(async () => setSlots(await loadSlots(slug, service.id, day)));
  }, [slug, service.id, day]);

  const byPro = new Map<string, Slot[]>();
  (slots ?? []).forEach((s) => byPro.set(s.professional_id, [...(byPro.get(s.professional_id) ?? []), s]));

  return (
    <>
      <div>
        <h2 className="mb-2 text-[17px] font-semibold">2. Escolha o dia</h2>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={d === day}
              className={cx(
                "flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition-colors",
                d === day ? "border-accent bg-accent text-white" : "border-line bg-surface hover:bg-hover",
              )}
            >
              <span className={cx("text-[12px] capitalize", d === day ? "text-white/80" : "text-muted")}>
                {d === today ? "hoje" : chipFmt.format(new Date(`${d}T12:00:00Z`)).replace(".", "")}
              </span>
              <span className="text-[18px] font-semibold tabular-nums">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-[17px] font-semibold">3. Escolha o horário</h2>
        {pending || slots == null ? (
          <p className="py-6 text-center text-muted">Procurando horários…</p>
        ) : slots.length === 0 ? (
          <Card className="px-4 py-5 text-[15px] text-muted">Sem horários livres neste dia. Tente outro dia.</Card>
        ) : (
          <div className="space-y-4">
            {[...byPro.values()].map((list) => (
              <div key={list[0].professional_id}>
                {byPro.size > 1 && (
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted">
                    <User size={16} /> {list[0].professional_name}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {list.map((s) => (
                    <button
                      key={s.starts_at}
                      type="button"
                      onClick={() =>
                        onPick({ serviceId: service.id, professionalId: s.professional_id, professionalName: s.professional_name, startsAt: s.starts_at })
                      }
                      className="h-12 rounded-xl border border-line bg-surface font-medium tabular-nums transition-colors hover:border-accent hover:bg-accent-soft"
                    >
                      {hour(s.starts_at)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ClassStep({ slug, service, onPick }: { slug: string; service: BookingService; onPick: (p: Pick) => void }) {
  const [list, setList] = useState<ClassSlot[] | null>(null);
  useEffect(() => {
    loadClasses(slug, service.id).then(setList);
  }, [slug, service.id]);
  return (
    <div>
      <h2 className="mb-2 text-[17px] font-semibold">2. Escolha a aula</h2>
      {list == null ? (
        <p className="py-6 text-center text-muted">Procurando aulas…</p>
      ) : list.length === 0 ? (
        <Card className="px-4 py-5 text-[15px] text-muted">Nenhuma aula com vaga nas próximas 3 semanas. Fale com a clínica.</Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((c) => (
            <button
              key={c.appointment_id}
              type="button"
              onClick={() =>
                onPick({ serviceId: service.id, appointmentId: c.appointment_id, professionalName: c.professional_name, startsAt: c.starts_at })
              }
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover"
            >
              <CalendarCheck size={20} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {dayLabel(c.starts_at)} · {hour(c.starts_at)}
                </span>
                <span className="text-sm text-muted">
                  com {c.professional_name} · {c.free} vaga{c.free === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

function ContactStep({ slug, pick, onDone, onTaken }: { slug: string; pick: Pick; onDone: () => void; onTaken: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await book(slug, pick, name, phone);
          if (r.ok) onDone();
          else setError(r.error ?? "Não foi possível agendar.");
        });
      }}
    >
      <Card className="flex items-center gap-3 bg-accent-soft p-4">
        <Clock size={22} className="shrink-0 text-accent" />
        <p className="text-[15px]">
          <span className="font-semibold">
            {dayLabel(pick.startsAt)}, às {hour(pick.startsAt)}
          </span>
          <br />
          com {pick.professionalName}
        </p>
      </Card>
      <h2 className="text-[17px] font-semibold">Seus dados</h2>
      {error && (
        <Alert>
          {error}{" "}
          {error.includes("ocupado") && (
            <button type="button" onClick={onTaken} className="font-semibold underline">
              Ver outros horários
            </button>
          )}
        </Alert>
      )}
      <Field label="Nome completo">
        <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Ex.: Maria da Silva" />
      </Field>
      <Field label="WhatsApp" hint="Com DDD. A clínica usa para confirmar.">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-8888"
        />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", true)}>
        {pending ? "Agendando…" : "Confirmar agendamento"}
      </button>
    </form>
  );
}
