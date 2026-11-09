import type { Metadata } from "next";
import { IncidentsView } from "@/components/panel/incidents/IncidentsView";

export const metadata: Metadata = { title: "Incidencias" };

export default function IncidentsPage() {
  return <IncidentsView />;
}
