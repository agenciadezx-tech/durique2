import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO, WEEKDAYS } from "@/lib/format";
import { SellForm, type SeriesOption } from "./sell-form";

export const metadata = { title: "Vender pacote ou plano" };

export default async function VenderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/pacientes");
  const { id } = await params;
  const { tipo } = await searchParams;
  const kind = tipo === "plano" || tipo === "pacote" ? tipo : null;
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: patient }, { data: products }, { data: seriesData }, { data: enr }] = await Promise.all([
    supabase.from("patients").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("products")
      .select("id, name, kind, price_cents, sessions, validity_days, sessions_per_week")
      .eq("clinic_id", ctx.clinicId)
      .eq("active", true)
      .order("kind")
      .order("name"),
    supabase
      .from("recurring_series")
      .select("id, name, weekday, start_time, capacity, services(name), professionals(name)")
      .eq("clinic_id", ctx.clinicId)
      .eq("active", true)
      .gt("capacity", 1)
      .order("weekday")
      .order("start_time"),
    supabase.from("enrollments").select("series_id, patient_id").eq("clinic_id", ctx.clinicId).or(`ends_on.is.null,ends_on.gte.${today}`),
  ]);
  if (!patient) notFound();
  const list = (products ?? []).filter((p) => !kind || (kind === "plano" ? p.kind === "plano" : p.kind !== "plano"));
  const mine = new Set((enr ?? []).filter((e) => e.patient_id === id).map((e) => e.series_id));
  const series: SeriesOption[] = (seriesData ?? [])
    .filter((s) => !mine.has(s.id))
    .map((s) => {
      const used = (enr ?? []).filter((e) => e.series_id === s.id).length;
      const sv = s.services as unknown as { name: string } | null;
      const pr = s.professionals as unknown as { name: string } | null;
      return {
        id: s.id,
        label: `${WEEKDAYS[s.weekday].slice(0, 3)} · ${s.start_time.slice(0, 5)}`,
        sub: [s.name ?? sv?.name, pr?.name].filter(Boolean).join(" · "),
        free: s.capacity - used,
      };
    });
  const title = kind === "plano" ? "Matricular em aulas" : kind === "pacote" ? "Vender pacote" : "Vender pacote ou plano";

  return (
    <>
      <PageHeader title={title} description={patient.name} back={{ href: `/pacientes/${id}`, label: patient.name }} />
      {!list.length ? (
        <EmptyState
          title={kind === "plano" ? "Nenhum plano de aulas cadastrado" : "Nenhum pacote cadastrado"}
          text={ctx.isAdmin ? "Cadastre no Catálogo o que a clínica vende, por exemplo: Pacote 10 sessões ou Pilates 2x por semana." : "Peça ao administrador para cadastrar no Catálogo."}
          action={ctx.isAdmin && <LinkButton href="/catalogo">Ir para o Catálogo</LinkButton>}
        />
      ) : (
        <Card className="p-5 pb-0 sm:p-7 sm:pb-0">
          <SellForm patientId={id} patientName={patient.name} products={list} today={today} series={series} />
        </Card>
      )}
    </>
  );
}
