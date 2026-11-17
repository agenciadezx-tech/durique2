import { Drawer } from "@/components/drawer";
import Page from "@/app/(app)/pacientes/[id]/exercicios/page";

export default function DrawerPage(props: Parameters<typeof Page>[0]) {
  return (
    <Drawer label="Exercícios para casa">
      <Page {...props} />
    </Drawer>
  );
}
