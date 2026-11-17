import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/pacientes/novo/page";

export default function DrawerPage() {
  return (
    <Drawer label="Novo paciente">
      <Page />
    </Drawer>
  );
}
