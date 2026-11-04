import type { Metadata } from "next";
import EasyOrderPage from "@/components/konnecttia/EasyOrderPage";

export const metadata: Metadata = {
  title: "EasyOrder — Carta online y pedidos sin comisión",
  description:
    "EasyOrder by Konnecttia: carta online con tu marca, pedidos para recoger o con reparto propio y un panel para tu equipo. Precio fijo, sin comisión por pedido.",
  alternates: { canonical: "/easyorder" },
};

export default function EasyOrderRoute() {
  return <EasyOrderPage />;
}
