import "./panel.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PanelProvider } from "@/components/panel/PanelProvider";
import { publicApiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: { default: "Panel · EasyOrder", template: "%s · EasyOrder" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0E2A33" };

// Las variables se leen en cada petición: EasyPanel no las pasa al build.
export const dynamic = "force-dynamic";

export default function PanelLayout({ children }: { readonly children: ReactNode }) {
  const config = {
    apiUrl: publicApiUrl(),
    supabaseUrl: process.env.SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
  };
  return (
    <div className="k-root">
      <PanelProvider config={config}>{children}</PanelProvider>
    </div>
  );
}
