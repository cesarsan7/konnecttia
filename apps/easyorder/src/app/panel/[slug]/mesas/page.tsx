import type { Metadata } from "next";
import { TablesView } from "@/components/panel/tables/TablesView";

export const metadata: Metadata = { title: "Mesas" };

export default function TablesPage() {
  return <TablesView />;
}
