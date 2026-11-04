import type { Metadata } from "next";
import { TeamView } from "@/components/panel/team/TeamView";

export const metadata: Metadata = { title: "Equipo" };

export default function TeamPage() {
  return <TeamView />;
}
