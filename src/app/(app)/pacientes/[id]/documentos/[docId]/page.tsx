import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PenLine, ShieldCheck } from "lucide-react";
import { ConfirmSubmit } from "@/components/forms";
import { PrintButton } from "@/components/print-button";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { WaSendButton } from "@/components/wa-send";
import { getContext } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { TZ } from "@/lib/format";
import { firstName } from "@/lib/messages";
import { cancelDocument } from "../../../actions";

export const metadata = { title: "Documento" };

const stamp = (ts: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(ts));

export default async function DocumentoPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const ctx = await getContext();
  const { id, docId } = await params;
  const supabase = await createClient();
  const [{ data: doc }, { data: patient }] = await Promise.all([
    supabase.from("patient_documents").select("*").eq("id", docId).maybeSingle(),
    supabase.from("patients").select("id, name, phone").eq("id", id).maybeSingle(),
  ]);
  if (!doc || !patient) notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const link = `${origin}/assinar/${doc.token}`;
  const message = `Olá, ${firstName(patient.name)}! Segue o documento "${doc.title}" da ${ctx.clinicName} para você ler e assinar pelo celular: ${link}`;

  return (
    <>
      <PageHeader
        title={doc.title}
        description={patient.name}
        back={{ href: `/pacientes/${id}`, label: patient.name }}
        action={doc.status === "assinado" && <PrintButton />}
      />
      <div className="space-y-6">
        {doc.status === "pendente" && (
          <Card className="p-5 print:hidden">
            <p className="font-medium">Como o paciente vai assinar?</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <LinkButton href={`/assinar/${doc.token}`}>
                <PenLine size={18} /> Assinar agora neste aparelho
              </LinkButton>
              {patient.phone && (
                <WaSendButton phone={patient.phone} body={message} kind="outro" patientId={patient.id} label="Enviar link pelo WhatsApp" />
              )}
            </div>
            <p className="mt-3 text-[13px] text-muted">
              Na clínica, entregue o celular ou tablet ao paciente. Ou envie o link e ele assina de casa.
            </p>
          </Card>
        )}

        <Card className="p-5 sm:p-8 print:border-0 print:p-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{ctx.clinicName}</p>
            <Badge tone={doc.status === "assinado" ? "ok" : doc.status === "cancelado" ? "neutral" : "warn"}>
              {doc.status === "assinado" ? "Assinado" : doc.status === "cancelado" ? "Cancelado" : "Aguardando assinatura"}
            </Badge>
          </div>
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{doc.body}</div>
          {doc.status === "assinado" && (
            <div className="mt-8 border-t border-line pt-5">
              {doc.signature_png && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doc.signature_png} alt={`Assinatura de ${doc.signer_name}`} className="h-24 w-auto" />
              )}
              <p className="font-medium">{doc.signer_name}</p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <ShieldCheck size={16} className="text-ok" /> Assinado eletronicamente em {stamp(doc.signed_at!)}
                {doc.signed_ip && ` · IP ${doc.signed_ip}`} · código <code className="text-[12px]">{doc.content_hash?.slice(0, 16)}</code>
              </p>
            </div>
          )}
        </Card>

        {doc.status === "pendente" && ctx.canManageAgenda && (
          <form action={cancelDocument} className="print:hidden">
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="patient_id" value={id} />
            <ConfirmSubmit size="sm" variant="ghost" question="Cancelar este documento? O link de assinatura deixa de funcionar.">
              Cancelar documento
            </ConfirmSubmit>
          </form>
        )}
      </div>
    </>
  );
}
