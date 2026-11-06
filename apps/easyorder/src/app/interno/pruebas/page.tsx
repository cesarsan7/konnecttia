import type { Metadata } from "next";
import { TrialsView } from "@/components/interno/TrialsView";

export const metadata: Metadata = { title: "Pruebas" };

export default function InternalTrialsPage() {
  return <TrialsView />;
}
