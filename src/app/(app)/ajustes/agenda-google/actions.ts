"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function rotateCalendar(data: FormData) {
  const supabase = await createClient();
  await supabase.rpc("rotate_calendar_token", { p_professional: String(data.get("id")) });
  revalidatePath("/ajustes/agenda-google");
}
