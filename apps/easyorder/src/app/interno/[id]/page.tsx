import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RestaurantDetail } from "@/components/interno/RestaurantDetail";

export const metadata: Metadata = { title: "Ficha del restaurante" };

export default async function InternalDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurantId = Number(id);
  if (!Number.isSafeInteger(restaurantId) || restaurantId <= 0) notFound();
  return <RestaurantDetail id={restaurantId} />;
}
