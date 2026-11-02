import type { Metadata } from "next";
import { LegalPage, Pending } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad", robots: { index: false } };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="1 de noviembre de 2026">
      <h2>Responsable</h2>
      <p>
        <Pending>razón social, NIF, domicilio y correo del responsable</Pending>.
      </p>
      <h2>Qué datos tratamos y para qué</h2>
      <p>
        Cuando solicitas una demo tratamos tu nombre, el nombre de tu negocio, el municipio, tu
        teléfono o correo y el mensaje que nos escribas, con la única finalidad de responder a tu
        solicitud y preparar la demostración.
      </p>
      <h2>Base jurídica</h2>
      <p>
        Tu solicitud y la aplicación de medidas precontractuales a petición tuya (artículo 6.1.b del
        RGPD). No te enviaremos comunicaciones comerciales sin tu consentimiento expreso.
      </p>
      <h2>Conservación</h2>
      <p>
        Conservamos los datos mientras gestionamos tu solicitud y, como máximo,{" "}
        <Pending>plazo de conservación</Pending> después, salvo que pases a ser cliente.
      </p>
      <h2>Destinatarios</h2>
      <p>
        No cedemos tus datos a terceros. Usamos proveedores que actúan como encargados del
        tratamiento, como el servicio de envío de correo y el de alojamiento:{" "}
        <Pending>lista de proveedores y, si los hay, transferencias fuera del EEE</Pending>.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y
        portabilidad escribiendo a <Pending>correo de privacidad</Pending>. También puedes reclamar
        ante la Agencia Española de Protección de Datos (aepd.es).
      </p>
    </LegalPage>
  );
}
