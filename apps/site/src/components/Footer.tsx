import { NAV_LINKS } from "@/content/site";
import { Logo } from "./Logo";

const LEGAL_LINKS = [
  { href: "/aviso-legal", label: "Aviso legal" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/cookies", label: "Cookies" },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line bg-white py-10">
      <div className="wrap">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Logo />
          <nav aria-label="Navegación del pie" className="flex flex-wrap gap-6">
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
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 text-[12px] text-muted sm:flex-row sm:justify-between">
          <nav aria-label="Información legal" className="flex gap-4">
            {LEGAL_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-ocean">
                {link.label}
              </a>
            ))}
          </nav>
          <p>© {new Date().getFullYear()} Konnecttia · Canarias</p>
        </div>
      </div>
    </footer>
  );
}
