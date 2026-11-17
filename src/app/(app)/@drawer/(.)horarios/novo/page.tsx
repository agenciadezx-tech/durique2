import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/horarios/novo/page";

export default function DrawerPage() {
  return (
    <Drawer label="Nova turma">
      <Page />
    </Drawer>
  );
}
