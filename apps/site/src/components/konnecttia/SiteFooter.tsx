import { ROUTE, sectionHref } from "./links";

type SiteFooterProps = {
  /** true en la portada: los enlaces a secciones son anclas de la misma página. */
  readonly onHome: boolean;
};

/** Pie común de konnecttia.com (portada y páginas de producto). */
export function SiteFooter({ onHome }: SiteFooterProps) {
  const to = (id: string) => sectionHref(id, onHome);
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="foot-top">
          <div>
            <img
              src="/konnecttia/brand/konnecttia-logo-negativo.svg"
              alt="Konnecttia"
              width="176"
              height="34"
            />
            <p>
              Tu aliado digital en Canarias. Conectamos negocios locales con sus clientes, con
              tecnología cercana e inteligencia artificial que suma.
            </p>
          </div>
          <div>
            <h3>Soluciones</h3>
            <ul>
              <li>
                <a href={ROUTE.EasyOrder}>EasyOrder</a>
              </li>
              <li>
                <a href={ROUTE.PanelAccess}>EasyOrder · Acceso restaurantes</a>
              </li>
              <li>
                <a href={to("ia")}>Agente de WhatsApp</a>
              </li>
              <li>
                Webs para negocios <span className="soon">Pronto</span>
              </li>
            </ul>
          </div>
          <div>
            <h3>Konnecttia</h3>
            <ul>
              <li>
                <a href={to("marca")}>Quiénes somos</a>
              </li>
              <li>
                <a href={to("como-funciona")}>Cómo funciona</a>
              </li>
              <li>
                <a href={to("preguntas")}>Preguntas</a>
              </li>
              <li>
                <a href={to("contacto")}>Contacto</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© Konnecttia · Canarias</span>
          <nav aria-label="Legal">
            <a href="/aviso-legal">Aviso legal</a>
            <a href="/privacidad">Privacidad</a>
            <a href="/cookies">Cookies</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
