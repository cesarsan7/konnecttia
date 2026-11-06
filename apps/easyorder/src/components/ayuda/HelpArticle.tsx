import { HELP_PAGES } from "@/lib/ayuda/content";
import { HELP_ROOT, helpPath } from "@/lib/ayuda/slugs";
import type { HelpPage, HelpShot } from "@/lib/ayuda/types";
import "./help.css";

/** Tamaño real de las capturas (en píxeles CSS): el navegador reserva el hueco antes de cargar. */
const SHOT_SIZE = {
  desktop: { width: 1360, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

/** Ancho de pantalla hasta el que se usa la captura de móvil. */
const MOBILE_MEDIA = "(max-width: 640px)";

function Shot({ shot }: { readonly shot: HelpShot }) {
  return (
    <figure className="k-help-shot">
      <picture>
        <source
          media={MOBILE_MEDIA}
          srcSet={`/ayuda/${shot.file}-movil.png`}
          width={SHOT_SIZE.mobile.width}
          height={SHOT_SIZE.mobile.height}
        />
        <img
          src={`/ayuda/${shot.file}-escritorio.png`}
          alt={shot.alt}
          width={SHOT_SIZE.desktop.width}
          height={SHOT_SIZE.desktop.height}
          loading="lazy"
          decoding="async"
        />
      </picture>
      {shot.caption ? <figcaption>{shot.caption}</figcaption> : null}
    </figure>
  );
}

export function HelpArticle({ page }: { readonly page: HelpPage }) {
  const related = page.related
    .map((slug) => HELP_PAGES.find((candidate) => candidate.slug === slug))
    .filter((item): item is HelpPage => item !== undefined);

  return (
    <article className="k-help-article">
      <nav className="k-help-crumbs" aria-label="Dónde estás">
        <a className="k-link" href={HELP_ROOT}>
          Centro de ayuda
        </a>
        <span aria-hidden="true">/</span>
        <span>{page.title}</span>
      </nav>

      <h1 className="k-help-title">{page.title}</h1>

      <section aria-labelledby="para-que">
        <h2 id="para-que" className="k-help-h2">
          Para qué sirve
        </h2>
        {page.purpose.map((paragraph) => (
          <p key={paragraph} className="k-help-p">
            {paragraph}
          </p>
        ))}
      </section>

      <section aria-labelledby="paso-a-paso">
        <h2 id="paso-a-paso" className="k-help-h2">
          Paso a paso
        </h2>
        <ol className="k-help-steps">
          {page.steps.map((step) => (
            <li key={step.text} className="k-help-step">
              <p className="k-help-p">{step.text}</p>
              {step.tip ? <p className="k-help-tip">{step.tip}</p> : null}
              {step.shot ? <Shot shot={step.shot} /> : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="preguntas">
        <h2 id="preguntas" className="k-help-h2">
          Preguntas frecuentes
        </h2>
        <div className="k-help-faq">
          {page.faq.map((item) => (
            <details key={item.question} className="k-help-faq-item">
              <summary>{item.question}</summary>
              <p className="k-help-p">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {related.length > 0 ? (
        <section aria-labelledby="tambien">
          <h2 id="tambien" className="k-help-h2">
            También te puede interesar
          </h2>
          <ul className="k-help-grid">
            {related.map((item) => (
              <li key={item.slug}>
                <a className="k-help-card" href={helpPath(item.slug)}>
                  <span className="k-help-card-title">{item.title}</span>
                  <span className="k-help-card-text">{item.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
