import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const SITE_URL = "https://konnecttia.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Konnecttia · EasyOrder — Pedidos online para restaurantes de Canarias",
    template: "%s | Konnecttia",
  },
  description:
    "EasyOrder, de Konnecttia: carta online y pedidos para recogida o reparto propio, con la marca de tu restaurante y sin comisión por pedido. Tu aliado digital en Canarias.",
  icons: { icon: "/konnecttia/brand/konnecttia-app-icon.svg" },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: SITE_URL,
    siteName: "Konnecttia",
    images: [{ url: "/konnecttia/img/hero.jpg", width: 1400, height: 933 }],
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#0E2A33",
};

type RootLayoutProps = { readonly children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
