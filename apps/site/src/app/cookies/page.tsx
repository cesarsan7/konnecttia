import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de cookies", robots: { index: false } };

export default function CookiesPage() {
  return (
    <LegalPage title="Política de cookies" updated="1 de noviembre de 2026">
      <p>
        Este sitio no usa cookies de analítica, publicidad ni seguimiento, y no carga fuentes ni
        scripts de terceros: la tipografía se sirve desde nuestro propio servidor.
      </p>
      <p>
        Si en el futuro se añaden herramientas de medición, se pedirá tu consentimiento antes de
        activarlas y esta página se actualizará con el detalle de cada cookie.
      </p>
    </LegalPage>
  );
}
