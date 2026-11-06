"use client";
/**
 * Página del servicio EasyOrder (/easyorder): qué es, para quién, funciones y planes.
 * Reutiliza la marca, la cabecera y el pie de la portada. Textos en ./easyorder-content.ts.
 */
import { useRef } from "react";
import {
  ADD_ONS,
  AUDIENCE,
  CUSTOMER_FEATURES,
  type Feature,
  PLANS,
  TEAM_FEATURES,
} from "./easyorder-content";
import { IconSprite } from "./icons";
import { ROUTE, sectionHref } from "./links";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { useReveal } from "./useReveal";
import "./konnecttia.css";

const DEMO_HREF = sectionHref("contacto", false);
const AUDIENCE_ICONS = ["#i-store", "#i-bag", "#i-pin", "#i-percent"] as const;

function Soon() {
  return <span className="tag-soon">Próximamente</span>;
}

function FeatureList({ items }: { readonly items: readonly Feature[] }) {
  return (
    <ul className="eo-features">
      {items.map((f) => (
        <li key={f.title}>
          <svg aria-hidden="true">
            <use href="#i-check" />
          </svg>
          <div>
            <h4>
              {f.title}
              {f.soon ? <Soon /> : null}
            </h4>
            <p>{f.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PanelButton({ className }: { readonly className: string }) {
  return (
    <a className={className} href={ROUTE.PanelAccess}>
      Acceder al panel{" "}
      <svg aria-hidden="true">
        <use href="#i-arrow" />
      </svg>
    </a>
  );
}

export default function EasyOrderPage({ trial = false }: { trial?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  return (
    <>
      <IconSprite />
      <div className="kt" id="konnecttia" ref={root}>
        <a className="skip" href="#contenido">
          Saltar al contenido
        </a>
        <SiteHeader onHome={false} />

        <main id="contenido">
          {/* CABECERA */}
          <section className="eo-hero">
            <div className="wrap eo-hero-grid">
              <div className="reveal">
                <p className="eyebrow">EasyOrder by Konnecttia</p>
                <h1>
                  Tu canal de pedidos propio. <span className="tt">Sin comisión por pedido.</span>
                </h1>
                <p className="lead">
                  Carta online, pedidos para recoger o con tu reparto, y un panel para que tu equipo
                  lo gestione todo. Con la marca de tu restaurante y a precio fijo.
                </p>
                <div className="actions">
                  <a className="btn btn-primary" href={DEMO_HREF}>
                    Solicitar una demo
                  </a>
                  {trial ? (
                    <a className="btn btn-ghost" href={ROUTE.FreeTrial}>
                      Prueba gratis
                    </a>
                  ) : null}
                  <PanelButton className="btn btn-ghost" />
                </div>
                <p className="eo-hint">¿Ya usas EasyOrder? Entra en el panel con tu cuenta.</p>
              </div>
              <aside className="eo-is reveal" aria-labelledby="eo-is-title">
                <h2 id="eo-is-title">Qué es EasyOrder</h2>
                <p>
                  Un canal de pedidos online para tu restaurante: tu cliente consulta la carta y
                  pide; el pedido llega validado a tu panel, con precio, zona y forma de pago.
                </p>
                <h3>Qué no es</h3>
                <ul>
                  <li>No es una app de reparto: el reparto, si lo ofreces, es tuyo.</li>
                  <li>No es un TPV ni un programa de facturación.</li>
                  <li>No promete más ventas: te da un canal propio y te acompaña a usarlo.</li>
                </ul>
              </aside>
            </div>
          </section>

          {/* PARA QUIÉN */}
          <section className="section eo-alt" id="para-quien">
            <div className="wrap">
              <div className="section-head reveal">
                <p className="eyebrow">Para quién</p>
                <h2>Pensado para negocios de comida de Canarias.</h2>
                <p className="lead">
                  Locales que quieren dejar de apuntar pedidos a mano o de ceder su margen a una
                  plataforma.
                </p>
              </div>
              <div className="cards eo-cards4">
                {AUDIENCE.map((a, i) => (
                  <article className="card reveal" key={a.title}>
                    <span className={i % 2 ? "ico c" : "ico"}>
                      <svg aria-hidden="true">
                        <use href={AUDIENCE_ICONS[i % AUDIENCE_ICONS.length]} />
                      </svg>
                    </span>
                    <h3>{a.title}</h3>
                    <p>{a.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* FUNCIONES */}
          <section className="section" id="funciones">
            <div className="wrap">
              <div className="section-head center reveal">
                <p className="eyebrow">Funciones</p>
                <h2>Lo que ve tu cliente y lo que usa tu equipo.</h2>
              </div>
              <div className="eo-split">
                <div className="eo-panel reveal">
                  <h3>
                    <span className="ico">
                      <svg aria-hidden="true">
                        <use href="#i-menu" />
                      </svg>
                    </span>
                    Para tu cliente
                  </h3>
                  <FeatureList items={CUSTOMER_FEATURES} />
                </div>
                <div className="eo-panel reveal">
                  <h3>
                    <span className="ico c">
                      <svg aria-hidden="true">
                        <use href="#i-team" />
                      </svg>
                    </span>
                    Para tu equipo
                  </h3>
                  <FeatureList items={TEAM_FEATURES} />
                </div>
              </div>
            </div>
          </section>

          {/* PLANES */}
          <section className="section eo-alt" id="planes">
            <div className="wrap">
              <div className="section-head center reveal">
                <p className="eyebrow">Planes</p>
                <h2>Precio fijo al mes. Sin comisión por pedido.</h2>
                <p className="lead">
                  Elige el plan según tu local y añade complementos cuando los necesites. Te
                  explicamos las condiciones en la demo.
                </p>
              </div>
              <div className="eo-plans">
                {PLANS.map((p) => (
                  <article
                    className={`eo-plan reveal${p.featured ? " featured" : ""}`}
                    key={p.name}
                  >
                    <p className="eo-plan-name">Plan {p.name}</p>
                    <p className="eo-plan-sum">{p.summary}</p>
                    {p.intro ? <p className="eo-plan-intro">{p.intro}</p> : null}
                    <ul>
                      {p.items.map((it) => (
                        <li key={it.name}>
                          <svg aria-hidden="true">
                            <use href="#i-check" />
                          </svg>
                          <span>
                            {it.name}
                            {it.soon ? <Soon /> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <a
                      className={p.featured ? "btn btn-primary" : "btn btn-ghost"}
                      href={DEMO_HREF}
                    >
                      Pedir información
                    </a>
                  </article>
                ))}
                <article className="eo-plan eo-addons reveal">
                  <p className="eo-plan-name">Complementos</p>
                  <p className="eo-plan-sum">Se contratan aparte, con cualquier plan.</p>
                  <FeatureList items={ADD_ONS} />
                  <a className="btn btn-light" href={sectionHref("ia", false)}>
                    Ver el agente de WhatsApp
                  </a>
                </article>
              </div>
            </div>
          </section>

          {/* ACCESO */}
          <section aria-label="Acceso al panel" className="eo-cta">
            <div className="wrap cta-band reveal">
              <div>
                <h2>¿Ya trabajas con EasyOrder?</h2>
                <p>Entra en el panel de tu restaurante para ver pedidos, carta y ajustes.</p>
              </div>
              <PanelButton className="btn btn-light" />
            </div>
          </section>
        </main>

        <SiteFooter onHome={false} />
      </div>
    </>
  );
}
