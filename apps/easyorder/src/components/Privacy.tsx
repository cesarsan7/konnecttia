import type { PrivacyInfo } from "@/lib/types";
import "./privacy.css";

/**
 * Página genérica de privacidad para los restaurantes que aún no tienen la suya.
 * El texto es una PLANTILLA pendiente de revisión legal: no sustituye a una política real
 * y no incluye datos fiscales (NIF, domicilio social) porque la base no los guarda.
 */
export function Privacy({ info }: { readonly info: PrivacyInfo }) {
  const { restaurante, locales } = info;
  const contacts = locales.filter((local) => local.direccion || local.telefono);
  return (
    <main className="shell privacy">
      <p className="privacy-draft" role="note">
        <strong>Plantilla pendiente de revisión legal.</strong> Este texto es un modelo base que aún
        no ha revisado un abogado. Los datos de identificación fiscal del restaurante (NIF y
        domicilio social) no constan en esta página y están pendientes de completar.
      </p>

      <h1 className="title">Política de privacidad</h1>
      <p className="muted small">
        {restaurante.nombre}
        {info.version ? ` · versión ${info.version}` : ""}
      </p>

      <section>
        <h2>Quién es el responsable</h2>
        <p>
          El responsable del tratamiento de tus datos es <strong>{restaurante.nombre}</strong>.
        </p>
        {restaurante.direccion || restaurante.telefono ? (
          <ul>
            {restaurante.direccion ? <li>Dirección: {restaurante.direccion}</li> : null}
            {restaurante.telefono ? <li>Teléfono: {restaurante.telefono}</li> : null}
          </ul>
        ) : null}
        {contacts.length > 0 ? (
          <>
            <p>Locales:</p>
            <ul>
              {contacts.map((local) => (
                <li key={`${local.nombre}-${local.direccion ?? ""}`}>
                  {local.nombre}
                  {local.direccion ? ` · ${local.direccion}` : ""}
                  {local.telefono ? ` · ${local.telefono}` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section>
        <h2>Quién trata los datos por su cuenta</h2>
        <p>
          Konnecttia presta al restaurante la plataforma de pedidos EasyOrder y actúa como{" "}
          <strong>encargado del tratamiento</strong>: trata tus datos solo siguiendo las
          instrucciones del restaurante y para los fines que se indican aquí.
        </p>
      </section>

      <section>
        <h2>Qué datos tratamos y para qué</h2>
        <ul>
          <li>
            Nombre, teléfono y, en pedidos a domicilio, dirección y ubicación aproximada, además de
            las notas y el contenido del pedido: para preparar, entregar y avisarte del estado de tu
            pedido.
          </li>
          <li>
            Si marcas la casilla de promociones, tu teléfono y nombre se usarán también para
            enviarte ofertas del restaurante. Es voluntario y puedes retirarlo en cualquier momento.
          </li>
        </ul>
      </section>

      <section>
        <h2>Por qué podemos tratarlos</h2>
        <p>
          Para gestionar tu pedido, porque es necesario para atenderlo. Para las promociones, porque
          tú das tu consentimiento al marcar la casilla.
        </p>
      </section>

      <section>
        <h2>Cuánto tiempo los conservamos</h2>
        <p>
          Mientras sea necesario para atender tu pedido y cumplir las obligaciones legales del
          restaurante. Si lo pides, el restaurante puede borrar tus datos personales; los importes y
          fechas de los pedidos se conservan sin identificarte.
        </p>
      </section>

      <section>
        <h2>Tus derechos</h2>
        <p>
          Puedes pedir al restaurante acceder a tus datos, rectificarlos, borrarlos, oponerte a su
          tratamiento, limitarlo o recibirlos en un formato portable, y retirar en cualquier momento
          el consentimiento de promociones. Escribe o llama a los contactos de arriba. Si crees que
          no se han respetado tus derechos, puedes reclamar ante la Agencia Española de Protección
          de Datos (aepd.es).
        </p>
      </section>
    </main>
  );
}
