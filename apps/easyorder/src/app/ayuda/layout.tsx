import "../panel/panel.css";
import "./ayuda.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EasyOrderLockup } from "@/components/panel/Brand";
import { HELP_ROOT } from "@/lib/ayuda/slugs";

export const metadata: Metadata = {
  title: { default: "Centro de ayuda · EasyOrder", template: "%s · Ayuda de EasyOrder" },
  description:
    "Guías sencillas para sacar partido a EasyOrder: pedidos, carta, cobros, mesas, equipo y más.",
};

/** Centro de ayuda público: sin login, con los mismos estilos y colores que el panel. */
export default function HelpLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="k-root k-help">
      <header className="k-help-top">
        <a className="k-help-brand" href={HELP_ROOT} aria-label="Centro de ayuda de EasyOrder">
          <EasyOrderLockup />
          <span className="k-help-brand-tag">Ayuda</span>
        </a>
        <a className="k-btn k-btn-secondary k-btn-sm" href="/panel">
          Ir al panel
        </a>
      </header>
      <main className="k-help-main" id="contenido">
        {children}
      </main>
      <footer className="k-help-foot">
        <p className="k-small k-muted">
          ¿No encuentras lo que buscas? Escríbenos a{" "}
          <a className="k-link" href="mailto:hola@konnecttia.com">
            hola@konnecttia.com
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
