import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/agenda/nova/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Agendar">
      <Page {...props} />
    </Drawer>
  );
}
