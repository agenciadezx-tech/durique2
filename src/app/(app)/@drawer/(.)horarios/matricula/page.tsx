import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/horarios/matricula/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Nova matrícula">
      <Page {...props} />
    </Drawer>
  );
}
