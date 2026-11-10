import type { Metadata } from "next";
import { TeamView } from "@/components/interno/TeamView";

export const metadata: Metadata = { title: "Equipo de Konnecttia" };

export default function InternalTeamPage() {
  return <TeamView />;
}
