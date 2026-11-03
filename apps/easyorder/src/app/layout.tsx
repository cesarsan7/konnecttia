import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "EasyOrder", template: "%s · Pide online" },
  description: "Pide online a tu restaurante, para recoger o a domicilio.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0E2A33", width: "device-width" };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
