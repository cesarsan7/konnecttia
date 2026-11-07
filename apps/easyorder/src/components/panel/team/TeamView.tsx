"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { describePanelError } from "@/lib/panel/api";
import {
  branchesLabel,
  inviteLink,
  inviteMessage,
  personLabel,
  roleSummary,
  type Team,
  type TeamInvite,
  type TeamMember,
  teamErrorMessage,
} from "@/lib/panel/team";
import { Icon } from "../Icon";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";
import { ProfileDialog } from "../ProfileDialog";
import { RolesSection } from "./RolesSection";
import "./team-names.css";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly team: Team }
  | { readonly kind: "error"; readonly message: string };

type Toast = { readonly id: number; readonly text: string; readonly tone: "ok" | "error" };

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

export function TeamView() {
  const { api } = usePanel();
  const { slug, access, can, updateProfile } = useAccess();
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [naming, setNaming] = useState<TeamMember | null>(null);
  const [created, setCreated] = useState<{
    link: string;
    role: string;
    emailedTo: string | null;
  } | null>(null);
  const canView = can(PERMISSION.TeamView);
  const canManage = can(PERMISSION.TeamManage);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    const result = await api.team(slug);
    setState(
      result.ok
        ? { kind: "ready", team: result.data }
        : { kind: "error", message: describePanelError(result.status, result.body) },
    );
  }, [api, slug]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const header = (
    <header className="k-page-head">
      <div>
        <p className="k-eyebrow">{access.restaurante.nombre}</p>
        <h1 className="k-heading">Equipo</h1>
      </div>
      {canManage && state.kind === "ready" ? (
        <div className="k-head-tools">
          <button
            type="button"
            className="k-btn k-btn-primary"
            data-tour="equipo-invitar"
            onClick={() => setInviting(true)}
          >
            Invitar a alguien
          </button>
        </div>
      ) : null}
    </header>
  );

  if (!canView) {
    return (
      <div className="k-page">
        {header}
        <p className="k-card">Tu usuario no tiene permiso para ver el equipo.</p>
      </div>
    );
  }
  if (state.kind === "loading") {
    return (
      <div className="k-page" aria-busy="true">
        {header}
        <div className="k-skeleton k-skeleton-tall" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="k-page">
        {header}
        <div className="k-card">
          <p className="k-alert" role="alert">
            {state.message}
          </p>
          <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const team = state.team;
  const names = new Map(team.locales.map((branch) => [branch.id, branch.nombre]));
  const roleName = new Map(team.roles.map((role) => [role.id, role.nombre]));
  const multi = team.locales.length > 1;

  async function revoke(invite: TeamInvite) {
    const result = await api.teamChange(slug, "DELETE", `/invitaciones/${invite.id}`);
    if (result.ok) toast("Invitación anulada");
    else toast("No se pudo anular la invitación.", "error");
    void load();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Enlace copiado");
    } catch {
      toast("No se pudo copiar. Selecciónalo y cópialo a mano.", "error");
    }
  }

  return (
    <div className="k-page">
      {header}
      <section className="k-card k-cat" aria-labelledby="miembros" data-tour="equipo-miembros">
        <header className="k-cat-head">
          <h2 id="miembros" className="k-title">
            Miembros
          </h2>
          <span className="k-muted k-small">{team.miembros.length}</span>
        </header>
        <ul className="k-items">
          {team.miembros.map((member) => (
            <li key={member.id} className="k-item k-member">
              <span className="k-thumb" aria-hidden="true">
                <span>
                  {personLabel({ name: member.mostrar, email: member.email }, "?")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
              </span>
              <span className="k-item-main">
                <span className="k-item-name">
                  <strong className="k-ellipsis">
                    {personLabel({ name: member.mostrar, email: member.email }, "Sin nombre")}
                  </strong>
                  {member.eres_tu ? <span className="k-chip">Tú</span> : null}
                  {member.mostrar ? null : <span className="k-chip">Sin nombre</span>}
                </span>
                <span className="k-small k-muted k-ellipsis k-member-ids">
                  {[member.apodo ? member.nombre : null, member.mostrar ? member.email : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="k-item-meta k-small">
                  <span>{member.roles.map((role) => role.nombre).join(", ") || "Sin rol"}</span>
                  {multi ? (
                    <span className="k-muted">{branchesLabel(member.locales, names)}</span>
                  ) : null}
                </span>
                <span className="k-small k-muted">
                  Desde el {dateFormat.format(new Date(member.created_at))}
                </span>
              </span>
              {canManage || member.eres_tu ? (
                <span className="k-item-tools">
                  <button
                    type="button"
                    className="k-link k-small"
                    onClick={() => setNaming(member)}
                  >
                    Nombre
                  </button>
                  {canManage && !member.eres_tu ? (
                    <button
                      type="button"
                      className="k-btn k-btn-secondary k-btn-sm"
                      onClick={() => setEditing(member)}
                    >
                      Cambiar
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <section
          className="k-card k-cat"
          aria-labelledby="invitaciones"
          data-tour="equipo-invitaciones"
        >
          <header className="k-cat-head">
            <h2 id="invitaciones" className="k-title">
              Invitaciones pendientes
            </h2>
          </header>
          {team.invitaciones.length === 0 ? (
            <p className="k-cat-empty k-muted k-small">
              No hay invitaciones pendientes. Cada enlace sirve una vez y caduca a los{" "}
              {team.dias_invitacion} días.
            </p>
          ) : (
            <ul className="k-items">
              {team.invitaciones.map((invite) => {
                const link = inviteLink(window.location.origin, invite.token);
                return (
                  <li key={invite.id} className="k-item k-member">
                    <span className="k-thumb" aria-hidden="true">
                      <Icon name="link" size={18} />
                    </span>
                    <span className="k-item-main">
                      <span className="k-item-name">
                        <strong>{invite.email ?? "Cualquiera con el enlace"}</strong>
                      </span>
                      <span className="k-item-meta k-small">
                        <span>{roleName.get(invite.rol_id) ?? "Rol"}</span>
                        {multi ? (
                          <span className="k-muted">{branchesLabel(invite.locales, names)}</span>
                        ) : null}
                      </span>
                      <span className="k-small k-muted">
                        Caduca el {dateFormat.format(new Date(invite.expires_at))}
                      </span>
                    </span>
                    <span className="k-item-tools">
                      <button
                        type="button"
                        className="k-btn k-btn-secondary k-btn-sm"
                        onClick={() => void copy(link)}
                      >
                        Copiar enlace
                      </button>
                      <button
                        type="button"
                        className="k-link k-small k-link-danger"
                        onClick={() => void revoke(invite)}
                      >
                        Anular
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <RolesSection
        onChanged={(message) => {
          toast(message);
          void load();
        }}
      />

      {inviting ? (
        <InviteDialog
          team={team}
          onClose={() => setInviting(false)}
          onCreated={(link, role, emailedTo) => {
            setInviting(false);
            setCreated({ link, role, emailedTo });
            void load();
          }}
        />
      ) : null}
      {created ? (
        <Modal title="Invitación lista" onClose={() => setCreated(null)}>
          {created.emailedTo ? (
            <p>
              Hemos enviado la invitación a <strong>{created.emailedTo}</strong>. Si no le llega,
              comparte este enlace por WhatsApp. Al abrirlo, entra o crea su cuenta y queda dentro
              del equipo como <strong>{created.role.toLowerCase()}</strong>.
            </p>
          ) : (
            <p>
              Envía este enlace a la persona (por WhatsApp o email). Al abrirlo, entra o crea su
              cuenta y queda dentro del equipo como <strong>{created.role.toLowerCase()}</strong>.
            </p>
          )}
          <p className="k-invite-link">
            <code>{created.link}</code>
          </p>
          <div className="k-dialog-actions">
            <a
              className="k-btn k-btn-secondary"
              href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(access.restaurante.nombre, created.role, created.link))}`}
              target="_blank"
              rel="noreferrer"
            >
              Enviar por WhatsApp
            </a>
            <button
              type="button"
              className="k-btn k-btn-go"
              onClick={() => void copy(created.link)}
            >
              Copiar enlace
            </button>
          </div>
        </Modal>
      ) : null}
      {naming ? (
        <ProfileDialog
          title={naming.eres_tu ? "Tu nombre y apodo" : "Nombre y apodo"}
          intro={
            naming.eres_tu
              ? "Así te verá el equipo en el panel, en lugar de tu email."
              : `Cómo se llama esta persona en el panel (${naming.email ?? "sin email"}).`
          }
          initial={naming}
          onSave={(name) =>
            naming.eres_tu
              ? api.saveProfile(slug, name)
              : api.saveMemberProfile(slug, naming.id, name)
          }
          onSaved={(saved) => {
            if (naming.eres_tu) updateProfile(saved);
            setNaming(null);
            toast("Nombre guardado");
            void load();
          }}
          onClose={() => setNaming(null)}
        />
      ) : null}
      {editing ? (
        <MemberDialog
          team={team}
          member={editing}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            toast(message);
            void load();
          }}
        />
      ) : null}

      <div className="k-toasts" aria-live="polite">
        {toasts.map((item) => (
          <p key={item.id} className={`k-toast is-${item.tone}`}>
            {item.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function RolePicker({
  team,
  value,
  onChange,
}: {
  readonly team: Team;
  readonly value: number | null;
  readonly onChange: (id: number) => void;
}) {
  return (
    <fieldset className="k-fieldset k-fieldset-flat">
      <legend className="k-field-label">Rol</legend>
      <div className="k-role-list">
        {team.roles
          .filter((role) => role.asignable)
          .map((role) => (
            <label
              key={role.id}
              className={`k-allergen k-pay-option${value === role.id ? " is-on" : ""}`}
            >
              <input
                type="radio"
                name="rol"
                checked={value === role.id}
                onChange={() => onChange(role.id)}
              />
              <span>
                {role.nombre}
                <span className="k-small k-muted k-block">{roleSummary(role)}</span>
              </span>
            </label>
          ))}
      </div>
    </fieldset>
  );
}

function BranchPicker({
  team,
  value,
  onChange,
}: {
  readonly team: Team;
  readonly value: number[];
  readonly onChange: (ids: number[]) => void;
}) {
  if (team.locales.length < 2) return null;
  return (
    <fieldset className="k-fieldset">
      <legend className="k-field-label">Locales</legend>
      <div className="k-chips-pick">
        <label className={`k-allergen${value.length === 0 ? " is-on" : ""}`}>
          <input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} />
          <span>Todos</span>
        </label>
        {team.locales.map((branch) => (
          <label
            key={branch.id}
            className={`k-allergen${value.includes(branch.id) ? " is-on" : ""}`}
          >
            <input
              type="checkbox"
              checked={value.includes(branch.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, branch.id]
                    : value.filter((id) => id !== branch.id),
                )
              }
            />
            <span>{branch.nombre}</span>
          </label>
        ))}
      </div>
      <p className="k-small k-muted">
        Limitar a un local sirve para cajeros o encargados de un solo local.
      </p>
    </fieldset>
  );
}

function InviteDialog(props: {
  readonly team: Team;
  readonly onClose: () => void;
  readonly onCreated: (link: string, role: string, emailedTo: string | null) => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const staff = props.team.roles.find((role) => role.code === "staff" && role.asignable);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<number | null>(staff?.id ?? null);
  const [branches, setBranches] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (roleId === null) return setError("Elige un rol.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError("Ese email no parece válido.");
    }
    setBusy(true);
    const result = await api.teamChange<{ token: string; email_enviado?: boolean }>(
      slug,
      "POST",
      "/invitaciones",
      {
        email: email.trim() || null,
        rol_id: roleId,
        sucursal_ids: branches,
      },
    );
    setBusy(false);
    if (!result.ok)
      return setError(teamErrorMessage((result.body as { reason?: string } | null)?.reason));
    const role = props.team.roles.find((item) => item.id === roleId)?.nombre ?? "miembro";
    props.onCreated(
      inviteLink(window.location.origin, result.data.token),
      role,
      result.data.email_enviado ? email.trim().toLowerCase() : null,
    );
  }

  return (
    <Modal title="Invitar al equipo" onClose={props.onClose} wide>
      <form onSubmit={submit} noValidate className="k-editor">
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        <label className="k-field">
          <span>
            Email <span className="k-muted k-optional">(recomendado)</span>
          </span>
          <input
            type="email"
            value={email}
            maxLength={255}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@ejemplo.com"
          />
          <span className="k-small k-muted k-hint-text">
            Con email, solo esa persona podrá usar el enlace. Sin email, sirve a quien lo abra
            primero.
          </span>
        </label>
        <RolePicker team={props.team} value={roleId} onChange={setRoleId} />
        <BranchPicker team={props.team} value={branches} onChange={setBranches} />
        <div className="k-dialog-actions">
          <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="submit" className="k-btn k-btn-go" disabled={busy}>
            Crear invitación
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MemberDialog(props: {
  readonly team: Team;
  readonly member: TeamMember;
  readonly onClose: () => void;
  readonly onDone: (message: string) => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const member = props.member;
  const [roleId, setRoleId] = useState<number | null>(member.roles[0]?.id ?? null);
  const [branches, setBranches] = useState<number[]>(
    member.locales === "todos" ? [] : [...member.locales],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const editable = member.roles.every(
    (role) => props.team.roles.find((r) => r.id === role.id)?.asignable,
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (roleId === null) return setError("Elige un rol.");
    setBusy(true);
    const result = await api.teamChange(slug, "PATCH", `/miembros/${member.id}`, {
      rol_id: roleId,
      sucursal_ids: branches,
    });
    setBusy(false);
    if (!result.ok)
      return setError(teamErrorMessage((result.body as { reason?: string } | null)?.reason));
    props.onDone("Acceso actualizado");
  }

  async function remove() {
    setBusy(true);
    const result = await api.teamChange(slug, "DELETE", `/miembros/${member.id}`);
    setBusy(false);
    if (!result.ok)
      return setError(teamErrorMessage((result.body as { reason?: string } | null)?.reason));
    props.onDone("Acceso quitado");
  }

  return (
    <Modal
      title={personLabel({ name: member.mostrar, email: member.email }, "Miembro del equipo")}
      onClose={props.onClose}
      wide
    >
      <form onSubmit={save} noValidate className="k-editor">
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        {!editable ? (
          <p className="k-note">Tiene un rol con más permisos que el tuyo: no puedes cambiarlo.</p>
        ) : (
          <>
            <RolePicker team={props.team} value={roleId} onChange={setRoleId} />
            <BranchPicker team={props.team} value={branches} onChange={setBranches} />
          </>
        )}
        <div className="k-dialog-actions k-dialog-actions-split">
          {editable ? (
            confirm ? (
              <span className="k-confirm">
                <span className="k-small">Dejará de entrar al panel.</span>
                <button
                  type="button"
                  className="k-btn k-btn-sm k-btn-danger"
                  disabled={busy}
                  onClick={remove}
                >
                  Quitar acceso
                </button>
                <button
                  type="button"
                  className="k-btn k-btn-sm k-btn-secondary"
                  onClick={() => setConfirm(false)}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="k-link k-link-danger"
                onClick={() => setConfirm(true)}
              >
                Quitar acceso
              </button>
            )
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cerrar
            </button>
            {editable ? (
              <button type="submit" className="k-btn k-btn-go" disabled={busy}>
                Guardar
              </button>
            ) : null}
          </span>
        </div>
      </form>
    </Modal>
  );
}
