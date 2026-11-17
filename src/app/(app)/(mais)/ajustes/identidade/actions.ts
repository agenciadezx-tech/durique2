"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/forms";
import { getContext } from "@/lib/context";
import { friendlyError, normalizePhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/", "layout");
}

export async function saveBrand(_: ActionState, data: FormData): Promise<ActionState> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return { error: "Somente o administrador altera a identidade." };
  const name = String(data.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome da clínica." };
  const color = String(data.get("color") ?? "");
  const waRaw = String(data.get("whatsapp") ?? "").trim();
  const wa = waRaw ? normalizePhone(waRaw) : null;
  if (waRaw && !wa) return { error: "WhatsApp inválido. Use DDD + número." };
  const ig = String(data.get("instagram") ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/\/.*$/, "");
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) return { error: "Instagram inválido. Ex.: @suaclinica" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      name: name.slice(0, 80),
      tagline: String(data.get("tagline") ?? "").trim().slice(0, 80) || null,
      booking_message: String(data.get("message") ?? "").trim().slice(0, 300) || null,
      brand_color: /^#[0-9a-f]{6}$/i.test(color) ? color : null,
      contact_whatsapp: wa,
      instagram: ig || null,
    })
    .eq("id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: "Identidade salva. Já aparece para os pacientes." };
}

/** Grava (ou tira) o logo/banner depois que o arquivo foi enviado ao Storage pelo navegador. */
export async function setClinicImage(kind: "logo" | "banner", url: string | null): Promise<{ error?: string }> {
  const ctx = await getContext();
  if (!ctx.isAdmin) return { error: "Somente o administrador altera a identidade." };
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clinic-assets/${ctx.clinicId}/`;
  if (url && !url.startsWith(base)) return { error: "Arquivo inválido." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update(kind === "logo" ? { logo_url: url } : { banner_url: url })
    .eq("id", ctx.clinicId);
  if (error) return { error: friendlyError(error) };
  refresh();
  return {};
}
