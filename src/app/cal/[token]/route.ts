import { createClient } from "@/lib/supabase/server";

type Feed = {
  professional: string;
  clinic: string;
  events: { id: string; starts_at: string; ends_at: string; service: string; capacity: number; cancelled: boolean; people: string[] }[];
};

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Quebra linhas longas (RFC 5545: até 75 octetos por linha). */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{32}$/.test(token)) return new Response("Não encontrado", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.rpc("calendar_feed", { p_token: token });
  const feed = data as Feed | null;
  if (!feed) return new Response("Não encontrado", { status: 404 });

  const origin = new URL(req.url).origin;
  const now = stamp(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Durique//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`${feed.clinic} · ${feed.professional}`)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of feed.events) {
    const turma = e.capacity > 1;
    const who = e.people.length ? e.people.join(", ") : "sem pacientes";
    const summary = turma ? `${e.service} (${e.people.length}/${e.capacity})` : e.people[0] ? `${e.service} · ${e.people[0]}` : e.service;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@durique`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.starts_at)}`,
      `DTEND:${stamp(e.ends_at)}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(`${turma ? `Pacientes: ${who}\n` : ""}Abrir no Durique: ${origin}/agenda/${e.id}`)}`,
      `LOCATION:${esc(feed.clinic)}`,
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="durique.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
