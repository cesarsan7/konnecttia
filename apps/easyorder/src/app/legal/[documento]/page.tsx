import { isDraftVersion, isLegalDocument, LEGAL_VERSION } from "@konnecttia/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_TEXTS } from "@/lib/legal/documents";

type Props = { readonly params: Promise<{ readonly documento: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { documento } = await params;
  return { title: isLegalDocument(documento) ? LEGAL_TEXTS[documento].titulo : "Documento legal" };
}

/** Texto legal público de Konnecttia (términos, encargado de tratamiento, cookies). */
export default async function LegalPage({ params }: Props) {
  const { documento } = await params;
  if (!isLegalDocument(documento)) notFound();
  const text = LEGAL_TEXTS[documento];
  const version = LEGAL_VERSION[documento];
  return (
    <main className="k-legal">
      <h1>{text.titulo}</h1>
      <p className="k-muted">
        {text.resumen} Versión {version}.
      </p>
      {isDraftVersion(version) ? (
        <p role="note" className="k-warn">
          Borrador pendiente de revisión legal: puede cambiar antes de su publicación definitiva.
        </p>
      ) : null}
      {text.secciones.map((section) => (
        <section key={section.titulo}>
          <h2>{section.titulo}</h2>
          {section.parrafos.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </main>
  );
}
