import type { Metadata } from "next";
import EasyOrderPage from "@/components/konnecttia/EasyOrderPage";
import { signupUrl } from "@/components/konnecttia/links";

export const metadata: Metadata = {
  title: "EasyOrder — Carta online y pedidos sin comisión",
  description:
    "EasyOrder by Konnecttia: carta online con tu marca, pedidos para recoger o con reparto propio y un panel para tu equipo. Precio fijo, sin comisión por pedido.",
  alternates: { canonical: "/easyorder" },
};

// El botón «Prueba gratis» depende de EASYORDER_PANEL_URL, que se lee al servir la página.
export const dynamic = "force-dynamic";

export default function EasyOrderRoute() {
  return <EasyOrderPage trial={signupUrl(process.env.EASYORDER_PANEL_URL) !== null} />;
}
