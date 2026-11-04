"use client";
/**
 * Landing de Konnecttia (EasyOrder). Generada desde konnecttia-landing.html.
 * Estilos: ./konnecttia.css (todo bajo .kt). Recursos: /public/konnecttia/*
 * Fuentes: Bricolage Grotesque + Manrope (ver app/(marketing)/layout.tsx).
 */
import { type FormEvent, useRef, useState } from "react";
import { IconSprite } from "./icons";
import { ROUTE } from "./links";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { useReveal } from "./useReveal";
import "./konnecttia.css";

type LeadResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** Envía la solicitud de demo a /api/demo, que la valida y la reenvía por correo. */
async function sendLead(data: Record<string, FormDataEntryValue>): Promise<LeadResult> {
  const response = await fetch("/api/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: data.nombre,
      restaurante: data.restaurante,
      ubicacion: data.ubicacion ?? "",
      contacto: data.contacto,
      mensaje: data.mensaje ?? "",
      consentimiento: data.consentimiento === "on",
      website: data.website ?? "",
    }),
  });
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return {
    ok: false,
    message: body.error ?? "No hemos podido enviar tu solicitud. Inténtalo de nuevo.",
  };
}

export default function KonnecttiaLanding() {
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.checkValidity()) {
      const first = f.querySelector<HTMLInputElement>(":invalid");
      first?.focus();
      setNote({
        error: true,
        text:
          first?.type === "checkbox"
            ? "Necesitamos tu consentimiento para poder responderte."
            : "Revisa los campos obligatorios, por favor.",
      });
      return;
    }
    try {
      const result = await sendLead(Object.fromEntries(new FormData(f)));
      if (!result.ok) {
        setNote({ error: true, text: result.message });
        return;
      }
      setNote({ text: "¡Gracias! Te escribiremos muy pronto." });
      f.reset();
    } catch {
      setNote({ error: true, text: "No hemos podido enviar tu solicitud. Inténtalo de nuevo." });
    }
  }

  return (
    <>
      <IconSprite />
      <div className="kt" id="konnecttia" ref={root}>
        <a className="skip" href="#contenido">
          Saltar al contenido
        </a>

        <SiteHeader onHome />

        <main id="contenido">
          {/* HERO */}
          <section className="hero">
            <div className="wrap hero-grid">
              <div className="reveal">
                <p className="eyebrow">EasyOrder · Pedidos online para restaurantes</p>
                <h1>
                  Tus pedidos, en tu canal. <span className="tt">Y nosotros, a tu lado.</span>
                </h1>
                <p className="lead">
                  Carta online y pedidos para recogida o reparto propio, con la marca de tu
                  restaurante y <strong>sin comisión por pedido</strong>. Te acompañamos desde el
                  primer día.
                </p>
                <div className="actions">
                  <a className="btn btn-primary" href="#contacto">
                    Quiero ver una demo{" "}
                    <svg aria-hidden="true">
                      <use href="#i-arrow" />
                    </svg>
                  </a>
                  <a className="btn btn-ghost" href="#como-funciona">
                    Cómo funciona
                  </a>
                </div>
                <ul className="proof">
                  <li>
                    <svg aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    Sin comisión por pedido
                  </li>
                  <li>
                    <svg aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    Con tu marca
                  </li>
                  <li>
                    <svg aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    Hecho en Canarias
                  </li>
                </ul>
              </div>
              <figure className="hero-visual reveal" aria-label="Ejemplo de EasyOrder en uso">
                <div className="hero-photo">
                  <img
                    src="/konnecttia/img/hero.jpg"
                    alt="Dos personas de un restaurante revisan juntas los pedidos en una tableta, en el mostrador"
                    width="1400"
                    height="933"
                    fetchPriority="high"
                  />
                </div>
                <div className="float float-order" aria-hidden="true">
                  <div className="row">
                    <strong>Pedido #0128</strong>
                    <span className="chip chip-new">
                      <i className="dot"></i>Nuevo
                    </span>
                  </div>
                  <p className="meta">Recogida · hoy 20:15</p>
                  <ul>
                    <li>
                      <span>2× Pizza margarita</span>
                      <span>18,00 €</span>
                    </li>
                    <li>
                      <span>1× Agua 1,5 l</span>
                      <span>1,80 €</span>
                    </li>
                  </ul>
                </div>
                <div className="float float-chat" aria-hidden="true">
                  <div className="who">
                    <img src="/konnecttia/brand/konnecttia-simbolo.svg" alt="" />
                    Agente de WhatsApp
                  </div>
                  <div className="bubble in">¿Me preparáis dos margaritas para las 20:15?</div>
                  <div className="bubble out">
                    ¡Claro! Pedido #0128 confirmado para recoger a las 20:15.
                  </div>
                </div>
              </figure>
            </div>
          </section>

          {/* VALORES */}
          <section className="values" aria-label="Lo que te llevas">
            <ul className="wrap">
              <li>
                <span className="ico">
                  <svg aria-hidden="true">
                    <use href="#i-store" />
                  </svg>
                </span>
                Tu marca en la carta
              </li>
              <li>
                <span className="ico c">
                  <svg aria-hidden="true">
                    <use href="#i-percent" />
                  </svg>
                </span>
                Sin comisión por pedido
              </li>
              <li>
                <span className="ico">
                  <svg aria-hidden="true">
                    <use href="#i-bag" />
                  </svg>
                </span>
                Recogida y reparto propio
              </li>
              <li>
                <span className="ico c">
                  <svg aria-hidden="true">
                    <use href="#i-hug" />
                  </svg>
                </span>
                Acompañamiento cercano
              </li>
            </ul>
          </section>

          {/* EASYORDER */}
          <section className="section" id="easyorder">
            <div className="wrap">
              <div className="product-top">
                <div className="reveal">
                  <p className="eyebrow">EasyOrder · nuestro primer producto</p>
                  <h2>Un canal propio para los pedidos de tu restaurante.</h2>
                </div>
                <p className="lead reveal">
                  Tu cliente consulta la carta y pide para recoger o para recibir con el reparto del
                  propio local. Tu equipo lo gestiona todo desde un panel.{" "}
                  <strong>Precio fijo, sin comisión por pedido.</strong>
                </p>
              </div>
              <div className="cards">
                <article className="card reveal">
                  <span className="ico">
                    <svg aria-hidden="true">
                      <use href="#i-menu" />
                    </svg>
                  </span>
                  <h3>Tu carta, con tu marca</h3>
                  <p>
                    Colores, logotipo y fotos de tus platos. Tu cliente sabe que está pidiendo en tu
                    casa.
                  </p>
                </article>
                <article className="card reveal">
                  <span className="ico c">
                    <svg aria-hidden="true">
                      <use href="#i-bag" />
                    </svg>
                  </span>
                  <h3>Recogida o reparto</h3>
                  <p>
                    Tu cliente elige entre las opciones que ofrece tu negocio, con tu propio
                    reparto.
                  </p>
                </article>
                <article className="card reveal">
                  <span className="ico">
                    <svg aria-hidden="true">
                      <use href="#i-bell" />
                    </svg>
                  </span>
                  <h3>Pedidos al instante</h3>
                  <p>
                    Cada pedido entra en el panel con aviso sonoro, y avanza de “recibido” a
                    “entregado”.
                  </p>
                </article>
                <article className="card reveal">
                  <span className="ico c">
                    <svg aria-hidden="true">
                      <use href="#i-pin" />
                    </svg>
                  </span>
                  <h3>Horarios y zonas</h3>
                  <p>
                    Defines cuándo abres y hasta dónde repartes. El servicio se adapta a tu local.
                  </p>
                </article>
                <article className="card reveal">
                  <span className="ico">
                    <svg aria-hidden="true">
                      <use href="#i-team" />
                    </svg>
                  </span>
                  <h3>Tu equipo, con su acceso</h3>
                  <p>
                    Invita a quien trabaja contigo para que cada persona gestione lo que le toca.
                  </p>
                </article>
                <article className="card reveal">
                  <span className="ico c">
                    <svg aria-hidden="true">
                      <use href="#i-chart" />
                    </svg>
                  </span>
                  <h3>Métricas de tu negocio</h3>
                  <p>
                    Consulta cuántos pedidos recibes y cómo evoluciona la actividad de tu canal.
                  </p>
                </article>
              </div>
              <p className="product-more reveal">
                <a className="btn btn-ghost" href={ROUTE.EasyOrder}>
                  Ver EasyOrder: funciones y planes{" "}
                  <svg aria-hidden="true">
                    <use href="#i-arrow" />
                  </svg>
                </a>
              </p>
            </div>
          </section>

          {/* IA + WHATSAPP */}
          <section className="section ai" id="ia">
            <div className="wrap ai-grid">
              <div className="reveal">
                <p className="eyebrow">La “ia” de Konnecttia</p>
                <h2>Un agente de WhatsApp que atiende y toma pedidos por ti.</h2>
                <p className="lead" style={{ marginTop: 18 }}>
                  Usamos inteligencia artificial donde suma de verdad: en el canal donde ya te
                  escriben tus clientes. El agente conoce tu carta y tus horarios, y deja el pedido
                  listo en tu panel.
                </p>
                <span className="badge-opt">
                  <i></i>Complemento opcional · se activa cuando lo necesites
                </span>
                <ol className="flow">
                  <li>
                    <div>
                      <h3>Tu cliente escribe por WhatsApp</h3>
                      <p>A tu número de siempre, a cualquier hora.</p>
                    </div>
                  </li>
                  <li>
                    <div>
                      <h3>El agente responde con tu carta</h3>
                      <p>Precios, horarios y opciones de recogida o reparto.</p>
                    </div>
                  </li>
                  <li>
                    <div>
                      <h3>El pedido llega a tu panel</h3>
                      <p>Igual que un pedido web: lo ves, lo preparas, lo entregas.</p>
                    </div>
                  </li>
                  <li>
                    <div>
                      <h3>Si hace falta, te lo pasa a ti</h3>
                      <p>Ante cualquier duda, una persona de tu equipo toma la conversación.</p>
                    </div>
                  </li>
                </ol>
              </div>
              <div className="reveal" aria-hidden="true">
                <div className="phone">
                  <div className="screen">
                    <div className="screen-top">
                      <span className="av">
                        <img src="/konnecttia/brand/konnecttia-simbolo.svg" alt="" />
                      </span>
                      <div>
                        <b>Pizzería La Isla</b>
                        <small>Asistente · en línea</small>
                      </div>
                    </div>
                    <div className="msgs">
                      <div className="msg c">
                        Hola, ¿tenéis abierto esta noche?<time>19:42</time>
                      </div>
                      <div className="msg a">
                        ¡Hola! Sí, hoy abrimos hasta las 23:30. ¿Quieres recoger o que te lo
                        llevemos?<time>19:42</time>
                      </div>
                      <div className="msg c">
                        Recoger. Dos margaritas para las 20:15<time>19:43</time>
                      </div>
                      <div className="msg a">
                        Perfecto, te lo resumo:
                        <div className="pill">
                          <span>2× Pizza margarita</span>
                          <span>18,00 €</span>
                        </div>
                        <div className="pill">
                          <span>Recogida</span>
                          <span>20:15</span>
                        </div>
                        ¿Lo confirmo?<time>19:43</time>
                      </div>
                      <div className="msg c">
                        Sí, gracias<time>19:43</time>
                      </div>
                      <div className="msg sys">Pedido #0128 enviado al panel</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CÓMO FUNCIONA */}
          <section className="section" id="como-funciona">
            <div className="wrap">
              <div className="section-head center reveal">
                <p className="eyebrow">Así lo ponemos en marcha</p>
                <h2>Lo hacemos contigo, paso a paso.</h2>
                <p className="lead">
                  Primero entendemos cómo trabaja tu local. Después preparamos EasyOrder con tu
                  carta y te acompañamos mientras tu equipo lo usa.
                </p>
              </div>
              <ol className="steps">
                <li className="step reveal">
                  <p className="n">
                    <span>1</span>HABLAMOS
                  </p>
                  <h3>Conocemos tu forma de trabajar</h3>
                  <p>
                    Nos cuentas cómo recibes hoy los pedidos y qué necesita tu equipo en el día a
                    día.
                  </p>
                </li>
                <li className="step reveal">
                  <p className="n">
                    <span>2</span>PREPARAMOS
                  </p>
                  <h3>Cargamos tu carta</h3>
                  <p>Nos encargamos contigo de la carta, los horarios y las zonas de reparto.</p>
                </li>
                <li className="step reveal">
                  <p className="n">
                    <span>3</span>TE ACOMPAÑAMOS
                  </p>
                  <h3>Tu equipo lo domina</h3>
                  <p>Te enseñamos a gestionar los pedidos y seguimos cerca cuando nos necesites.</p>
                </li>
              </ol>
            </div>
          </section>

          {/* LA MARCA */}
          <section className="section story" id="marca">
            <div className="wrap story-grid">
              <div className="story-mark reveal">
                <img
                  src="/konnecttia/brand/konnecttia-simbolo.svg"
                  alt="Símbolo de Konnecttia: dos figuras con forma de T que se abrazan"
                />
              </div>
              <div className="reveal">
                <p className="eyebrow">Por qué konnecTTia</p>
                <h2>Un nombre que dice cómo trabajamos.</h2>
                <p className="lead" style={{ marginTop: 18 }}>
                  No queremos ser un proveedor más de tu negocio. Queremos ser tu aliado: el que
                  está cerca, entiende tu día a día y pone la tecnología a tu servicio.
                </p>
                <ul className="parts">
                  <li>
                    <b className="p1">konnec</b>
                    <div>
                      <h3>Conectados</h3>
                      <p>
                        Tu restaurante, tus clientes y tu equipo, en un mismo canal que es tuyo.
                      </p>
                    </div>
                  </li>
                  <li>
                    <b className="p2">
                      T<span>T</span>
                    </b>
                    <div>
                      <h3>Juntos, como dos personas abrazadas</h3>
                      <p>La doble T es nuestro símbolo: tú y nosotros, uno al lado del otro.</p>
                    </div>
                  </li>
                  <li>
                    <b className="p3">ia</b>
                    <div>
                      <h3>Inteligencia artificial que suma</h3>
                      <p>
                        La usamos para quitarte trabajo, como el agente que toma pedidos por
                        WhatsApp.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* NOSOTROS */}
          <section className="section about" id="nosotros">
            <div className="wrap about-grid">
              <div className="about-photo reveal">
                <img
                  src="/konnecttia/img/equipo.jpg"
                  alt="Dos personas de un negocio local conversan junto a una tableta en su cafetería"
                  width="1400"
                  height="1050"
                  loading="lazy"
                />
              </div>
              <div className="reveal">
                <p className="eyebrow">Tecnología cercana, personas primero</p>
                <h2>Hecho para negocios de aquí.</h2>
                <p className="lead">
                  Konnecttia crea herramientas digitales sencillas para que los negocios locales de
                  Canarias atiendan y vendan por sus propios canales, sin ceder su marca a una
                  plataforma de reparto.
                </p>
                <ul className="motto">
                  <li>Cercana</li>
                  <li>Sencilla</li>
                  <li>Fiable</li>
                </ul>
                <p className="more">
                  <strong>Empezamos por los restaurantes con EasyOrder.</strong> Después vendrán más
                  soluciones para negocios locales.
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <section aria-label="Solicitar una demo">
            <div className="wrap cta-band reveal">
              <div>
                <h2>¿Vemos EasyOrder con la carta de tu restaurante?</h2>
                <p>Una conversación sin compromiso para conocer tu local y resolver tus dudas.</p>
              </div>
              <a className="btn btn-light" href="#contacto">
                Solicitar una demo{" "}
                <svg aria-hidden="true">
                  <use href="#i-arrow" />
                </svg>
              </a>
            </div>
          </section>

          {/* FAQ */}
          <section className="section" id="preguntas">
            <div className="wrap faq-box">
              <div className="section-head center reveal">
                <p className="eyebrow">Preguntas frecuentes</p>
                <h2>Lo importante, explicado claro.</h2>
              </div>
              <details>
                <summary>
                  ¿EasyOrder es una app de reparto?
                  <span className="pm">
                    <svg aria-hidden="true">
                      <use href="#i-plus" />
                    </svg>
                  </span>
                </summary>
                <p>
                  No. Es un canal de pedidos online para tu restaurante. Konnecttia no ofrece
                  repartidores: el reparto, si tu local lo ofrece, lo gestiona tu propio negocio.
                </p>
              </details>
              <details>
                <summary>
                  ¿Se paga comisión por pedido?
                  <span className="pm">
                    <svg aria-hidden="true">
                      <use href="#i-plus" />
                    </svg>
                  </span>
                </summary>
                <p>
                  No. EasyOrder funciona con un precio fijo, sin comisión por pedido. En la demo te
                  contamos las condiciones vigentes.
                </p>
              </details>
              <details>
                <summary>
                  ¿Tengo que usar inteligencia artificial?
                  <span className="pm">
                    <svg aria-hidden="true">
                      <use href="#i-plus" />
                    </svg>
                  </span>
                </summary>
                <p>
                  No. EasyOrder es útil por sí mismo, sin IA. El agente de WhatsApp es un
                  complemento opcional que puedes activar cuando tu negocio lo necesite.
                </p>
              </details>
              <details>
                <summary>
                  ¿Cómo funciona el agente de WhatsApp?
                  <span className="pm">
                    <svg aria-hidden="true">
                      <use href="#i-plus" />
                    </svg>
                  </span>
                </summary>
                <p>
                  Responde a tus clientes con la información de tu carta y tus horarios, toma el
                  pedido y lo deja en tu panel. Cuando una conversación lo requiere, la pasa a una
                  persona de tu equipo.
                </p>
              </details>
              <details>
                <summary>
                  ¿EasyOrder garantiza más ventas?
                  <span className="pm">
                    <svg aria-hidden="true">
                      <use href="#i-plus" />
                    </svg>
                  </span>
                </summary>
                <p>
                  No. EasyOrder te da un canal propio de pedidos; no garantiza ventas ni tráfico. Lo
                  que sí te garantizamos es acompañarte para sacarle partido.
                </p>
              </details>
            </div>
          </section>

          {/* CONTACTO */}
          <section className="section contact" id="contacto" style={{ paddingTop: "0" }}>
            <div className="wrap contact-grid">
              <div className="reveal">
                <p className="eyebrow">Empecemos por conocernos</p>
                <h2>Cuéntanos de tu restaurante.</h2>
                <p className="lead">
                  Te enseñamos EasyOrder y vemos juntos si encaja con tu forma de trabajar.
                </p>
                <ul className="assure">
                  <li>
                    <svg aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    Una primera conversación para conocer tu local
                  </li>
                  <li>
                    <svg aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    Sin compromiso
                  </li>
                  <li>
                    <svg aria-hidden="true">
                      <use href="#i-check" />
                    </svg>
                    Te atiende una persona del equipo
                  </li>
                </ul>
              </div>
              <form
                className="form reveal"
                aria-label="Solicitud de demo de EasyOrder"
                noValidate
                onSubmit={onSubmit}
              >
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="f-nombre">Tu nombre</label>
                    <input
                      id="f-nombre"
                      name="nombre"
                      type="text"
                      autoComplete="name"
                      placeholder="Cómo te llamas"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="f-rest">Restaurante</label>
                    <input
                      id="f-rest"
                      name="restaurante"
                      type="text"
                      autoComplete="organization"
                      placeholder="Nombre del local"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="f-ubic">
                      Municipio o isla <span className="opt">(opcional)</span>
                    </label>
                    <input
                      id="f-ubic"
                      name="ubicacion"
                      type="text"
                      placeholder="Por ejemplo, Arrecife"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="f-cont">Teléfono o correo</label>
                    <input
                      id="f-cont"
                      name="contacto"
                      type="text"
                      autoComplete="email"
                      placeholder="¿Cómo te contactamos?"
                      required
                    />
                  </div>
                  <div className="field wide">
                    <label htmlFor="f-msg">
                      ¿Qué te gustaría mejorar? <span className="opt">(opcional)</span>
                    </label>
                    <textarea
                      id="f-msg"
                      name="mensaje"
                      rows={4}
                      placeholder="Cuéntanos cómo recibes hoy los pedidos"
                    ></textarea>
                  </div>
                </div>
                <div className="hp" aria-hidden="true">
                  <label>
                    Web
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <label className="consent">
                  <input type="checkbox" name="consentimiento" required />
                  <span>
                    Acepto que Konnecttia use estos datos para responder a mi solicitud.{" "}
                    <a href="/privacidad">Política de privacidad</a>
                  </span>
                </label>
                <button className="btn btn-primary" type="submit">
                  Solicitar una demo{" "}
                  <svg aria-hidden="true">
                    <use href="#i-arrow" />
                  </svg>
                </button>
                <p
                  className="form-note"
                  role="status"
                  hidden={!note}
                  style={note?.error ? { color: "#B8432A" } : undefined}
                >
                  {note?.text}
                </p>
              </form>
            </div>
          </section>
        </main>

        <SiteFooter onHome />
      </div>
    </>
  );
}
