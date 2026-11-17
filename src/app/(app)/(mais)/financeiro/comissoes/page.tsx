import { redirect } from "next/navigation";

/** Comissões agora ficam em Equipe. */
export default async function ComissoesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  redirect(mes ? `/equipe?mes=${encodeURIComponent(mes)}` : "/equipe");
}
