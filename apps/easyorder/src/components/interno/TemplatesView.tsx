"use client";

import { useCallback, useEffect, useState } from "react";
import { platformErrorMessage, templateImpact, validateRoleForm } from "@/lib/interno/logic";
import type { TemplateInfo, TemplatesInfo } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./templates.css";

type Draft = {
  readonly id: number | null;
  readonly nombre: string;
  readonly permisos: Set<string>;
};

/**
 * Plantillas de rol globales de Konnecttia: las ven todos los restaurantes. En las seis base se
 * quitan o añaden permisos (conservan nombre y no se borran); las demás se crean, editan y borran
 * aquí, sin migración.
 */
export function TemplatesView() {
  const { api, canWrite, toast } = usePlatform();
  const [info, setInfo] = useState<TemplatesInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<TemplateInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.templates();
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setInfo(result.data);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = new Map(
    (info?.catalogo ?? []).flatMap((group) => group.permisos.map((p) => [p.code, p.nombre])),
  );

  function startEdit(template: TemplateInfo) {
    setEditing(template);
    setDraft({ id: template.id, nombre: template.nombre, permisos: new Set(template.permisos) });
  }

  function toggle(code: string) {
    if (editing?.minimos.includes(code)) return;
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
    const body = { nombre: draft.nombre.trim(), permisos: [...draft.permisos] };
    setBusy(true);
    if (draft.id === null) {
      const created = await api.createTemplate(body);
      setBusy(false);
      if (!created.ok) return toast(platformErrorMessage(created.status, created.body), "error");
      toast("Plantilla creada. Ya la ven todos los restaurantes.");
    } else {
      const saved = await api.updateTemplate(draft.id, body);
      setBusy(false);
      if (!saved.ok) return toast(platformErrorMessage(saved.status, saved.body), "error");
      const n = saved.data.miembros_afectados;
      toast(
        n > 0
          ? `Plantilla guardada. Afecta a ${n} persona${n === 1 ? "" : "s"}.`
          : "Plantilla guardada.",
      );
    }
    setDraft(null);
    setEditing(null);
    await load();
  }

  async function remove(id: number) {
    setBusy(true);
    const result = await api.deleteTemplate(id);
    setBusy(false);
    setConfirmDelete(null);
    if (!result.ok) return toast(platformErrorMessage(result.status, result.body), "error");
    toast("Plantilla borrada.");
    await load();
  }

  const errors = draft ? validateRoleForm(draft.nombre, [...draft.permisos]) : {};
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="k-page k-templates">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">Konnecttia</p>
          <h1 className="k-heading">Plantillas de roles</h1>
        </div>
        {canWrite && !draft ? (
          <button
            type="button"
            className="k-btn k-btn-primary"
            onClick={() => {
              setEditing(null);
              setDraft({ id: null, nombre: "", permisos: new Set() });
            }}
          >
            Nueva plantilla
          </button>
        ) : null}
      </header>
      <p className="k-muted k-small">
        Las plantillas las ven y asignan todos los restaurantes. Cambiar una afecta al instante a
        quien la tenga. Cada restaurante puede además copiarla («Personalizar») o crear roles
        propios.
      </p>

      {failed ? <p className="k-alert">No se pudieron cargar las plantillas.</p> : null}
      {!info && !failed ? <p className="k-muted">Cargando…</p> : null}

      {info ? (
        <ul className="k-tpl-list">
          {info.plantillas.map((template) => (
            <li key={template.id} className="k-card k-tpl-item">
              <div className="k-tpl-main">
                <strong>{template.nombre}</strong>
                <span className="k-tpl-tag">{template.base ? "Base" : "Konnecttia"}</span>
                <span className="k-muted k-small">{templateImpact(template)}</span>
              </div>
              <details className="k-tpl-perms">
                <summary>{template.permisos.length} permisos</summary>
                <ul>
                  {template.permisos.map((code) => (
                    <li key={code}>{names.get(code) ?? code}</li>
                  ))}
                </ul>
              </details>
              {canWrite && template.editable ? (
                <div className="k-tpl-actions">
                  <button type="button" className="k-btn" onClick={() => startEdit(template)}>
                    Editar
                  </button>
                  {!template.borrable ? null : confirmDelete === template.id ? (
                    <>
                      <button
                        type="button"
                        className="k-btn k-btn-danger"
                        disabled={busy}
                        onClick={() => void remove(template.id)}
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
                      onClick={() => setConfirmDelete(template.id)}
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
          className="k-card k-tpl-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!hasErrors) void save();
          }}
        >
          <h2 className="k-title">{draft.id === null ? "Nueva plantilla" : "Editar plantilla"}</h2>
          {editing ? (
            <p className="k-warn" role="status">
              {templateImpact(editing)}
            </p>
          ) : null}
          <label className="k-tpl-field">
            <span>Nombre</span>
            <input
              className="k-input"
              value={draft.nombre}
              maxLength={60}
              disabled={editing?.base === true}
              onChange={(event) => setDraft({ ...draft, nombre: event.target.value })}
            />
            {errors.nombre && draft.nombre.length > 0 ? (
              <small className="k-alert">{errors.nombre}</small>
            ) : null}
          </label>
          {editing?.base ? (
            <p className="k-muted k-small">
              Plantilla base: conserva su nombre y no se borra; aquí quitas o añades permisos.
              {editing.minimos.length > 0
                ? " Los permisos de equipo y ajustes no se pueden quitar a Propietario."
                : ""}
            </p>
          ) : null}
          {editing?.por_defecto ? (
            <button
              type="button"
              className="k-btn"
              onClick={() => setDraft({ ...draft, permisos: new Set(editing.por_defecto ?? []) })}
            >
              Restaurar permisos originales
            </button>
          ) : null}
          {info.catalogo.map((group) => (
            <fieldset key={group.modulo} className="k-tpl-group">
              <legend>{group.nombre}</legend>
              {group.permisos.map((permission) => (
                <label key={permission.code} className="k-tpl-option">
                  <input
                    type="checkbox"
                    checked={draft.permisos.has(permission.code)}
                    disabled={editing?.minimos.includes(permission.code) === true}
                    onChange={() => toggle(permission.code)}
                  />
                  <span>{permission.nombre}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <p className="k-muted k-small">
            Un permiso de un módulo que el restaurante no tiene contratado no le da acceso hasta que
            se active.
          </p>
          {errors.permisos ? <p className="k-muted k-small">{errors.permisos}</p> : null}
          <div className="k-tpl-actions">
            <button type="submit" className="k-btn k-btn-primary" disabled={busy || hasErrors}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="k-btn"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setEditing(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
