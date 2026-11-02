import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

type LegalPageProps = {
  readonly title: string;
  readonly updated: string;
  readonly children: ReactNode;
};

/** Plantilla de páginas legales. Los datos marcados como «pendiente» los completa el promotor. */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <>
      <Header />
      <main className="wrap max-w-[760px] py-16 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-extrabold [&_li]:copy [&_p]:copy [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="mb-2 text-4xl font-extrabold tracking-tight">{title}</h1>
        <p className="!text-sm">Última actualización: {updated}</p>
        {children}
      </main>
      <Footer />
    </>
  );
}

export function Pending({ children }: { readonly children: ReactNode }) {
  return <mark className="rounded bg-amber-100 px-1 text-amber-900">[Pendiente: {children}]</mark>;
}
