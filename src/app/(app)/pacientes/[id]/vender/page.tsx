import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { SellForm } from "./sell-form";

export const metadata = { title: "Vender pacote ou plano" };

export default async function VenderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx.canManageAgenda) redirect("/pacientes");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: patient }, { data: products }] = await Promise.all([
    supabase.from("patients").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("products")
      .select("id, name, kind, price_cents, sessions, validity_days, sessions_per_week")
      .eq("clinic_id", ctx.clinicId)
      .eq("active", true)
      .order("kind")
      .order("name"),
  ]);
  if (!patient) notFound();

  return (
    <>
      <PageHeader title="Vender pacote ou plano" description={patient.name} back={{ href: `/pacientes/${id}`, label: patient.name }} />
      {!products?.length ? (
        <EmptyState
          title="Nenhum pacote ou plano cadastrado"
          text={ctx.isAdmin ? "Cadastre em Ajustes o que a clínica vende, por exemplo: Pacote 10 sessões ou Pilates 2x por semana." : "Peça ao administrador para cadastrar em Ajustes."}
          action={ctx.isAdmin && <LinkButton href="/ajustes">Ir para Ajustes</LinkButton>}
        />
      ) : (
        <Card className="p-5 sm:p-7">
          <SellForm patientId={id} products={products} today={todayISO()} />
        </Card>
      )}
    </>
  );
}
