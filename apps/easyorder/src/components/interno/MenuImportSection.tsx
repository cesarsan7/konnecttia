"use client";

import { useState } from "react";
import { menuImportMessage } from "@/lib/interno/logic";
import type { MenuImportSummary, RestaurantDetail } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./menu-import.css";
import { HelpNote } from "@/components/HelpNote";
import { INTERNO_HELP } from "@/lib/interno/help";

const EXAMPLE = `categoria;producto;descripcion;variante;precio
Arepas;Arepa frita;Maíz cocido, asado y frito;;3,00
Salchipapas;Salchipapas;Con salchicha;Mini;4,50
Salchipapas;Salchipapas;;XL;10,00`;

type Props = { readonly detail: RestaurantDetail; readonly onChanged: () => void };

/** Importa la carta de un restaurante que aún no tiene ninguna, desde texto tabulado. */
export function MenuImportSection({ detail, onChanged }: Props) {
  const { api, canWrite } = usePlatform();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [checked, setChecked] = useState<MenuImportSummary | null>(null);
  const [done, setDone] = useState<MenuImportSummary | null>(null);
  const hasMenu = detail.carta.productos > 0;

  async function run(simulate: boolean) {
    setBusy(true);
    setProblems([]);
    setDone(null);
    const result = await api.importMenu(detail.restaurante.id, text, simulate);
    setBusy(false);
    if (!result.ok) {
      setChecked(null);
      setProblems(menuImportMessage(result.status, result.body));
      return;
    }
    if (simulate) {
      setChecked(result.data);
      return;
    }
    setChecked(null);
    setDone(result.data);
    setText("");
    onChanged();
  }

  return (
    <section className="k-card k-rd-section k-mi" aria-labelledby="rd-carta">
      <h2 id="rd-carta" className="k-title">
        Carta
      </h2>
      <HelpNote items={INTERNO_HELP.importar} />
      {hasMenu ? (
        <p className="k-muted">
          {detail.carta.productos} productos en {detail.carta.categorias} categorías. La carta se
          edita desde el panel del restaurante; aquí solo se carga la primera vez.
        </p>
      ) : (
        <>
          <p className="k-muted k-small">
            Pega la carta desde una hoja de cálculo o escríbela con punto y coma. Una fila por
            variante: categoría; producto; descripción; variante; precio. Sin variante, «Única».
            Primero puedes comprobarla sin guardar.
          </p>
          <textarea
            className="k-mi-text"
            rows={10}
            spellCheck={false}
            value={text}
            placeholder={EXAMPLE}
            disabled={!canWrite || busy}
            onChange={(event) => {
              setText(event.target.value);
              setChecked(null);
            }}
            aria-label="Carta en texto"
          />
          {problems.length > 0 ? (
            <ul className="k-alert k-mi-problems" role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {checked ? (
            <p className="k-mi-ok" role="status">
              Todo correcto: {checked.productos} productos en {checked.categorias} categorías, con{" "}
              {checked.precios} precios. Aún no se ha guardado nada.
            </p>
          ) : null}
          {canWrite ? (
            <div className="k-mi-actions">
              <button
                type="button"
                className="k-btn k-btn-secondary"
                disabled={busy || !text.trim()}
                onClick={() => void run(true)}
              >
                Comprobar
              </button>
              <button
                type="button"
                className="k-btn k-btn-primary"
                disabled={busy || !checked}
                onClick={() => void run(false)}
              >
                {busy ? "Importando…" : "Importar carta"}
              </button>
            </div>
          ) : (
            <p className="k-muted k-small">Tu rol es de consulta: no puedes importar cartas.</p>
          )}
        </>
      )}
      {done ? (
        <p className="k-mi-ok" role="status">
          Carta importada: {done.productos} productos en {done.categorias} categorías.
        </p>
      ) : null}
    </section>
  );
}
