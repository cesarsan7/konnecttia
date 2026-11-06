"use client";

import { type FormEvent, useEffect, useState } from "react";
import { euros } from "@/lib/format";
import { personLabel, type TeamMember } from "@/lib/panel/team";
import type { Waiter, WaiterList } from "@/lib/panel/waiters";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";

type Draft = {
  readonly id: number | null;
  readonly nombre: string;
  readonly sucursal: string;
  readonly membership: string;
  readonly activo: boolean;
};

const EMPTY: Draft = { id: null, nombre: "", sucursal: "", membership: "", activo: true };

/**
 * Mesas → Meseros: alta, cambios y baja. Cada mesero es de un local y puede estar enlazado a un
 * miembro del equipo (entonces se asigna solo cuando ese miembro toma un pedido en ese local).
 */
export function WaitersDialog(props: {
  readonly list: WaiterList | null;
  readonly branches: readonly { readonly id: number; readonly nombre: string }[];
  readonly onClose: () => void;
  readonly onChanged: (message: string) => void;
}) {
  const { api } = usePanel();
  const { slug, can } = useAccess();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [members, setMembers] = useState<readonly TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(props.branches.map((branch) => [branch.id, branch.nombre]));

  useEffect(() => {
    if (!can(PERMISSION.TeamView)) return;
    void api.team(slug).then((result) => {
      if (result.ok) setMembers(result.data.miembros);
    });
  }, [api, slug, can]);

  function edit(waiter: Waiter) {
    setError(null);
    setDraft({
      id: waiter.id,
      nombre: waiter.nombre,
      sucursal: waiter.sucursal_id === null ? "" : String(waiter.sucursal_id),
      membership: waiter.membership_id === null ? "" : String(waiter.membership_id),
      activo: waiter.activo,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.nombre.trim()) return setError("Escribe el nombre del mesero.");
    if (!draft.sucursal) return setError("Elige el local del mesero.");
    const body = {
      nombre: draft.nombre.trim(),
      sucursal_id: Number(draft.sucursal),
      membership_id: draft.membership ? Number(draft.membership) : null,
      activo: draft.activo,
    };
    const result =
      draft.id === null
        ? await api.tableChange(slug, "POST", "/meseros", body)
        : await api.tableChange(slug, "PUT", `/meseros/${draft.id}`, body);
    if (!result.ok) {
      const reason = (result.body as { reason?: string } | null)?.reason;
      return setError(
        reason === "member_taken"
          ? "Ese miembro del equipo ya es mesero en este local."
          : "No se pudo guardar. Revisa los datos.",
      );
    }
    setDraft(null);
    props.onChanged(draft.id === null ? "Mesero añadido" : "Mesero guardado");
  }

  async function remove(waiter: Waiter) {
    const result = await api.tableChange(slug, "DELETE", `/meseros/${waiter.id}`);
    if (!result.ok) return setError("No se pudo quitar el mesero.");
    const deactivated = (result.data as { desactivado?: boolean }).desactivado;
    props.onChanged(
      deactivated ? `${waiter.nombre} desactivado (tiene pedidos)` : `${waiter.nombre} borrado`,
    );
  }

  const list = props.list?.meseros ?? [];

  return (
    <Modal title="Meseros" onClose={props.onClose} wide>
      <div className="k-editor">
        <p className="k-muted k-small">
          Al tomar un pedido en mesa se elige quién atiende. Si enlazas un mesero con su usuario del
          panel, sus pedidos se le asignan solos. Pedidos e importe de hoy, para repartir propinas.
        </p>
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        {list.length === 0 ? <p className="k-muted">Aún no hay meseros.</p> : null}
        <ul className="k-items">
          {list.map((waiter) => (
            <li key={waiter.id} className={`k-item${waiter.activo ? "" : " is-off"}`}>
              <span className="k-item-main">
                <span className="k-item-name">
                  <strong>{waiter.nombre}</strong>
                  {waiter.activo ? null : <span className="k-chip">Inactivo</span>}
                </span>
                <span className="k-small k-muted">
                  {waiter.sucursal_id === null
                    ? "Todos los locales"
                    : (names.get(waiter.sucursal_id) ?? "Otro local")}
                  {waiter.nombre_mostrar || waiter.email
                    ? ` · ${personLabel({ name: waiter.nombre_mostrar, email: waiter.email }, "")}`
                    : ""}
                </span>
                <span className="k-small">
                  Hoy: {waiter.pedidos_hoy} {waiter.pedidos_hoy === 1 ? "pedido" : "pedidos"} ·{" "}
                  {euros(waiter.importe_hoy)}
                </span>
              </span>
              <span className="k-item-tools">
                <button
                  type="button"
                  className="k-btn k-btn-secondary k-btn-sm"
                  onClick={() => edit(waiter)}
                >
                  Editar
                </button>
                {waiter.activo ? (
                  <button
                    type="button"
                    className="k-link k-link-danger k-small"
                    onClick={() => void remove(waiter)}
                  >
                    Quitar
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>

        {draft ? (
          <form onSubmit={save} noValidate className="k-card k-editor">
            <h3 className="k-subtitle">{draft.id === null ? "Nuevo mesero" : "Editar mesero"}</h3>
            <div className="k-form-grid">
              <label className="k-field">
                <span>Nombre</span>
                <input
                  value={draft.nombre}
                  maxLength={100}
                  onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                />
              </label>
              <label className="k-field">
                <span>Local</span>
                <select
                  className="k-input"
                  value={draft.sucursal}
                  onChange={(e) => setDraft({ ...draft, sucursal: e.target.value })}
                >
                  {props.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.nombre}
                    </option>
                  ))}
                </select>
              </label>
              {members.length > 0 ? (
                <label className="k-field">
                  <span>
                    Usuario del panel <span className="k-muted k-optional">(opcional)</span>
                  </span>
                  <select
                    className="k-input"
                    value={draft.membership}
                    onChange={(e) => setDraft({ ...draft, membership: e.target.value })}
                  >
                    <option value="">Sin usuario</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {personLabel(
                          { name: member.mostrar, email: member.email },
                          `Miembro ${member.id}`,
                        )}
                        {member.roles.length > 0
                          ? ` · ${member.roles.map((role) => role.nombre).join(", ")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {draft.id !== null ? (
              <label className="k-check">
                <input
                  type="checkbox"
                  checked={draft.activo}
                  onChange={(e) => setDraft({ ...draft, activo: e.target.checked })}
                />
                <span>Activo</span>
              </label>
            ) : null}
            <div className="k-dialog-actions">
              <button
                type="button"
                className="k-btn k-btn-secondary"
                onClick={() => setDraft(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="k-btn k-btn-go">
                Guardar
              </button>
            </div>
          </form>
        ) : (
          <div className="k-dialog-actions">
            <button
              type="button"
              className="k-btn k-btn-primary"
              onClick={() => {
                setError(null);
                setDraft({
                  ...EMPTY,
                  sucursal: String(props.branches[0]?.id ?? ""),
                });
              }}
            >
              Añadir mesero
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
