import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { TZ } from "@/lib/format";
import { SignForm } from "./sign-form";

export const metadata = { title: "Assinar documento", robots: { index: false } };

export default async function AssinarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_document_by_token", { p_token: token });
  const doc = (data ?? [])[0] as
    | { title: string; body: string; status: string; clinic_name: string; patient_name: string; signed_at: string | null }
    | undefined;
  if (!doc) notFound();

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Logo compact />
        <span className="text-sm font-medium text-muted">{doc.clinic_name}</span>
      </div>
      <Card className="p-5 sm:p-8">
        <h1 className="text-xl font-semibold">{doc.title}</h1>
        <p className="mt-1 text-sm text-muted">Para: {doc.patient_name}</p>
        <div className="mt-5 rounded-xl bg-bg p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{doc.body}</div>
        {doc.status === "assinado" ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-ok-soft px-4 py-3 text-ok">
            <CheckCircle2 size={20} /> Documento assinado em{" "}
            {new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(doc.signed_at!))}.
          </div>
        ) : (
          <div className="mt-6">
            <SignForm token={token} defaultName={doc.patient_name} />
          </div>
        )}
      </Card>
      <p className="mt-4 text-center text-[13px] text-faint">
        Assinatura eletrônica (Lei 14.063/2020). Registramos data, hora e o aparelho usado para garantir a autenticidade.
      </p>
    </main>
  );
}
