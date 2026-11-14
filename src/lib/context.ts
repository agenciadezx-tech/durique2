import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "recepcao" | "profissional" | "financeiro";

export type AppContext = {
  userId: string;
  email: string;
  clinicId: string;
  clinicName: string;
  unitId: string;
  role: Role;
  canManageAgenda: boolean; // admin ou recepção
  isAdmin: boolean;
  canSeeExpenses: boolean; // admin ou financeiro (despesas, resultado, comissões)
  canSeeClinical: boolean; // admin ou profissional (prontuário)
  professionalId: string | null; // profissional ligado ao usuário (pode escrever/assinar prontuário)
  professionalName: string | null;
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  recepcao: "Recepção",
  profissional: "Profissional",
  financeiro: "Financeiro",
};

/** Usuário logado + clínica dele. Sem clínica ainda → tela de começar. */
export const getContext = cache(async (): Promise<AppContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const { data: member } = await supabase
    .from("members")
    .select("id, clinic_id, role, clinics(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!member) redirect("/comecar");

  const { data: unit } = await supabase
    .from("units")
    .select("id")
    .eq("clinic_id", member.clinic_id)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .single();

  const { data: pro } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("member_id", member.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const role = member.role as Role;
  const clinic = member.clinics as unknown as { name: string } | null;
  return {
    userId: user.id,
    email: user.email ?? "",
    clinicId: member.clinic_id,
    clinicName: clinic?.name ?? "Minha clínica",
    unitId: unit?.id ?? "",
    role,
    canManageAgenda: role === "admin" || role === "recepcao",
    isAdmin: role === "admin",
    canSeeExpenses: role === "admin" || role === "financeiro",
    canSeeClinical: role === "admin" || role === "profissional",
    professionalId: pro?.id ?? null,
    professionalName: pro?.name ?? null,
  };
});
