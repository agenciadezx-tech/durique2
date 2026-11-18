"use client";

import { useState } from "react";
import { CalendarDays, Check, Minus, Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { cx, Input } from "@/components/ui";
import { WEEKDAYS_SHORT } from "@/lib/format";
import { proColor } from "@/lib/colors";
import { createSeries } from "../actions";

type Service = { id: string; name: string; kind: string; duration_min: number; default_capacity: number };
type Pro = { id: string; name: string; color?: string | null; services?: string[] };
type Row = { key: number; start: string; end: string; days: number[] };

const plus = (t: string, m: number) => {
  const x = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + m;
  return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const label = "mb-2 block text-[14px] font-semibold text-accent";

/** Nova turma: serviço e professor em botões, grade de horários (vários horários × dias), vagas com − e +. */
export function SeriesForm({
  services,
  pros,
  today,
  rooms = [],
  initial = {},
}: {
  services: Service[];
  pros: Pro[];
  today: string;
  rooms?: { id: string; name: string }[];
  initial?: { service?: string; day?: number; start?: string; room?: string };
}) {
  const turmas = services.filter((s) => s.kind === "turma");
  const list = turmas.length ? turmas : services;
  const [serviceId, setServiceId] = useState(list.some((s) => s.id === initial.service) ? initial.service! : (list[0]?.id ?? ""));
  const service = services.find((s) => s.id === serviceId);
  const fits = pros.filter((p) => !p.services?.length || p.services.includes(serviceId));
  const [proId, setProId] = useState(fits.length === 1 ? fits[0].id : pros.length === 1 ? pros[0].id : "");
  const [roomId, setRoomId] = useState(rooms.some((r) => r.id === initial.room) ? initial.room! : "");
  const first = initial.start ?? "08:00";
  const [rows, setRows] = useState<Row[]>([{ key: 1, start: first, end: plus(first, service?.duration_min ?? 50), days: initial.day ? [initial.day] : [] }]);
  const [cap, setCap] = useState(service?.default_capacity ?? 4);
  const slots = rows.flatMap((r) => r.days.map((d) => `${d}|${r.start}|${r.end}`));
  const ready = !!serviceId && !!proId && slots.length > 0;
  const upd = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <ActionForm action={createSeries} className="space-y-6">
      <input type="hidden" name="service_id" value={serviceId} />
      <input type="hidden" name="professional_id" value={proId} />
      <input type="hidden" name="room_id" value={roomId} />
      <input type="hidden" name="capacity" value={cap} />
      {slots.map((s) => (
        <input key={s} type="hidden" name="slot" value={s} />
      ))}

      <div>
        <span className={label}>Serviço</span>
        <div className="flex flex-wrap gap-2">
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={serviceId === s.id}
              onClick={() => {
                setServiceId(s.id);
                setCap(s.default_capacity || 4);
                setRows((rs) => rs.map((r) => ({ ...r, end: plus(r.start, s.duration_min) })));
              }}
              className={cx(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-colors",
                serviceId === s.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-hover",
              )}
            >
              <span className="size-2 rounded-full bg-chart-out" /> {s.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="nome-turma" className={label}>
          Nome da turma <span className="font-normal">(opcional)</span>
        </label>
        <Input id="nome-turma" name="name" maxLength={60} placeholder="Ex.: Pilates Seg/Qua 08:00" />
      </div>

      {rooms.length > 0 && (
        <div>
          <span className={label}>Sala</span>
          <div className="flex flex-wrap gap-2">
            {[{ id: "", name: "Sem sala" }, ...rooms].map((r) => (
              <button
                key={r.id || "none"}
                type="button"
                aria-pressed={roomId === r.id}
                onClick={() => setRoomId(r.id)}
                className={cx(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-medium transition-colors",
                  roomId === r.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-hover",
                )}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className={label}>Professor</span>
        <div className="flex flex-wrap gap-2">
          {(pros.filter((p) => !p.services?.length || p.services.includes(serviceId)).length ? pros.filter((p) => !p.services?.length || p.services.includes(serviceId)) : pros).map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={proId === p.id}
              onClick={() => setProId(p.id)}
              className={cx(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-colors",
                proId === p.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-hover",
              )}
            >
              <span className="size-2.5 rounded-full" style={{ background: proColor(p.color ?? null, p.id) }} /> {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>Grade de horários</span>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  step={300}
                  value={r.start}
                  onChange={(e) => upd(r.key, { start: e.target.value, end: plus(e.target.value, service?.duration_min ?? 50) })}
                  aria-label="Começa às"
                  className="h-12 w-28 rounded-xl border border-line bg-surface px-2 text-center text-[16px] tabular-nums"
                />
                <span className="text-sm text-muted">às</span>
                <input
                  type="time"
                  step={300}
                  value={r.end}
                  onChange={(e) => upd(r.key, { end: e.target.value })}
                  aria-label="Termina às"
                  className="h-12 w-28 rounded-xl border border-line bg-surface px-2 text-center text-[16px] tabular-nums"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label="Tirar este horário"
                    className="ml-auto grid size-11 place-items-center rounded-xl text-muted hover:bg-hover hover:text-bad"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = r.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => upd(r.key, { days: on ? r.days.filter((x) => x !== d) : [...r.days, d].sort() })}
                      className={cx(
                        "flex h-12 flex-col items-center justify-center rounded-xl border text-[13px] font-semibold capitalize transition-colors",
                        on ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:bg-hover",
                      )}
                    >
                      {on && <Check size={13} />}
                      {WEEKDAYS_SHORT[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { key: Date.now(), start: plus(rs[rs.length - 1].start, 60), end: plus(rs[rs.length - 1].start, 60 + (service?.duration_min ?? 50)), days: [] }])}
            className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-accent/50 px-4 text-[15px] font-semibold text-accent hover:bg-accent-soft/40"
          >
            <Plus size={18} /> Adicionar horário
          </button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <span className={label}>Vagas por aula</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCap((c) => Math.max(1, c - 1))} aria-label="Menos uma vaga" className="grid size-12 place-items-center rounded-xl border border-line bg-surface hover:bg-hover">
              <Minus size={18} />
            </button>
            <span className="grid h-12 min-w-16 flex-1 place-items-center rounded-xl border border-line bg-surface text-[18px] font-semibold tabular-nums">{cap}</span>
            <button type="button" onClick={() => setCap((c) => Math.min(60, c + 1))} aria-label="Mais uma vaga" className="grid size-12 place-items-center rounded-xl border border-line bg-surface hover:bg-hover">
              <Plus size={18} />
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="comeca" className={label}>
            Começa em
          </label>
          <Input id="comeca" name="starts_on" type="date" defaultValue={today} min={today} />
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-[14px] text-muted">
        <CalendarDays size={18} className="mt-0.5 shrink-0 text-accent" />
        <span>
          {slots.length ? (
            <>
              Cria <strong className="text-ink">{slots.length}</strong> aula{slots.length === 1 ? "" : "s"} fixa{slots.length === 1 ? "" : "s"} por semana (
              {rows
                .filter((r) => r.days.length)
                .map((r) => `${r.days.map((d) => WEEKDAYS_SHORT[d]).join("/")} ${r.start}`)
                .join(" · ")}
              ) com <strong className="text-ink">{cap}</strong> vaga{cap === 1 ? "" : "s"} cada. Os alunos entram por matrícula e, quando lotar, pela lista de espera.
            </>
          ) : (
            "Marque os dias na grade de horários para ver como fica."
          )}
        </span>
      </p>

      <div className="sticky bottom-0 -mx-5 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-7 sm:px-7">
        {ready ? (
          <SubmitButton full pendingText="Criando e lançando na agenda…">
            <Check size={18} /> Criar turma
          </SubmitButton>
        ) : (
          <button type="button" disabled className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent/40 font-semibold text-white">
            <Check size={18} /> {!proId ? "Escolha o professor" : "Marque pelo menos um dia"}
          </button>
        )}
      </div>
    </ActionForm>
  );
}
