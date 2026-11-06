"use client";

import "./roles.css";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { describePanelError } from "@/lib/panel/api";
import {
  type PermissionGroup,
  type RoleDetail,
  type RolesCatalog,
  roleErrorMessage,
  roleSummary,
} from "@/lib/panel/team";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";

/**
 * Equipo → Roles: plantillas de EasyOrder (solo lectura) y roles propios del restaurante
 * (crear, editar permisos por módulo, borrar). El servidor impide dar permisos que no se tienen.
 */
export function RolesSection({ onChanged }: { readonly onChanged: (message: string) => void }) {
  const { api } = usePanel();
  const { slug, can } = useAccess();
  const [data, setData] = useState<RolesCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleDetail | "new" | null>(null);
  const [viewing, setViewing] = useState<RoleDetail | null>(null);
  const canManage = can(PERMISSION.TeamManage);

  const load = useCallback(async () => {
    const result = await api.roles(slug);
    if (result.ok) setData(result.data);
    else setError(describePanelError(result.status, result.body));
  }, [api, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = new Map(
    (data?.catalogo ?? []).flatMap((group) =>
      group.permisos.map((permission) => [permission.code, permission.nombre] as const),
    ),
  );

  return (
    <section className="k-card k-cat" aria-labelledby="roles" data-tour="equipo-roles">
      <header className="k-cat-head">
        <h2 id="roles" className="k-title">
          Roles
        </h2>
        {canManage ? (
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            onClick={() => setEditing("new")}
          >
            Nuevo rol
          </button>
        ) : null}
      </header>
      {error ? <p className="k-alert">{error}</p> : null}
      {!data && !error ? <div className="k-skeleton" aria-busy="true" /> : null}
      {data ? (
        <ul className="k-items">
          {data.roles.map((role) => (
            <li key={role.id} className="k-item k-member">
              <span className="k-item-main">
                <span className="k-item-name">
                  <strong>{role.nombre}</strong>
                  <span className="k-chip">{role.plantilla ? "EasyOrder" : "Propio"}</span>
                </span>
                <span className="k-small k-muted">{roleSummary(role)}</span>
                <span className="k-small k-muted">
                  {role.miembros} {role.miembros === 1 ? "persona" : "personas"}
                  {role.invitaciones > 0 ? ` · ${role.invitaciones} invitaciones pendientes` : ""}
                </span>
              </span>
              <span className="k-item-tools">
                {role.editable ? (
                  <button
                    type="button"
                    className="k-btn k-btn-secondary k-btn-sm"
                    onClick={() => setEditing(role)}
                  >
                    Editar
                  </button>
                ) : (
                  <button type="button" className="k-link k-small" onClick={() => setViewing(role)}>
                    Ver permisos
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {viewing ? (
        <Modal title={viewing.nombre} onClose={() => setViewing(null)}>
          <p className="k-small k-muted">{roleSummary(viewing)}</p>
          <ul className="k-perm-list">
            {viewing.permisos.map((code) => (
              <li key={code}>{names.get(code) ?? code}</li>
            ))}
          </ul>
          {viewing.plantilla ? (
            <p className="k-small k-muted">
              Es un rol de EasyOrder y no se cambia. Si necesitas otra combinación, crea un rol
              propio.
            </p>
          ) : null}
        </Modal>
      ) : null}

      {editing && data ? (
        <RoleDialog
          role={editing === "new" ? null : editing}
          catalog={data.catalogo}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            onChanged(message);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function RoleDialog(props: {
  readonly role: RoleDetail | null;
  readonly catalog: readonly PermissionGroup[];
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const role = props.role;
  const [nombre, setNombre] = useState(role?.nombre ?? "");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(role?.permisos ?? []));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(code: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (nombre.trim().length < 2) return setError("Ponle un nombre al rol.");
    if (selected.size === 0) return setError("Elige al menos un permiso.");
    setBusy(true);
    const body = { nombre: nombre.trim(), permisos: [...selected] };
    const result = role
      ? await api.teamChange(slug, "PUT", `/roles/${role.id}`, body)
      : await api.teamChange(slug, "POST", "/roles", body);
    setBusy(false);
    if (!result.ok) {
      return setError(roleErrorMessage((result.body as { reason?: string } | null)?.reason));
    }
    props.onSaved(role ? "Rol guardado" : "Rol creado");
  }

  async function remove() {
    if (!role) return;
    setBusy(true);
    const result = await api.teamChange(slug, "DELETE", `/roles/${role.id}`);
    setBusy(false);
    if (!result.ok) {
      return setError(roleErrorMessage((result.body as { reason?: string } | null)?.reason));
    }
    props.onSaved("Rol borrado");
  }

  return (
    <Modal title={role ? `Editar ${role.nombre}` : "Nuevo rol"} onClose={props.onClose} wide>
      <form onSubmit={save} noValidate className="k-editor">
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        <label className="k-field">
          <span>Nombre</span>
          <input
            value={nombre}
            maxLength={60}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ej.: Cajero de noche"
          />
        </label>
        {role && role.miembros > 0 ? (
          <p className="k-small k-warn">
            Lo tienen {role.miembros} {role.miembros === 1 ? "persona" : "personas"}: los cambios se
            aplican al momento.
          </p>
        ) : null}
        <div className="k-perm-groups">
          {props.catalog.map((group) => (
            <fieldset key={group.modulo} className="k-fieldset">
              <legend className="k-field-label">
                {group.nombre}
                {group.activo ? null : <span className="k-soon">No contratado</span>}
              </legend>
              {group.permisos.map((permission) => (
                <label
                  key={permission.code}
                  className={`k-check${permission.puedes_dar ? "" : " is-disabled"}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(permission.code)}
                    disabled={!permission.puedes_dar}
                    onChange={(event) => toggle(permission.code, event.target.checked)}
                  />
                  <span>{permission.nombre}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <p className="k-small k-muted">
          Solo puedes dar permisos que tú tienes. Los de módulos no contratados no tienen efecto
          hasta que se activen.
        </p>
        <div className="k-dialog-actions k-dialog-actions-split">
          {role ? (
            <button
              type="button"
              className="k-link k-link-danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              Borrar rol
            </button>
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="submit" className="k-btn k-btn-go" disabled={busy}>
              Guardar
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}
