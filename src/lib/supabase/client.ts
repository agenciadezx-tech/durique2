import { createBrowserClient } from "@supabase/ssr";

/** Cliente do navegador (usado só para enviar arquivos ao Storage; as regras de acesso valem igual). */
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
