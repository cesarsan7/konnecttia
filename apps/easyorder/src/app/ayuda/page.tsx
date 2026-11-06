import type { Metadata } from "next";
import { HelpIndex } from "@/components/ayuda/HelpIndex";
import { HELP_PAGES } from "@/lib/ayuda/content";

export const metadata: Metadata = {
  title: "Centro de ayuda",
  description:
    "Guías paso a paso para llevar tu restaurante con EasyOrder: pedidos, carta, cobros, mesas, equipo y más.",
};

export default function HelpHomePage() {
  const pages = HELP_PAGES.map(
    ({ slug, title, summary, group, keywords, purpose, steps, faq }) => ({
      slug,
      title,
      summary,
      group,
      keywords,
      purpose,
      steps,
      faq,
    }),
  );
  return <HelpIndex pages={pages} />;
}
