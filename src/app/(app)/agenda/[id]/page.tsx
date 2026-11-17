import { AppointmentDetail } from "./detail";

export default async function SessaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string }>;
}) {
  const { id } = await params;
  const { nova } = await searchParams;
  return <AppointmentDetail id={id} nova={!!nova} />;
}
