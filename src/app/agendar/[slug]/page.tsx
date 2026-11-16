import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { BookingFlow, type BookingService } from "./booking-flow";

export const dynamic = "force-dynamic";

type Info = { clinic: string; message: string | null; services: BookingService[] };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_info", { p_slug: slug });
  const d = data as Info | null;
  return { title: d ? `Agendar · ${d.clinic}` : "Agendar" };
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("booking_info", { p_slug: slug });
  const d = data as Info | null;
  if (!d) notFound();

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pt-6 pb-16">
      <header className="mb-6 flex items-center justify-between">
        <Logo compact />
      </header>
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{d.clinic}</h1>
      <p className="mt-1 text-[15px] text-muted">{d.message || "Escolha o atendimento e o melhor horário para você."}</p>
      <div className="mt-6">
        {d.services.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface px-4 py-5 text-[15px] text-muted">
            O agendamento online ainda não tem atendimentos disponíveis. Fale com a clínica pelo WhatsApp.
          </p>
        ) : (
          <BookingFlow slug={slug} services={d.services} />
        )}
      </div>
    </main>
  );
}
