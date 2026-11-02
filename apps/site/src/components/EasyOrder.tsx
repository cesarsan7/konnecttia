import { ADDONS, EASYORDER_INTRO, FEATURES } from "@/content/site";

export function EasyOrder() {
  return (
    <section id="easyorder" className="bg-[#fbfdff] py-20">
      <div className="wrap">
        <div className="mb-12 grid gap-8 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="eyebrow">{EASYORDER_INTRO.eyebrow}</p>
            <h2 className="section-title">{EASYORDER_INTRO.title}</h2>
          </div>
          <div>
            {EASYORDER_INTRO.paragraphs.map((paragraph) => (
              <p key={paragraph} className="copy mb-3">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[20px] border border-line bg-white p-7 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(8,47,73,0.5)]"
            >
              <div
                aria-hidden="true"
                className="mb-5 grid size-11 place-items-center rounded-xl bg-ice text-lg text-ocean"
              >
                {feature.icon}
              </div>
              <h3 className="mb-2 text-[17px] leading-snug font-extrabold">{feature.title}</h3>
              <p className="copy text-[14px]">{feature.copy}</p>
            </article>
          ))}
        </div>

        <div className="mt-12 grid gap-6 rounded-[24px] bg-navy p-8 text-white md:p-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="mb-4 text-[11px] font-extrabold tracking-[0.13em] text-cyan uppercase">
              {ADDONS.eyebrow}
            </p>
            <h3 className="mb-4 text-[clamp(24px,2.6vw,32px)] leading-tight font-extrabold tracking-tight text-white">
              {ADDONS.title}
            </h3>
            <p className="text-[15px] leading-[1.78] text-[#c7dceb]">{ADDONS.copy}</p>
          </div>
          <div className="lg:text-right">
            <a href={ADDONS.cta.href} className="btn btn-outline">
              {ADDONS.cta.label} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
