type LogoProps = { readonly className?: string };

/** Logotipo tipográfico: la doble «TT» destacada representa la conexión negocio–cliente. */
export function Logo({ className = "" }: LogoProps) {
  return (
    <a
      href="#inicio"
      aria-label="Konnecttia, inicio"
      className={`text-[22px] font-black tracking-[-1.2px] whitespace-nowrap text-navy ${className}`}
    >
      KONNEC<span className="text-sky">TT</span>IA
    </a>
  );
}
