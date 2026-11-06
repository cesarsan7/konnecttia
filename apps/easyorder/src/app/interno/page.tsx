import type { Metadata } from "next";
import { RestaurantList } from "@/components/interno/RestaurantList";

export const metadata: Metadata = { title: "Restaurantes" };

export default function InternalListPage() {
  return <RestaurantList />;
}
