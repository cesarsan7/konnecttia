import "./help-note.css";

/** Un parámetro explicado: para qué sirve, cómo funciona y un ejemplo o escenario. */
export type HelpItem = {
  readonly campo: string;
  /** Para qué sirve y por qué existe. */
  readonly para: string;
  /** Cómo funciona (qué pasa al cambiarlo). */
  readonly como: string;
  readonly ejemplo?: string;
  /** Qué vigilar: efecto colateral o error típico. */
  readonly cuidado?: string;
};

/**
 * Ayuda plegable «¿Qué significa cada ajuste?» para quien configura: cada parámetro con su
 * para qué, cómo funciona, un ejemplo y qué vigilar. Cerrada por defecto para no ocupar pantalla.
 */
export function HelpNote({
  items,
  summary = "¿Qué significa cada ajuste?",
}: {
  readonly items: readonly HelpItem[];
  readonly summary?: string;
}) {
  if (items.length === 0) return null;
  return (
    <details className="k-helpnote">
      <summary>{summary}</summary>
      <dl>
        {items.map((item) => (
          <div key={item.campo} className="k-helpnote-item">
            <dt>{item.campo}</dt>
            <dd>
              <p>
                <strong>Para qué:</strong> {item.para}
              </p>
              <p>
                <strong>Cómo funciona:</strong> {item.como}
              </p>
              {item.ejemplo ? (
                <p>
                  <strong>Ejemplo:</strong> {item.ejemplo}
                </p>
              ) : null}
              {item.cuidado ? (
                <p className="k-helpnote-care">
                  <strong>Ojo:</strong> {item.cuidado}
                </p>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
