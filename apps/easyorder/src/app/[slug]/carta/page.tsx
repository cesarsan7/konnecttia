import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuReadOnly } from "@/components/MenuReadOnly";
import { serverApi } from "@/lib/api";

export const dynamic = "force-dynamic";

type Props = { readonly params: Promise<{ readonly slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await serverApi().menu(slug);
  return menu.ok ? { title: `Carta · ${menu.data.restaurante.nombre}` } : { title: "Carta" };
}

export default async function MenuPage({ params }: Props) {
  const { slug } = await params;
  const menu = await serverApi().menu(slug);
  if (!menu.ok) {
    if (menu.status === 404) notFound();
    throw new Error("No se pudo cargar la carta");
  }
  return <MenuReadOnly menu={menu.data} />;
}
