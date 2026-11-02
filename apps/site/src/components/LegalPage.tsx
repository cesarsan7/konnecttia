import type { ReactNode } from "react";
import "./konnecttia/konnecttia.css";

type LegalPageProps = {
  readonly title: string;
  readonly updated: string;
  readonly children: ReactNode;
};

/** Plantilla de páginas legales. Los datos marcados como «pendiente» los completa el promotor. */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="kt">
      <header className="header scrolled">
        <div className="wrap nav">
          <a className="brand" href="/" aria-label="Konnecttia, inicio">
            <img
              src="/konnecttia/brand/konnecttia-logo.svg"
              alt="Konnecttia"
              width="176"
              height="34"
            />
          </a>
          <a className="btn btn-ghost btn-sm" href="/">
            Volver al inicio
          </a>
        </div>
      </header>
      <main className="section legal">
        <div className="wrap legal-body">
          <h1>{title}</h1>
          <p className="legal-updated">Última actualización: {updated}</p>
          {children}
        </div>
      </main>
      <footer className="footer">
        <div className="wrap">
          <div className="foot-bottom">
            <span>© Konnecttia · Canarias</span>
            <nav aria-label="Legal">
              <a href="/aviso-legal">Aviso legal</a>
              <a href="/privacidad">Privacidad</a>
              <a href="/cookies">Cookies</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function Pending({ children }: { readonly children: ReactNode }) {
  return <mark className="pending">[Pendiente: {children}]</mark>;
}
