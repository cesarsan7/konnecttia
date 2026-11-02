import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

const SITE_URL = "https://konnecttia.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Konnecttia | Pedidos online para restaurantes de Canarias",
    template: "%s | Konnecttia",
  },
  description:
    "Konnecttia crea herramientas digitales sencillas para negocios locales de Canarias. EasyOrder: carta online y pedidos para recoger o con reparto propio, sin comisión por pedido.",
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: SITE_URL,
    siteName: "Konnecttia",
    images: [{ url: "/images/equipo-mostrador.jpg", width: 1500, height: 1000 }],
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#082f49",
};

type RootLayoutProps = { readonly children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
