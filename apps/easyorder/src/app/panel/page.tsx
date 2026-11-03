import type { Metadata } from "next";
import { LoginScreen } from "@/components/panel/LoginScreen";

export const metadata: Metadata = { title: "Acceso al panel" };

export default function PanelLoginPage() {
  return <LoginScreen />;
}
