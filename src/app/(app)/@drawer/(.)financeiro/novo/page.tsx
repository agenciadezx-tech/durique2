import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/(mais)/financeiro/novo/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Novo lançamento">
      <Page {...props} />
    </Drawer>
  );
}
