import type { Metadata } from "next";
import { TemplatesView } from "@/components/interno/TemplatesView";

export const metadata: Metadata = { title: "Plantillas de roles" };

export default function InternalTemplatesPage() {
  return <TemplatesView />;
}
