import { FAQS } from "@/content/site";

export function Faq() {
  return (
    <section id="preguntas" className="py-20">
      <div className="wrap max-w-[860px]">
        <div className="mb-10 text-center">
          <p className="eyebrow">Preguntas frecuentes</p>
          <h2 className="section-title">Lo importante, explicado claro.</h2>
        </div>
        <div className="divide-y divide-line rounded-[22px] border border-line">
          {FAQS.map((faq) => (
            <details key={faq.question} className="group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] font-extrabold text-navy [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span
                  aria-hidden="true"
                  className="text-xl text-brand transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="copy mt-3">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
