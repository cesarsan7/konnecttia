import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Privacy } from "@/components/Privacy";
import { serverApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Política de privacidad" };

type Props = { readonly params: Promise<{ readonly slug: string }> };

export default async function PrivacyPage({ params }: Props) {
  const { slug } = await params;
  const info = await serverApi().privacy(slug);
  if (!info.ok) {
    if (info.status === 404) notFound();
    throw new Error("No se pudo cargar la política de privacidad");
  }
  // Si el restaurante tiene su propia política, esta página genérica no se usa.
  if (info.data.privacidad_url) redirect(info.data.privacidad_url);
  return <Privacy info={info.data} />;
}
