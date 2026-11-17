import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/horarios/matricula/page";

export default function DrawerPage() {
  return (
    <Drawer label="Nova matrícula">
      <Page />
    </Drawer>
  );
}
