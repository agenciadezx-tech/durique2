"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Pencil, Plus, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { buttonClass, cx, Input } from "@/components/ui";
import { WEEKDAYS_SHORT } from "@/lib/format";
import { proColor } from "@/lib/colors";
import { updateSeries } from "../actions";

type Service = { id: string; name: string; kind: string; duration_min: number };
type Pro = { id: string; name: string; color?: string | null };
export type SeriesData = {
  id: string;
  name: string | null;
  weekday: number;
  start: string;
  duration: number;
  service_id: string;
  professional_id: string;
  capacity: number;
  enrolled: number;
  room_id?: string | null;
};

const plus = (t: string, m: number) => {
  const x = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + m;
  return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
const diff = (a: string, b: string) => Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5)) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)));
const label = "mb-2 block text-[14px] font-semibold text-accent";
const DAYS = [7, 1, 2, 3, 4, 5, 6];

/** Botão Editar da turma: abre uma janela de baixo com dia, horário, serviço, professor, vagas e nome. */
export function EditSeries({ s, services, pros, endSlot, rooms = [] }: { s: SeriesData; services: Service[]; pros: Pro[]; endSlot: React.ReactNode; rooms?: { id: string; name: string }[] }) {
  const [roomId, setRoomId] = useState(s.room_id ?? "");
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(s.weekday);
  const [start, setStart] = useState(s.start);
  const [end, setEnd] = useState(plus(s.start, s.duration));
  const [serviceId, setServiceId] = useState(s.service_id);
  const [proId, setProId] = useState(s.professional_id);
  const [cap, setCap] = useState(s.capacity);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const dur = diff(start, end);
  const changedWhen = day !== s.weekday || start !== s.start || dur !== s.duration;
  const list = services.filter((x) => x.kind === "turma").length ? services.filter((x) => x.kind === "turma") : services;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "md")}>
        <Pencil size={17} /> Editar
      </button>
      {open &&
        createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="edit-title">
          <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div
            className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-bg shadow-2xl sm:rounded-3xl"
            style={{ animation: "fab-in 160ms ease-out" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
              <div>
                <h2 id="edit-title" className="text-[19px] font-semibold">
                  Editar turma
                </h2>
                <p className="text-[14px] text-muted">Dia, horário, serviço, professor e vagas</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-hover">
                <X size={20} />
              </button>
            </div>
            <ActionForm action={updateSeries} className="flex min-h-0 flex-1 flex-col space-y-0!">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="weekday" value={day} />
              <input type="hidden" name="start" value={start} />
              <input type="hidden" name="duration" value={dur} />
              <input type="hidden" name="service_id" value={serviceId} />
              <input type="hidden" name="professional_id" value={proId} />
              <input type="hidden" name="capacity" value={cap} />
              <input type="hidden" name="room_id" value={roomId} />
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <div>
                  <span className={label}>Dia da semana</span>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={day === d}
                        onClick={() => setDay(d)}
                        className={cx(
                          "min-h-11 min-w-14 rounded-full border px-3 text-[15px] font-medium capitalize transition-colors",
                          day === d ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-hover",
                        )}
                      >
                        {WEEKDAYS_SHORT[d]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={label}>Horário</span>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-[13px] text-muted">
                      Início
                      <Input
                        type="time"
                        value={start}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          setEnd(plus(v, Math.max(dur, 5)));
                          setStart(v);
                        }}
                        className="mt-1"
                      />
                    </label>
                    <label className="text-[13px] text-muted">
                      Fim
                      <Input type="time" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className="mt-1" />
                    </label>
                  </div>
                  {dur < 5 && <p className="mt-2 text-[13px] font-medium text-bad">O fim precisa ser depois do início.</p>}
                  <p className={cx("mt-2 text-[13px]", changedWhen ? "font-medium text-warn" : "text-muted")}>
                    Mudar o <strong>dia</strong> ou o <strong>horário</strong> muda as próximas aulas desta turma, com os alunos. As que já aconteceram ficam como estão.
                  </p>
                </div>
                <div>
                  <span className={label}>Serviço</span>
                  <div className="flex flex-wrap gap-2">
                    {list.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        aria-pressed={serviceId === x.id}
                        onClick={() => setServiceId(x.id)}
                        className={cx(
                          "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition-colors",
                          serviceId === x.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-hover",
                        )}
                      >
                        <span className="size-2 rounded-full bg-chart-out" /> {x.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={label}>Professor</span>
                  <div className="flex flex-wrap gap-2">
                    {pros.map((p) => (
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
                        <span className="size-2.5 rounded-full" style={{ background: proColor(p.color, p.id) }} /> {p.name}
                      </button>
                    ))}
                  </div>
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
                  <span className={label}>Vagas</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Menos uma vaga"
                      disabled={cap <= Math.max(1, s.enrolled)}
                      onClick={() => setCap((c) => c - 1)}
                      className="grid size-12 place-items-center rounded-xl border border-line bg-surface disabled:opacity-40"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-12 text-center text-[22px] font-semibold tabular-nums">{cap}</span>
                    <button
                      type="button"
                      aria-label="Mais uma vaga"
                      onClick={() => setCap((c) => Math.min(60, c + 1))}
                      className="grid size-12 place-items-center rounded-xl border border-line bg-surface"
                    >
                      <Plus size={18} />
                    </button>
                    <span className="text-[13px] text-muted">{s.enrolled} aluno{s.enrolled === 1 ? "" : "s"} fixo{s.enrolled === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="edit-name" className={label}>
                    Nome da turma <span className="font-normal text-muted">(opcional)</span>
                  </label>
                  <Input id="edit-name" name="name" defaultValue={s.name ?? ""} maxLength={60} placeholder="Ex.: Pilates manhã" />
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3">
                <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "lg")}>
                  Cancelar
                </button>
                <SubmitButton size="lg" pendingText="Salvando…" className="flex-1 sm:flex-none">
                  Salvar alterações
                </SubmitButton>
              </div>
            </ActionForm>
            <div className="bg-surface px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{endSlot}</div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
