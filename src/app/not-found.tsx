import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-medium text-accent">Página não encontrada</p>
      <h1 className="mt-2 text-2xl font-semibold">Não achamos o que você procura</h1>
      <p className="mt-2 text-muted">Pode ter sido removido ou o link está incompleto.</p>
      <LinkButton href="/agenda" className="mt-6">
        Voltar para a agenda
      </LinkButton>
    </main>
  );
}
