import type { Metadata } from "next";
import { AgentTemplateView } from "@/components/interno/AgentTemplateView";

export const metadata: Metadata = { title: "Plantilla del agente" };

export default function InternalAgentPage() {
  return <AgentTemplateView />;
}
