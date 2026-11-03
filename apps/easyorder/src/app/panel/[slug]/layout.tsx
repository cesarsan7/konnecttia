import type { ReactNode } from "react";
import { PanelShell } from "@/components/panel/PanelShell";

export default function RestaurantPanelLayout({ children }: { readonly children: ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
