import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/pacientes/[id]/vender/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Vender pacote ou plano">
      <Page {...props} />
    </Drawer>
  );
}
