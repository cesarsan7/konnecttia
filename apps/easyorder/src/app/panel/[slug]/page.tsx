import type { Metadata } from "next";
import { OrdersBoard } from "@/components/panel/OrdersBoard";

export const metadata: Metadata = { title: "Pedidos" };

export default function OrdersPage() {
  return <OrdersBoard />;
}
