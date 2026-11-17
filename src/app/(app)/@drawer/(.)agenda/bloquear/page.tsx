import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/agenda/bloquear/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Bloquear horário">
      <Page {...props} />
    </Drawer>
  );
}
