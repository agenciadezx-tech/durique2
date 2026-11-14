// Fuso fixo de São Paulo (Brasil não tem horário de verão desde 2019).
export const TZ = "America/Sao_Paulo";
export const TZ_OFFSET = "-03:00";

/** "11 99999-8888", "(11) 99999-8888", "+55 11..." → "+5511999998888" (ou null se vazio/inválido). */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return null;
  return "+" + d;
}

/** "+5511999998888" → "(11) 99999-8888" */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

export function whatsappLink(e164: string | null | undefined): string | null {
  if (!e164) return null;
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

export function normalizeCpf(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = input.replace(/\D/g, "");
  if (!d) return null;
  return d.length === 11 ? d : null;
}

export function formatCpf(cpf: string | null | undefined): string {
  if (!cpf || cpf.length !== 11) return cpf ?? "";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** Data de hoje (YYYY-MM-DD) no fuso da clínica. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Início e fim do dia (ISO com fuso) para filtrar timestamps. */
export function dayRange(iso: string): { from: string; to: string } {
  return { from: `${iso}T00:00:00${TZ_OFFSET}`, to: `${addDaysISO(iso, 1)}T00:00:00${TZ_OFFSET}` };
}

export function toTimestamp(dateISO: string, time: string): string {
  return `${dateISO}T${time.slice(0, 5)}:00${TZ_OFFSET}`;
}

export function formatTime(ts: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

export function formatDayLong(iso: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00Z`),
  );
}

export function formatTimestampShort(ts: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

/** ISO weekday 1..7 de uma data YYYY-MM-DD. */
export function isoWeekday(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export const WEEKDAYS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;
export const WEEKDAYS_SHORT = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "120,50" | "120.50" | "R$ 120" → centavos */
export function parseMoney(input: string | null | undefined): number | null {
  if (!input) return null;
  const clean = input.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Traduz erros do banco para mensagens que qualquer pessoa entende. */
export function friendlyError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err) return "Algo deu errado. Tente de novo.";
  const msg = err.message ?? "";
  if (err.code === "23505") {
    if (msg.includes("cpf")) return "Já existe um paciente com este CPF.";
    if (msg.includes("appointment_id")) return "Este paciente já está nesta sessão.";
    return "Esse registro já existe.";
  }
  if (err.code === "42501" || msg.includes("row-level security")) return "Você não tem permissão para fazer isso.";
  if (err.code === "23514") {
    if (msg.includes("phone")) return "Telefone inválido. Use DDD + número, ex.: (11) 99999-8888.";
    if (msg.includes("cpf")) return "CPF inválido. Digite os 11 números.";
    return "Algum campo está com valor inválido.";
  }
  if (err.code === "P0001") return msg;
  return "Algo deu errado. Tente de novo.";
}

export const PAY_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
] as const;
export const PAY_LABEL: Record<string, string> = Object.fromEntries(PAY_METHODS.map((m) => [m.value, m.label]));

/** "2026-11" do mês de uma data ISO */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthRange(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

export function addMonthsKey(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function formatMonth(key: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${key}-15T12:00:00Z`),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatMonthShort(key: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" }).format(new Date(`${key}-15T12:00:00Z`)).replace(".", "");
}
