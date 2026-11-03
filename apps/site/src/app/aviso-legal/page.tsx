import type { Metadata } from "next";
import { LegalPage, Pending } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Aviso legal", robots: { index: false } };

export default function AvisoLegalPage() {
  return (
    <LegalPage title="Aviso legal" updated="1 de noviembre de 2026">
      <h2>Titular del sitio</h2>
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002 de servicios de la sociedad de la
        información (LSSI), se informa de los datos del titular de konnecttia.com:
      </p>
      <ul>
        <li>
          Titular: <Pending>razón social o nombre del titular</Pending>
        </li>
        <li>
          NIF: <Pending>NIF</Pending>
        </li>
        <li>
          Domicilio: <Pending>domicilio en Canarias</Pending>
        </li>
        <li>
          Correo de contacto: <Pending>correo</Pending>
        </li>
        <li>
          Datos registrales, si los hay: <Pending>Registro Mercantil u otros</Pending>
        </li>
      </ul>
      <h2>Objeto</h2>
      <p>
        Este sitio presenta los productos de Konnecttia, como EasyOrder, y permite solicitar una
        demostración. No se venden productos ni se contratan servicios desde esta página.
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        Los textos, el logotipo y el diseño de este sitio pertenecen a su titular. Las marcas de
        terceros que puedan aparecer pertenecen a sus respectivos titulares.
      </p>
    </LegalPage>
  );
}
