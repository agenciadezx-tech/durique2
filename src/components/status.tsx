import { Badge } from "./ui";

export type AttendeeStatus =
  | "agendado"
  | "confirmado"
  | "presente"
  | "falta"
  | "desmarcado_no_prazo"
  | "desmarcado_fora_prazo"
  | "removido";

export const ATTENDEE_LABEL: Record<AttendeeStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  presente: "Veio",
  falta: "Faltou",
  desmarcado_no_prazo: "Desmarcou",
  desmarcado_fora_prazo: "Desmarcou em cima da hora",
  removido: "Saiu do horário",
};

const TONE: Record<AttendeeStatus, "neutral" | "accent" | "ok" | "warn" | "bad" | "info"> = {
  agendado: "neutral",
  confirmado: "info",
  presente: "ok",
  falta: "bad",
  desmarcado_no_prazo: "warn",
  desmarcado_fora_prazo: "bad",
  removido: "neutral",
};

export function AttendeeBadge({ status }: { status: string }) {
  const s = status as AttendeeStatus;
  return <Badge tone={TONE[s] ?? "neutral"}>{ATTENDEE_LABEL[s] ?? status}</Badge>;
}

/** Ocupa vaga? */
export function isActiveAttendee(status: string) {
  return !["desmarcado_no_prazo", "desmarcado_fora_prazo", "removido"].includes(status);
}
