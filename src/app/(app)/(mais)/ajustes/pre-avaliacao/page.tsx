import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { cx } from "@/components/ui";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, mergeConfig, type PreConfig } from "@/lib/pre-assessment";
import { PreFormEditor } from "./editor";

export const metadata = { title: "Pré-avaliação" };

export default async function PreAvaliacaoPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const ctx = await getContext();
  const { tipo } = await searchParams;
  const kind = tipo === "aula" ? "aula" : "consulta";
  const supabase = await createClient();
  const { data } = await supabase.from("pre_assessment_forms").select("fields, questions").eq("clinic_id", ctx.clinicId).eq("kind", kind).maybeSingle();
  const cfg = mergeConfig(kind, data as Partial<PreConfig> | null);

  return (
    <>
      <PageHeader
        title="Pré-avaliação"
        description="O paciente responde pelo celular antes de começar. Você escolhe o que perguntar; o que ele responder completa o cadastro (só campos vazios)."
        back={{ href: "/mais", label: "Mais" }}
      />
      <div className="mb-5 grid grid-cols-2 gap-2">
        {(["consulta", "aula"] as const).map((k) => (
          <Link
            key={k}
            href={`/ajustes/pre-avaliacao${k === "aula" ? "?tipo=aula" : ""}`}
            className={cx(
              "rounded-xl border p-3 transition-colors",
              kind === k ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-hover",
            )}
          >
            <span className="block font-medium">{k === "consulta" ? "Consulta" : "Aula"}</span>
            <span className="text-sm text-muted">{KIND_LABEL[k]}</span>
          </Link>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">
        Cada formulário é separado: mudar um não mexe no outro. Na ficha do paciente, ao pedir a pré-avaliação, você escolhe qual mandar.
      </p>
      <PreFormEditor key={kind} kind={kind} initial={cfg} canEdit={ctx.isAdmin} />
    </>
  );
}
