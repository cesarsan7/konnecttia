import type { Metadata } from "next";
import { ActivityView } from "@/components/panel/activity/ActivityView";

export const metadata: Metadata = { title: "Actividad del equipo" };

export default function ActivityPage() {
  return <ActivityView />;
}
