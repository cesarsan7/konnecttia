import { NAV_LINKS } from "@/content/site";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#f1f4f6] bg-white/95 backdrop-blur">
      <div className="wrap flex h-[78px] items-center justify-between gap-7">
        <Logo />
        <nav aria-label="Navegación principal" className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-bold text-[#30485b] hover:text-ocean"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a href="#contacto" className="btn hidden sm:inline-flex">
            Hablemos <span aria-hidden="true">↗</span>
          </a>
          {/* Menú móvil sin JavaScript: <details> es accesible por teclado. */}
          <details className="relative lg:hidden">
            <summary className="cursor-pointer list-none rounded-full p-2 text-2xl text-navy [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true">☰</span>
              <span className="sr-only">Abrir menú</span>
            </summary>
            <nav
              aria-label="Navegación móvil"
              className="absolute top-12 right-0 flex w-56 flex-col gap-1 rounded-2xl border border-line bg-white p-3 shadow-lg"
            >
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-bold text-navy hover:bg-ice"
                >
                  {link.label}
                </a>
              ))}
              <a href="#contacto" className="btn mt-2">
                Hablemos
              </a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
