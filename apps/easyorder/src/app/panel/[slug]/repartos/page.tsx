import type { Metadata } from "next";
import { DeliveriesView } from "@/components/panel/drivers/DeliveriesView";

export const metadata: Metadata = { title: "Mis repartos" };

export default function DeliveriesPage() {
  return <DeliveriesView />;
}
