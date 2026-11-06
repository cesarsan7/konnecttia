import KonnecttiaLanding from "@/components/konnecttia/KonnecttiaLanding";
import { signupUrl } from "@/components/konnecttia/links";

// El botón «Prueba gratis» depende de EASYORDER_PANEL_URL, que se lee al servir la página.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <KonnecttiaLanding trial={signupUrl(process.env.EASYORDER_PANEL_URL) !== null} />;
}
