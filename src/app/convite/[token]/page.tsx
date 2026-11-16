import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Logo } from "@/components/logo";
import { Alert, Card, LinkButton } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "./actions";

export const metadata = { title: "Convite", robots: { index: false } };

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,}$/.test(token)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: auth }] = await Promise.all([supabase.rpc("get_invite", { p_token: token }), supabase.auth.getUser()]);
  const inv = (data ?? [])[0] as { clinic_name: string; role: Role; email: string; valid: boolean } | undefined;
  if (!inv) notFound();
  const next = encodeURIComponent(`/convite/${token}`);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 text-center sm:p-7">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
            <UserPlus size={22} />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Convite para {inv.clinic_name}</h1>
          <p className="mt-1 text-[15px] text-muted">
            Você foi convidado(a) como <span className="font-medium text-ink">{ROLE_LABEL[inv.role]}</span>.
          </p>

          {!inv.valid ? (
            <div className="mt-6">
              <Alert>Este convite expirou ou já foi usado. Peça um novo para a clínica.</Alert>
            </div>
          ) : auth.user ? (
            <div className="mt-6 text-left">
              <ActionForm action={acceptInvite}>
                <input type="hidden" name="token" value={token} />
                <p className="text-center text-sm text-muted">Entrando como {auth.user.email}</p>
                <SubmitButton full pendingText="Entrando na clínica…">
                  Aceitar e entrar
                </SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              <LinkButton href={`/criar-conta?next=${next}`} full size="lg">
                Criar minha conta
              </LinkButton>
              <LinkButton href={`/entrar?next=${next}`} full variant="secondary" size="lg">
                Já tenho conta, entrar
              </LinkButton>
              <p className="pt-2 text-[13px] text-muted">Use o e-mail {inv.email}.</p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
