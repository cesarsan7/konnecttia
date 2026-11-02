import Image from "next/image";
import { HERO, TRUST_ITEMS } from "@/content/site";

const TRUST_ICONS = ["↗", "✓", "⌂", "♡"] as const;

export function Hero() {
  return (
    <section id="inicio" className="pt-6">
      <div className="wrap grid items-center gap-10 rounded-t-[26px] bg-[linear-gradient(130deg,#f8fbfe_0%,#f3f8fd_67%,#edf5ff_100%)] px-[5.4%] py-12 lg:min-h-[560px] lg:grid-cols-[1fr_1.05fr] lg:py-16">
        <div>
          <p className="eyebrow">{HERO.eyebrow}</p>
          <h1 className="mb-5 text-[clamp(40px,4.6vw,62px)] leading-[1.08] font-extrabold tracking-[-0.055em] text-[#172d4b]">
            {HERO.titleStart} <em className="text-brand-soft not-italic">{HERO.titleEmphasis}</em>{" "}
            {HERO.titleEnd}
          </h1>
          <p className="copy mb-7 max-w-[520px]">{HERO.copy}</p>
          <div className="flex flex-wrap gap-3">
            <a href={HERO.primary.href} className="btn">
              {HERO.primary.label} <span aria-hidden="true">↗</span>
            </a>
            <a href={HERO.secondary.href} className="btn btn-outline">
              {HERO.secondary.label}
            </a>
          </div>
        </div>
        <div className="relative aspect-[3/2] overflow-hidden rounded-[22px] shadow-[0_30px_60px_-30px_rgba(8,47,73,0.45)]">
          <Image
            src="/images/equipo-mostrador.jpg"
            alt="Dos personas de un restaurante revisan pedidos en una tableta junto al mostrador"
            fill
            priority
            sizes="(min-width: 1024px) 640px, 100vw"
            className="object-cover"
          />
        </div>
      </div>
      <div className="border-y border-line bg-white">
        <div className="wrap flex flex-col items-center gap-4 py-6 lg:flex-row lg:justify-between">
          <p className="text-sm font-extrabold text-navy">
            Un canal propio para el trabajo de cada día
          </p>
          <ul className="flex flex-wrap justify-center gap-x-7 gap-y-3">
            {TRUST_ITEMS.map((item, index) => (
              <li
                key={item}
                className="flex items-center gap-2 text-[13px] font-bold text-[#30485b]"
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 place-items-center rounded-full bg-ice text-xs text-ocean"
                >
                  {TRUST_ICONS[index]}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
