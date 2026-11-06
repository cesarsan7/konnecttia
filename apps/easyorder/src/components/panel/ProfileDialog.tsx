"use client";

import { type FormEvent, useState } from "react";
import type { ApiResult } from "@/lib/api";
import type { ProfileSaved } from "@/lib/panel/api";
import {
  MEMBER_NAME_MAX,
  type MemberName,
  parseMemberName,
  teamErrorMessage,
} from "@/lib/panel/team";
import { Modal } from "./menu/Modal";
import "./profile-dialog.css";

/**
 * Diálogo para guardar el nombre (obligatorio) y el apodo (opcional) de una persona del equipo.
 * Sirve para el perfil propio y, con team.manage, para el de otra persona: quien lo usa decide
 * a qué endpoint llama con `onSave`.
 */
export function ProfileDialog(props: {
  readonly title: string;
  readonly intro?: string;
  readonly initial: { readonly nombre: string | null; readonly apodo: string | null };
  readonly onSave: (name: MemberName) => Promise<ApiResult<ProfileSaved>>;
  readonly onSaved: (saved: ProfileSaved) => void;
  readonly onClose: () => void;
}) {
  const [nombre, setNombre] = useState(props.initial.nombre ?? "");
  const [apodo, setApodo] = useState(props.initial.apodo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMemberName(nombre, apodo);
    if ("error" in parsed) return setError(parsed.error);
    setBusy(true);
    setError(null);
    const result = await props.onSave(parsed.value);
    setBusy(false);
    if (!result.ok) {
      return setError(teamErrorMessage((result.body as { reason?: string } | null)?.reason));
    }
    props.onSaved(result.data);
  }

  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form onSubmit={submit} noValidate className="k-editor k-profile-form">
        {props.intro ? <p className="k-muted k-small">{props.intro}</p> : null}
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        <label className="k-field">
          <span>Nombre</span>
          <input
            value={nombre}
            maxLength={MEMBER_NAME_MAX}
            autoComplete="name"
            onChange={(event) => setNombre(event.target.value)}
            required
          />
        </label>
        <label className="k-field">
          <span>
            Apodo <span className="k-muted k-optional">(opcional)</span>
          </span>
          <input
            value={apodo}
            maxLength={MEMBER_NAME_MAX}
            autoComplete="nickname"
            onChange={(event) => setApodo(event.target.value)}
          />
          <span className="k-small k-muted k-profile-hint">
            Si lo pones, el panel muestra el apodo en lugar del nombre.
          </span>
        </label>
        <div className="k-dialog-actions">
          <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="submit" className="k-btn k-btn-go" disabled={busy}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
