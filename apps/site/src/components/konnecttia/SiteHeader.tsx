"use client";
import { useEffect, useState } from "react";
import { ROUTE, sectionHref } from "./links";

type SiteHeaderProps = {
  /** true en la portada: los enlaces a secciones son anclas de la misma página. */
  readonly onHome: boolean;
};

/** Cabecera común de konnecttia.com (portada y páginas de producto). */
export function SiteHeader({ onHome }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const to = (id: string) => sectionHref(id, onHome);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header
      className={`header${menuOpen ? " open" : ""}${scrolled ? " scrolled" : ""}`}
      id="inicio"
    >
      <div className="wrap nav">
        <a className="brand" href={onHome ? "#inicio" : ROUTE.Home} aria-label="Konnecttia, inicio">
          <img
            src="/konnecttia/brand/konnecttia-logo.svg"
            alt="Konnecttia"
            width="176"
            height="34"
          />
        </a>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: el clic llega de los enlaces del menú, que ya funcionan con teclado. */}
        <nav
          className="menu"
          id="menu"
          aria-label="Navegación principal"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMenuOpen(false);
          }}
        >
          <a href={ROUTE.EasyOrder} aria-current={onHome ? undefined : "page"}>
            EasyOrder
          </a>
          <a href={to("ia")}>IA y WhatsApp</a>
          <a href={to("como-funciona")}>Cómo funciona</a>
          <a href={to("marca")}>Quiénes somos</a>
          <a href={to("preguntas")}>Preguntas</a>
          <a className="menu-login" href={ROUTE.PanelAccess}>
            Acceder
          </a>
          <a className="btn btn-primary" href={to("contacto")}>
            Solicitar una demo
          </a>
        </nav>
        <a className="btn btn-primary btn-sm" href={to("contacto")}>
          Solicitar una demo
        </a>
        <button
          className="hamb"
          type="button"
          aria-controls="menu"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg aria-hidden="true">
            <use href={menuOpen ? "#i-close" : "#i-burger"} />
          </svg>
        </button>
      </div>
    </header>
  );
}
