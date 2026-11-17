import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/horarios/[id]/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Turma">
      <Page {...props} />
    </Drawer>
  );
}
