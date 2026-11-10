"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { HelpNote } from "@/components/HelpNote";
import { platformErrorMessage } from "@/lib/interno/logic";
import type { PlatformMemberRow, PlatformTeam, UnusedAccounts } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./team.css";

type Rol = "admin" | "soporte";
const ROL_TEXT: Record<Rol, string> = { admin: "Administrador", soporte: "Soporte (solo lectura)" };

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" });
const shortDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "nunca");

const TEAM_HELP = [
  {
    campo: "Dar acceso por email",
    para: "Que una persona entre al panel interno sin que nadie ejecute SQL.",
    como: "Escribe su email y elige el rol. Debe tener ya una cuenta de EasyOrder (haber entrado alguna vez); la buscamos en Supabase y la añadimos al equipo.",
    ejemplo:
      "Una compañera nueva entra una vez a EasyOrder; la añades como Soporte y ya ve /interno.",
    cuidado:
      "Administrador puede cambiar planes, módulos y borrar restaurantes; Soporte solo mira.",
  },
  {
    campo: "Quitar acceso",
    para: "Retirar a alguien del panel interno sin perder el historial.",
    como: "«Desactivar» corta el acceso al momento pero conserva la fila y la auditoría; se puede reactivar. No borra su cuenta de Supabase.",
    cuidado:
      "No puedes quitarte el acceso a ti mismo, y siempre debe quedar un administrador activo.",
  },
  {
    campo: "Cuentas sin uso",
    para: "Limpiar cuentas de Supabase que quedaron huérfanas (por ejemplo, tras borrar un restaurante).",
    como: "Se listan las cuentas que no son miembro de ningún restaurante, no están en el equipo de Konnecttia, no tienen prueba ni invitación pendiente y tienen más de unos días. Borrarlas es manual y definitivo.",
    cuidado:
      "Borrar una cuenta elimina a la persona de Supabase: tendrá que registrarse de nuevo. Quitar a alguien de un restaurante o borrar el restaurante NO borra su cuenta a propósito: puede estar en otro restaurante.",
  },
] as const;

export function TeamView() {
  const { api, canWrite, toast } = usePlatform();
  const [team, setTeam] = useState<PlatformTeam | null>(null);
  const [orphans, setOrphans] = useState<UnusedAccounts | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<Rol>("soporte");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.team();
    if (!result.ok) return setFailed(true);
    setFailed(false);
    setTeam(result.data);
    if (canWrite && result.data.busqueda_por_email) {
      const accounts = await api.unusedAccounts();
      if (accounts.ok) setOrphans(accounts.data);
    }
  }, [api, canWrite]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const result = await api.addTeamMember(email.trim(), rol);
    setBusy(false);
    if (!result.ok) return toast(platformErrorMessage(result.status, result.body), "error");
    setEmail("");
    toast("Acceso concedido");
    void load();
  }

  async function change(member: PlatformMemberRow, change: { rol?: Rol; activo?: boolean }) {
    setBusy(true);
    const result = await api.changeTeamMember(member.user_id, change);
    setBusy(false);
    if (!result.ok) return toast(platformErrorMessage(result.status, result.body), "error");
    toast("Cambio guardado");
    void load();
  }

  async function purge(userId: string) {
    setBusy(true);
    const result = await api.deleteAccount(userId);
    setBusy(false);
    setConfirm(null);
    if (!result.ok) return toast(platformErrorMessage(result.status, result.body), "error");
    toast("Cuenta borrada de Supabase");
    void load();
  }

  if (failed) return <p className="k-alert">No se pudo cargar el equipo. Recarga la página.</p>;
  if (!team) return <div className="k-skeleton" aria-busy="true" />;

  return (
    <div className="k-page k-team-page">
      <section className="k-card k-settings">
        <h1 className="k-title">Equipo de Konnecttia</h1>
        <p className="k-muted k-small">
          Quién entra al panel interno. Los cambios quedan en la auditoría.
        </p>
        <HelpNote items={TEAM_HELP} summary="¿Cómo funciona el acceso al panel interno?" />
        <ul className="k-items">
          {team.miembros.map((member) => {
            const me = member.user_id === team.yo;
            return (
              <li key={member.user_id} className={`k-item${member.activo ? "" : " is-off"}`}>
                <span className="k-item-main">
                  <span className="k-item-name">
                    <strong>{member.email ?? member.user_id}</strong>
                    {me ? <span className="k-chip">Tú</span> : null}
                    {member.activo ? null : <span className="k-chip">Sin acceso</span>}
                  </span>
                  <span className="k-small k-muted">Desde {shortDate(member.created_at)}</span>
                </span>
                {canWrite ? (
                  <span className="k-item-tools">
                    <select
                      className="k-input"
                      aria-label={`Rol de ${member.email ?? member.user_id}`}
                      value={member.rol}
                      disabled={busy || me}
                      onChange={(e) => void change(member, { rol: e.target.value as Rol })}
                    >
                      {(Object.keys(ROL_TEXT) as Rol[]).map((value) => (
                        <option key={value} value={value}>
                          {ROL_TEXT[value]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="k-btn k-btn-secondary k-btn-sm"
                      disabled={busy || me}
                      onClick={() => void change(member, { activo: !member.activo })}
                    >
                      {member.activo ? "Quitar acceso" : "Reactivar"}
                    </button>
                  </span>
                ) : (
                  <span className="k-small k-muted">{ROL_TEXT[member.rol]}</span>
                )}
              </li>
            );
          })}
        </ul>

        {canWrite ? (
          <form onSubmit={add} className="k-team-add">
            <h2 className="k-subtitle">Dar acceso</h2>
            {team.busqueda_por_email ? null : (
              <p className="k-alert" role="note">
                El servidor no tiene la clave de servicio de Supabase: no se puede buscar por email.
                Configura SUPABASE_SERVICE_ROLE_KEY en la API.
              </p>
            )}
            <div className="k-form-grid">
              <label className="k-field">
                <span>Email de la persona</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="off"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@ejemplo.com"
                />
              </label>
              <label className="k-field">
                <span>Rol</span>
                <select
                  className="k-input"
                  value={rol}
                  onChange={(e) => setRol(e.target.value as Rol)}
                >
                  {(Object.keys(ROL_TEXT) as Rol[]).map((value) => (
                    <option key={value} value={value}>
                      {ROL_TEXT[value]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              className="k-btn k-btn-go"
              disabled={busy || !email.trim() || !team.busqueda_por_email}
            >
              Dar acceso
            </button>
          </form>
        ) : null}
      </section>

      {canWrite && orphans ? (
        <section id="cuentas" className="k-card k-settings">
          <h2 className="k-title">Cuentas sin uso</h2>
          <p className="k-muted k-small">
            Cuentas de Supabase que no están en ningún restaurante, ni en el equipo, ni tienen
            invitación pendiente (con más de {orphans.dias_minimos} días). Borrarlas es opcional y
            definitivo.
          </p>
          {orphans.cuentas.length === 0 ? (
            <p className="k-muted">No hay cuentas sin uso.</p>
          ) : (
            <ul className="k-items">
              {orphans.cuentas.map((account) => (
                <li key={account.user_id} className="k-item">
                  <span className="k-item-main">
                    <strong>{account.email ?? account.user_id}</strong>
                    <span className="k-small k-muted">
                      Creada {shortDate(account.creada)} · último acceso{" "}
                      {shortDate(account.ultimo_acceso)}
                    </span>
                  </span>
                  {confirm === account.user_id ? (
                    <span className="k-confirm">
                      <span className="k-small">Se borra de Supabase.</span>
                      <button
                        type="button"
                        className="k-btn k-btn-danger k-btn-sm"
                        disabled={busy}
                        onClick={() => void purge(account.user_id)}
                      >
                        Borrar cuenta
                      </button>
                      <button
                        type="button"
                        className="k-link k-small"
                        onClick={() => setConfirm(null)}
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="k-link k-small k-link-danger"
                      onClick={() => setConfirm(account.user_id)}
                    >
                      Borrar cuenta
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
