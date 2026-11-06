import "../panel/panel.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { InternalShell } from "@/components/interno/InternalShell";
import { PanelProvider } from "@/components/panel/PanelProvider";
import { publicApiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: { default: "Panel interno · Konnecttia", template: "%s · Panel interno" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0E2A33" };

// Las variables se leen en cada petición: EasyPanel no las pasa al build.
export const dynamic = "force-dynamic";

/** Panel interno de Konnecttia (ADR 0009): mismo despliegue y mismo login que el panel. */
export default function InternalLayout({ children }: { readonly children: ReactNode }) {
  const config = {
    apiUrl: publicApiUrl(),
    supabaseUrl: process.env.SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
  };
  return (
    <div className="k-root">
      <PanelProvider config={config}>
        <InternalShell>{children}</InternalShell>
      </PanelProvider>
    </div>
  );
}
