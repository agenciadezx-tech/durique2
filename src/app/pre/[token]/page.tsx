import { notFound } from "next/navigation";
import { brandCss } from "@/lib/theme";
import { BrandHeader, type PublicBrand } from "@/components/clinic-mark";
import { Card } from "@/components/ui";
import { mergeConfig, type PreConfig } from "@/lib/pre-assessment";
import { createClient } from "@/lib/supabase/server";
import { PreForm } from "./pre-form";

export const metadata = { title: "Pré-avaliação", robots: { index: false } };
export const dynamic = "force-dynamic";

type Data = { clinic: string; patient: string; kind: "consulta" | "aula"; config: Partial<PreConfig>; answered: boolean };

export default async function PrePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: brandData }] = await Promise.all([
    supabase.rpc("get_pre_assessment", { p_token: token }),
    supabase.rpc("public_brand", { p_token: token }),
  ]);
  const d = data as Data | null;
  if (!d) notFound();
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pt-6 pb-16">
      <style>{brandCss((brandData as PublicBrand | null)?.color)}</style>
      <BrandHeader brand={(brandData as PublicBrand | null) ?? { name: d.clinic, logo: null, color: null }} />
      <h1 className="text-[24px] leading-tight font-semibold tracking-tight">Olá, {d.patient}!</h1>
      <p className="mt-1 mb-6 text-[15px] text-muted">
        Antes da sua {d.kind === "aula" ? "primeira aula" : "consulta"}, responda algumas perguntas. Leva uns 3 minutos e ajuda o profissional a se preparar.
      </p>
      {d.answered ? (
        <Card className="p-5 text-[15px]">Você já respondeu esta pré-avaliação. Obrigado! 🙌</Card>
      ) : (
        <PreForm token={token} cfg={mergeConfig(d.kind, d.config)} />
      )}
    </main>
  );
}
