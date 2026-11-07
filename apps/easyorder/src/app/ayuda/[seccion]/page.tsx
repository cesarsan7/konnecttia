import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticle } from "@/components/ayuda/HelpArticle";
import { HELP_PAGES, helpPageBySlug } from "@/lib/ayuda/content";

type Props = { readonly params: Promise<{ seccion: string }> };

// Solo existen las páginas de la ayuda: cualquier otra dirección es un 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_PAGES.map((page) => ({ seccion: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seccion } = await params;
  const page = helpPageBySlug(seccion);
  if (!page) return {};
  return { title: page.title, description: page.summary };
}

export default async function HelpSectionPage({ params }: Props) {
  const { seccion } = await params;
  const page = helpPageBySlug(seccion);
  if (!page) notFound();
  return <HelpArticle page={page} />;
}
