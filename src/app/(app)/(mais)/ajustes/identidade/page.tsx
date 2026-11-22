import { PageHeader } from "@/components/ui";
import { getContext } from "@/lib/context";
import { formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BrandEditor } from "./brand-editor";

export const metadata = { title: "Identidade da clínica" };

export default async function IdentidadePage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("clinics")
    .select("name, tagline, booking_message, brand_color, contact_whatsapp, instagram, logo_url, banner_url, address, booking_slug")
    .eq("id", ctx.clinicId)
    .single();
  return (
    <div data-wide>
      <PageHeader
        title="Identidade da clínica"
        description="Logo, cor e textos. Valem para a página de agendamento, o app do paciente, os documentos e a pré-avaliação."
        back={{ href: "/ajustes", label: "Ajustes" }}
      />
      <BrandEditor
        canEdit={ctx.isAdmin}
        initial={{
          clinicId: ctx.clinicId,
          name: c?.name ?? ctx.clinicName,
          tagline: c?.tagline ?? "",
          message: c?.booking_message ?? "",
          color: c?.brand_color ?? "#0f766e",
          whatsapp: c?.contact_whatsapp ? formatPhone(c.contact_whatsapp) : "",
          instagram: c?.instagram ?? "",
          logo: c?.logo_url ?? null,
          banner: c?.banner_url ?? null,
          address: c?.address ?? "",
          slug: c?.booking_slug ?? null,
        }}
      />
    </div>
  );
}
