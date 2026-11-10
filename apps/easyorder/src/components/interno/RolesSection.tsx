"use client";

import { useCallback, useEffect, useState } from "react";
import { inactivePermissions, platformErrorMessage, validateRoleForm } from "@/lib/interno/logic";
import type { RestaurantDetail, RoleRowInfo, RolesInfo } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./roles-section.css";
import { HelpNote } from "@/components/HelpNote";
import { INTERNO_HELP } from "@/lib/interno/help";

type Props = { readonly detail: RestaurantDetail };

type Draft = {
  readonly id: number | null;
  readonly nombre: string;
  readonly permisos: Set<string>;
};

export function RolesSection({ detail }: Props) {
  const { api, canWrite, toast } = usePlatform();
  const restauranteId = detail.restaurante.id;
  const [info, setInfo] = useState<RolesInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    const result = await api.roles(restauranteId);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setInfo(result.data);
  }, [api, restauranteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = new Map(
    (info?.catalogo ?? []).flatMap((group) => group.permisos.map((p) => [p.code, p.nombre])),
  );

  function startNew() {
    setDraft({ id: null, nombre: "", permisos: new Set() });
  }

  function startEdit(role: RoleRowInfo) {
    setDraft({ id: role.id, nombre: role.nombre, permisos: new Set(role.permisos) });
  }

  function toggle(code: string) {
    setDraft((current) => {
      if (!current) return current;
      const next = new Set(current.permisos);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...current, permisos: next };
    });
  }

  async function save() {
    if (!draft) return;
    const permisos = [...draft.permisos];
    const body = { nombre: draft.nombre.trim(), permisos };
    setBusy(true);
    if (draft.id === null) {
      const created = await api.createRole(restauranteId, body);
      setBusy(false);
      if (!created.ok) {
        toast(platformErrorMessage(created.status, created.body), "error");
        return;
      }
      toast("Rol creado.");
    } else {
      const saved = await api.updateRole(restauranteId, draft.id, body);
      setBusy(false);
      if (!saved.ok) {
        toast(platformErrorMessage(saved.status, saved.body), "error");
        return;
      }
      const n = saved.data.miembros_afectados;
      toast(n > 0 ? `Rol guardado. Afecta a ${n} persona${n === 1 ? "" : "s"}.` : "Rol guardado.");
    }
    setDraft(null);
    await load();
  }

  async function remove(roleId: number) {
    setBusy(true);
    const result = await api.deleteRole(restauranteId, roleId);
    setBusy(false);
    setConfirmDelete(null);
    if (!result.ok) {
      toast(platformErrorMessage(result.status, result.body), "error");
      return;
    }
    toast("Rol borrado.");
    await load();
  }

  const errors = draft ? validateRoleForm(draft.nombre, [...draft.permisos]) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const inactive = draft && info ? inactivePermissions(draft.permisos, info.catalogo) : [];

  return (
    <section className="k-card k-roles" aria-labelledby="roles-title">
      <div className="k-roles-head">
        <h2 id="roles-title" className="k-title">
          Roles
        </h2>
        {canWrite && !draft ? (
          <button type="button" className="k-btn k-btn-primary" onClick={startNew}>
            Nuevo rol
          </button>
        ) : null}
      </div>
      <p className="k-muted k-small">
        Las plantillas son comunes a todos los restaurantes y no se editan aquí. Los roles propios
        solo existen en este restaurante.
      </p>
      <HelpNote items={INTERNO_HELP.roles} />

      {failed ? <p className="k-alert">No se pudieron cargar los roles.</p> : null}
      {!info && !failed ? <p className="k-muted">Cargando…</p> : null}

      {info ? (
        <ul className="k-roles-list">
          {info.roles.map((role) => (
            <li key={role.id} className="k-roles-item">
              <div className="k-roles-main">
                <strong>{role.nombre}</strong>
                <span className="k-roles-tag">{role.plantilla ? "Plantilla" : "Propio"}</span>
                <span className="k-muted k-small">
                  {role.miembros} persona{role.miembros === 1 ? "" : "s"}
                  {role.invitaciones > 0
                    ? ` · ${role.invitaciones} invitación${role.invitaciones === 1 ? "" : "es"}`
                    : ""}
                </span>
              </div>
              <details className="k-roles-perms">
                <summary>{role.permisos.length} permisos</summary>
                <ul>
                  {role.permisos.map((code) => (
                    <li key={code}>{names.get(code) ?? code}</li>
                  ))}
                </ul>
              </details>
              {canWrite && role.editable ? (
                <div className="k-roles-actions">
                  <button type="button" className="k-btn" onClick={() => startEdit(role)}>
                    Editar
                  </button>
                  {confirmDelete === role.id ? (
                    <>
                      <button
                        type="button"
                        className="k-btn k-btn-danger"
                        disabled={busy}
                        onClick={() => void remove(role.id)}
                      >
                        Confirmar borrado
                      </button>
                      <button
                        type="button"
                        className="k-btn"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="k-btn"
                      onClick={() => setConfirmDelete(role.id)}
                    >
                      Borrar
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {draft && info ? (
        <form
          className="k-roles-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!hasErrors) void save();
          }}
        >
          <h3 className="k-roles-subtitle">{draft.id === null ? "Nuevo rol" : "Editar rol"}</h3>
          <label className="k-roles-field">
            <span>Nombre</span>
            <input
              className="k-input"
              value={draft.nombre}
              maxLength={60}
              onChange={(event) => setDraft({ ...draft, nombre: event.target.value })}
            />
            {errors.nombre && draft.nombre.length > 0 ? (
              <small className="k-alert">{errors.nombre}</small>
            ) : null}
          </label>

          {info.catalogo.map((group) => (
            <fieldset key={group.modulo} className="k-roles-group">
              <legend>
                {group.nombre}
                {group.activo ? "" : " (módulo no contratado)"}
              </legend>
              {group.permisos.map((permission) => (
                <label key={permission.code} className="k-roles-option">
                  <input
                    type="checkbox"
                    checked={draft.permisos.has(permission.code)}
                    onChange={() => toggle(permission.code)}
                  />
                  <span>{permission.nombre}</span>
                </label>
              ))}
            </fieldset>
          ))}

          {inactive.length > 0 ? (
            <p className="k-warn" role="status">
              Hay permisos marcados de módulos que este restaurante no tiene: no tendrán efecto
              hasta que se contraten.
            </p>
          ) : null}
          {errors.permisos ? <p className="k-muted k-small">{errors.permisos}</p> : null}

          <div className="k-roles-actions">
            <button type="submit" className="k-btn k-btn-primary" disabled={busy || hasErrors}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="k-btn" disabled={busy} onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
