import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Storefront } from "@/components/Storefront";
import { publicApiUrl, serverApi } from "@/lib/api";

export const dynamic = "force-dynamic";

type Props = { readonly params: Promise<{ readonly slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await serverApi().menu(slug);
  return menu.ok
    ? {
        title: menu.data.restaurante.nombre,
        description: `Pide online a ${menu.data.restaurante.nombre}.`,
      }
    : { title: "Restaurante" };
}

export default async function RestaurantPage({ params }: Props) {
  const { slug } = await params;
  const api = serverApi();
  const [menu, branches, zones] = await Promise.all([
    api.menu(slug),
    api.branches(slug),
    api.zones(slug),
  ]);
  if (!menu.ok) {
    if (menu.status === 404) notFound();
    throw new Error("No se pudo cargar la carta");
  }
  return (
    <Storefront
      apiUrl={publicApiUrl()}
      slug={slug}
      initialMenu={menu.data}
      branches={branches.ok ? branches.data.locales : []}
      zones={zones.ok ? zones.data.zonas : []}
    />
  );
}
