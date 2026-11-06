import type { Metadata } from "next";
import { NewRestaurant } from "@/components/interno/NewRestaurant";

export const metadata: Metadata = { title: "Nuevo restaurante" };

export default function InternalNewPage() {
  return <NewRestaurant />;
}
