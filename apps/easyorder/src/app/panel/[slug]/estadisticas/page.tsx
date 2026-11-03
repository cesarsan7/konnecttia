import type { Metadata } from "next";
import { StatsView } from "@/components/panel/StatsView";

export const metadata: Metadata = { title: "Estadísticas" };

export default function StatsPage() {
  return <StatsView />;
}
