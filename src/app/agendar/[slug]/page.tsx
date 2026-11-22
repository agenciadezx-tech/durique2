import { notFound } from "next/navigation";
import { brandCss } from "@/lib/theme";
import { AtSign, Clock, MapPin, MessageCircle } from "lucide-react";
import { Logo } from "@/components/logo";
import { ClinicMark } from "@/components/clinic-mark";
import { formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BookingFlow, type BookingService } from "./booking-flow";
import { PatientDoor } from "./patient-door";

export const dynamic = "force-dynamic";

type Info = {
  clinic: string;
  logo: string | null;
  banner: string | null;
  tagline: string | null;
  message: string | null;
  color: string | null;
  whatsapp: string | null;
  instagram: string | null;
  address: string | null;
  show_prices: boolean;
  waitlist: boolean;
  notice_hours: number;
  services: BookingService[];
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_info", { p_slug: slug });
  const d = data as Info | null;
  return { title: d ? d.clinic : "Agendar" };
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ porta?: string; p?: string }>;
}) {
  const { slug } = await params;
  const { porta, p } = await searchParams;
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_info", { p_slug: slug });
  const d = data as Info | null;
  if (!d) notFound();
  const color = d.color ?? "#0f766e";
  const door = porta === "paciente" ? "paciente" : "agendar";

  // Vindo do painel do aluno: já preenche nome e WhatsApp
  let prefill: { name: string; phone: string } | null = null;
  if (p && /^[a-f0-9]{32}$/.test(p)) {
    const { data: me } = await supabase.rpc("portal_get", { p_token: p });
    const pt = (me as { patient?: { name: string; phone: string | null } } | null)?.patient;
    if (pt) prefill = { name: pt.name, phone: formatPhone(pt.phone) };
  }

  return (
    <main className="min-h-dvh pb-16">
      <style>{brandCss(color)}</style>
      <div
        className="h-36 w-full bg-cover bg-center sm:h-44"
        style={d.banner ? { backgroundImage: `url(${d.banner})` } : { background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      />
      <div className="mx-auto -mt-14 max-w-lg px-5">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ClinicMark brand={{ name: d.clinic, logo: d.logo, color }} size={56} />
            <div className="min-w-0">
              <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{d.clinic}</h1>
              {d.tagline && <p className="text-sm text-muted">{d.tagline}</p>}
              <div className="mt-1 flex flex-wrap gap-2">
                {d.whatsapp && (
                  <a
                    href={`https://wa.me/${d.whatsapp.replace("+", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-[13px] font-medium text-ok"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                )}
                {d.instagram && (
                  <a
                    href={`https://instagram.com/${d.instagram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-[13px] font-medium text-muted"
                  >
                    <AtSign size={14} /> {d.instagram}
                  </a>
                )}
              </div>
            </div>
          </div>
          {d.message && <p className="mt-3 text-[15px] text-muted">{d.message}</p>}

          {!prefill && (
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-hover p-1" role="tablist">
              {(
                [
                  { k: "agendar", label: "Quero agendar" },
                  { k: "paciente", label: "Já sou paciente" },
                ] as const
              ).map((o) => (
                <a
                  key={o.k}
                  role="tab"
                  aria-selected={door === o.k}
                  href={o.k === "agendar" ? `/agendar/${slug}` : `/agendar/${slug}?porta=paciente`}
                  className={
                    "flex h-11 items-center justify-center rounded-lg text-[15px] font-medium " +
                    (door === o.k ? "bg-surface text-ink shadow-sm" : "text-muted")
                  }
                >
                  {o.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          {door === "paciente" && !prefill ? (
            <PatientDoor slug={slug} color={color} />
          ) : d.services.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface px-4 py-5 text-[15px] text-muted">
              O agendamento online ainda não tem atendimentos disponíveis. Fale com a clínica pelo WhatsApp.
            </p>
          ) : (
            <BookingFlow slug={slug} services={d.services} waitlist={d.waitlist} prefill={prefill} />
          )}
        </div>

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {d.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 rounded-2xl border border-line bg-surface p-3 text-sm hover:bg-hover"
            >
              <MapPin size={18} className="shrink-0 text-muted" />
              <span>
                <span className="block font-medium">Onde fica</span>
                <span className="text-muted">{d.address}</span>
                <span className="block font-medium" style={{ color }}>
                  Ver no mapa
                </span>
              </span>
            </a>
          )}
          <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
            <Clock size={18} className="shrink-0 text-muted" />
            <span>
              <span className="block font-medium">Para desmarcar</span>
              <span className="text-muted">Avise com pelo menos {d.notice_hours}h de antecedência.</span>
            </span>
          </div>
        </div>
        <p className="mt-8 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          Agenda feita com <Logo compact />
        </p>
      </div>
    </main>
  );
}
