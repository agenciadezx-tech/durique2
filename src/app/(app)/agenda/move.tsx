"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarClock, CheckCircle2, MessageCircle, X } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { moveAppointment } from "./actions";

/** O que cada cartão arrastável carrega em data-move (JSON). */
export type MoveInfo = { id: string; title: string; date: string; time: string; people: number };
type Pending = { appt: MoveInfo; date: string; time: string };

const WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const dayText = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WD[d.getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

/** Janela de confirmação: de quando → para quando, com hora editável. */
export function MoveDialog({ appt, date: d0, time: t0, onClose }: Pending & { onClose: () => void }) {
  const [date, setDate] = useState(d0);
  const [time, setTime] = useState(t0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ notify: number } | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  if (!mounted) return null;
  const same = date === appt.date && time === appt.time;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="move-title">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" style={{ animation: "fab-in 160ms ease-out" }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <h2 id="move-title" className="text-[18px] leading-snug font-semibold">
            {done ? "Pronto, mudou!" : `Mudar “${appt.title}”?`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-hover">
            <X size={20} />
          </button>
        </div>

        {done ? (
          <div className="space-y-3 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <p className="flex items-center gap-2 rounded-2xl bg-ok-soft px-4 py-3 text-[15px] font-medium text-ok">
              <CheckCircle2 size={20} className="shrink-0" /> Agora é {dayText(date)}, às {time}.
            </p>
            {done.notify > 0 ? (
              <>
                <p className="text-[15px] text-muted">
                  {done.notify === 1 ? "O paciente já vê" : `Os ${done.notify} alunos já veem`} a nova data no app. Para avisar pelo WhatsApp, as mensagens estão prontas na Central.
                </p>
                <Link href="/whatsapp?aba=mudancas" onClick={onClose} className={buttonClass("primary", "lg", true)}>
                  <MessageCircle size={19} /> Avisar {done.notify === 1 ? "o paciente" : `os ${done.notify} alunos`}
                </Link>
              </>
            ) : (
              <p className="text-[15px] text-muted">Ninguém estava marcado nesta sessão, então não há quem avisar.</p>
            )}
            <button type="button" onClick={onClose} className={buttonClass("ghost", "md", true)}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 bg-bg px-5 py-4">
              <div className="flex items-center gap-2 text-[15px]">
                <span className="rounded-xl bg-surface px-3 py-2 text-muted line-through decoration-faint">
                  {dayText(appt.date)}, {appt.time}
                </span>
                <ArrowRight size={18} className="shrink-0 text-muted" />
                <span className="rounded-xl bg-accent-soft px-3 py-2 font-semibold text-accent">{dayText(date)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Dia</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-[16px]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Horário</span>
                  <input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-3 text-[16px]" />
                </label>
              </div>
              <p className="text-[13px] text-muted">
                Muda só esta {appt.people > 1 ? "aula" : "sessão"}. A turma fixa continua igual nas outras semanas
                {appt.people > 0 ? `, e ${appt.people === 1 ? "quem está marcado vai junto" : `os ${appt.people} marcados vão juntos`}` : ""}.
              </p>
            </div>
            {error && <p className="px-5 pt-3 text-sm font-medium text-bad">{error}</p>}
            <div className="flex justify-end gap-2 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending || same}
                onClick={() =>
                  start(async () => {
                    const r = await moveAppointment(appt.id, date, time);
                    if (r.error) setError(r.error);
                    else {
                      setError(null);
                      setDone({ notify: r.notify ?? 0 });
                    }
                  })
                }
                className={buttonClass("primary", "md")}
              >
                {pending ? "Mudando…" : "Mudar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Botão "Mudar dia" (na sessão aberta). */
export function MoveButton({ appt, className }: { appt: MoveInfo; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? buttonClass("secondary", "sm")}>
        <CalendarClock size={17} /> Mudar dia
      </button>
      {open && <MoveDialog appt={appt} date={appt.date} time={appt.time} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Arrastar para mudar de dia. Cartões com data-move (JSON MoveInfo) e alvos com data-drop-day="AAAA-MM-DD".
 * Alvo com data-hour-px e data-first-hour (grade de horas) também define o horário pela altura.
 * No celular: segurar o cartão ~0,4s e arrastar. No computador: clicar e arrastar.
 */
export function DragMove({ children, enabled = true, className }: { children: ReactNode; enabled?: boolean; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string; w: number } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    let info: MoveInfo | null = null;
    let card: HTMLElement | null = null;
    let sx = 0;
    let sy = 0;
    let grabDy = 0;
    let dragging = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let over: HTMLElement | null = null;
    let suppressClick = false;
    let scrollTick: ReturnType<typeof setInterval> | null = null;
    let lastY = 0;
    let startY = 0;

    const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-drop-day]") as HTMLElement | null) ?? null;
    const mark = (t: HTMLElement | null) => {
      if (over === t) return;
      over?.removeAttribute("data-drop-over");
      over = t;
      over?.setAttribute("data-drop-over", "");
    };
    const begin = (x: number, y: number) => {
      if (!card || !info) return;
      dragging = true;
      const r = card.getBoundingClientRect();
      grabDy = y - r.top;
      lastY = y;
      startY = y;
      card.setAttribute("data-dragging", "");
      navigator.vibrate?.(15);
      setGhost({ x, y, title: `${info.title} · ${info.time}`, w: Math.min(r.width, 280) });
      // Rola a tela só quando o dedo/mouse já se moveu e encostou na borda
      scrollTick = setInterval(() => {
        if (Math.abs(lastY - startY) < 40) return;
        if (lastY < 90) window.scrollBy(0, -8);
        else if (lastY > window.innerHeight - 110) window.scrollBy(0, 8);
      }, 16);
    };
    const move = (x: number, y: number) => {
      lastY = y;
      setGhost((g) => (g ? { ...g, x, y } : g));
      mark(targetAt(x, y));
    };
    const reset = () => {
      if (timer) clearTimeout(timer);
      if (scrollTick) clearInterval(scrollTick);
      timer = null;
      scrollTick = null;
      card?.removeAttribute("data-dragging");
      mark(null);
      setGhost(null);
      info = null;
      card = null;
      dragging = false;
    };
    const drop = (x: number, y: number) => {
      const t = targetAt(x, y);
      const i = info;
      if (dragging) suppressClick = true;
      if (dragging && t && i) {
        const day = t.dataset.dropDay!;
        let time = i.time;
        if (t.dataset.hourPx) {
          const hourPx = Number(t.dataset.hourPx);
          const first = Number(t.dataset.firstHour ?? 0);
          const top = y - grabDy - t.getBoundingClientRect().top;
          const mins = Math.max(0, Math.min(23 * 60 + 45, Math.round((first * 60 + (top / hourPx) * 60) / 15) * 15));
          time = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
        }
        if (day !== i.date || time !== i.time) setPending({ appt: i, date: day, time });
      }
      reset();
    };
    const pick = (target: EventTarget | null) => {
      const c = (target as HTMLElement | null)?.closest?.("[data-move]") as HTMLElement | null;
      if (!c || !el.contains(c)) return false;
      try {
        info = JSON.parse(c.dataset.move!) as MoveInfo;
      } catch {
        return false;
      }
      card = c;
      return true;
    };

    // Mouse
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !pick(e.target)) return;
      sx = e.clientX;
      sy = e.clientY;
      const mm = (ev: MouseEvent) => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) begin(ev.clientX, ev.clientY);
        if (dragging) {
          ev.preventDefault();
          move(ev.clientX, ev.clientY);
        }
      };
      const mu = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", mm);
        document.removeEventListener("mouseup", mu);
        drop(ev.clientX, ev.clientY);
      };
      document.addEventListener("mousemove", mm);
      document.addEventListener("mouseup", mu);
    };
    const onDragStart = (e: DragEvent) => (e.target as HTMLElement)?.closest?.("[data-move]") && e.preventDefault();

    // Toque: segurar para levantar
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !pick(e.target)) return;
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      timer = setTimeout(() => begin(sx, sy), 420);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (dragging) {
        e.preventDefault();
        move(t.clientX, t.clientY);
      } else if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > 10) {
        reset();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (dragging) {
        e.preventDefault();
        drop(t.clientX, t.clientY);
      } else reset();
    };
    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    };
    const onContext = (e: Event) => dragging && e.preventDefault();

    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("click", onClick, true);
    el.addEventListener("contextmenu", onContext);
    return () => {
      reset();
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("contextmenu", onContext);
    };
  }, [enabled]);

  return (
    <div
      ref={root}
      className={cx(
        className,
        enabled && "select-none [&_[data-move]]:[-webkit-touch-callout:none] [&_[data-dragging]]:opacity-40",
        "[&_[data-drop-over]]:bg-accent-soft/70 [&_[data-drop-over]]:ring-2 [&_[data-drop-over]]:ring-accent [&_[data-drop-over]]:ring-inset",
      )}
    >
      {children}
      {ghost && (
        <div
          className="pointer-events-none fixed z-[70] rounded-2xl border-2 border-accent bg-surface px-4 py-3 text-[15px] font-semibold shadow-2xl"
          style={{ left: ghost.x - 24, top: ghost.y - 28, width: ghost.w, transform: "rotate(-2deg)" }}
        >
          <span className="block truncate">{ghost.title}</span>
          <span className="block text-[12px] font-normal text-muted">Solte no dia novo</span>
        </div>
      )}
      {pending && <MoveDialog {...pending} onClose={() => setPending(null)} />}
    </div>
  );
}
