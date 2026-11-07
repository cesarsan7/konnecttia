"use client";

import { useId, useMemo, useState } from "react";
import { searchHelp } from "@/lib/ayuda/search";
import { helpPath } from "@/lib/ayuda/slugs";
import { HELP_GROUP_ORDER, HELP_GROUP_TITLE, type HelpPage } from "@/lib/ayuda/types";
import "./help.css";

/** Página con todos sus textos: el buscador mira dentro de los pasos y las preguntas. */
type SearchablePage = Pick<
  HelpPage,
  "slug" | "title" | "summary" | "group" | "keywords" | "purpose" | "steps" | "faq"
>;

function PageLink({ page }: { readonly page: SearchablePage }) {
  return (
    <li>
      <a className="k-help-card" href={helpPath(page.slug)}>
        <span className="k-help-card-title">{page.title}</span>
        <span className="k-help-card-text">{page.summary}</span>
      </a>
    </li>
  );
}

export function HelpIndex({ pages }: { readonly pages: readonly SearchablePage[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const searching = query.trim().length > 0;

  const results = useMemo(() => searchHelp(pages, query), [pages, query]);

  return (
    <>
      <section className="k-help-hero">
        <h1 className="k-help-title">¿En qué te ayudamos?</h1>
        <p className="k-help-lead">
          Guías sencillas, paso a paso, para llevar tu restaurante con EasyOrder.
        </p>
        <search className="k-help-search">
          <label className="k-sr-only" htmlFor={inputId}>
            Buscar en la ayuda
          </label>
          <input
            id={inputId}
            className="k-input"
            type="search"
            placeholder="Busca, por ejemplo: bizum, horario, repartidor"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </search>
      </section>

      <p className="k-sr-only" aria-live="polite">
        {searching
          ? results.length === 0
            ? "No hay resultados."
            : `${results.length} ${results.length === 1 ? "resultado" : "resultados"}.`
          : ""}
      </p>

      {searching ? (
        results.length === 0 ? (
          <div className="k-help-empty">
            <p>No encontramos nada con «{query.trim()}».</p>
            <p className="k-small k-muted">
              Prueba con otra palabra más corta, o mira todas las guías.
            </p>
            <button
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              onClick={() => setQuery("")}
            >
              Ver todas las guías
            </button>
          </div>
        ) : (
          <ul className="k-help-grid">
            {results.map((page) => (
              <PageLink key={page.slug} page={page} />
            ))}
          </ul>
        )
      ) : (
        HELP_GROUP_ORDER.map((group) => {
          const inGroup = pages.filter((page) => page.group === group);
          if (inGroup.length === 0) return null;
          return (
            <section key={group} className="k-help-group" aria-labelledby={`grupo-${group}`}>
              <h2 id={`grupo-${group}`} className="k-help-group-title">
                {HELP_GROUP_TITLE[group]}
              </h2>
              <ul className="k-help-grid">
                {inGroup.map((page) => (
                  <PageLink key={page.slug} page={page} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
