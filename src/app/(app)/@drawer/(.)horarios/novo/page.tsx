import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/horarios/novo/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Nova turma">
      <Page {...props} />
    </Drawer>
  );
}
