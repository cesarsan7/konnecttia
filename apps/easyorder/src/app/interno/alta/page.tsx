import type { Metadata } from "next";
import { SignupSettingsView } from "@/components/interno/SignupSettingsView";

export const metadata: Metadata = { title: "Configuración del alta" };

export default function InternalSignupSettingsPage() {
  return <SignupSettingsView />;
}
