import type { Metadata } from "next";
import { MenuView } from "@/components/panel/menu/MenuView";

export const metadata: Metadata = { title: "Carta" };

export default function MenuPage() {
  return <MenuView />;
}
