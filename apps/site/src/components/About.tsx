import Image from "next/image";
import { ABOUT, STEPS } from "@/content/site";

export function About() {
  return (
    <>
      <section id="nosotros" className="py-20">
        <div className="wrap grid items-center gap-10 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[22px]">
            <Image
              src="/images/equipo-conversacion.jpg"
              alt="Una persona de Konnecttia conversa con la responsable de un local frente a una tableta"
              fill
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="eyebrow">{ABOUT.eyebrow}</p>
            <h2 className="section-title mb-5">{ABOUT.title}</h2>
            {ABOUT.paragraphs.map((paragraph) => (
              <p key={paragraph} className="copy mb-4">
                {paragraph}
              </p>
            ))}
            <p className="mt-6 border-l-4 border-sky pl-4 text-lg font-extrabold text-navy">
              {ABOUT.motto}
            </p>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-ice py-20">
        <div className="wrap">
          <div className="mx-auto mb-12 max-w-[640px] text-center">
            <p className="eyebrow">Así lo ponemos en marcha</p>
            <h2 className="section-title mb-4">Lo vemos contigo, paso a paso.</h2>
            <p className="copy">
              Primero entendemos cómo trabaja tu local. Después te enseñamos EasyOrder y concretamos
              lo que necesita tu carta.
            </p>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.number} className="rounded-[20px] bg-white p-7">
                <p className="mb-4 text-[11px] font-extrabold tracking-[0.13em] text-brand uppercase">
                  {step.number}
                </p>
                <h3 className="mb-2 text-[17px] font-extrabold">{step.title}</h3>
                <p className="copy text-[14px]">{step.copy}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex flex-col items-center justify-between gap-5 rounded-[22px] bg-white p-8 md:flex-row">
            <p className="text-xl font-extrabold text-navy">
              ¿Quieres ver EasyOrder con la carta de tu restaurante?
            </p>
            <a href="#contacto" className="btn">
              Solicitar una demo <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
