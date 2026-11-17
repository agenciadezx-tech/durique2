import { AppointmentDetail } from "./detail";

export default async function SessaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string; marcado?: string }>;
}) {
  const { id } = await params;
  const { nova, marcado } = await searchParams;
  return <AppointmentDetail id={id} nova={!!nova} marcado={marcado} />;
}
