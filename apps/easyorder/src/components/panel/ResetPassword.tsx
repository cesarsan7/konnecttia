"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { passwordUpdateMessage, resetDestination, takeReturn } from "@/lib/panel/recovery";
import { EasyOrderLockup } from "./Brand";
import { usePanel } from "./PanelProvider";

const MIN_PASSWORD = 8;

/** Destino del enlace de recuperación: Supabase abre la sesión y aquí se elige la contraseña. */
export function ResetPassword() {
  const { supabase, session, api, platformApi } = usePanel();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < MIN_PASSWORD) {
      setError(`Usa al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== repeat) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(passwordUpdateMessage(updateError.code));
      return;
    }
    const remembered = takeReturn();
    if (remembered) {
      router.replace(resetDestination({ remembered, restaurants: null, platformMember: false }));
      return;
    }
    // Solo sin restaurantes se pregunta si es del equipo de Konnecttia (evita denegaciones en
    // la auditoría para el resto).
    const mine = await api.myRestaurants();
    const restaurants = mine.ok ? mine.data.restaurantes.length : null;
    const platformMember = restaurants === 0 && (await platformApi.me()).ok;
    router.replace(resetDestination({ remembered: null, restaurants, platformMember }));
  }

  return (
    <main className="k-center-page">
      <div className="k-card k-login-card">
        <EasyOrderLockup />
        {session === undefined ? (
          <p className="k-muted">Comprobando el enlace…</p>
        ) : session === null ? (
          <>
            <h1 className="k-title">El enlace ha caducado</h1>
            <p className="k-muted">Vuelve a pedir uno desde «¿Olvidaste tu contraseña?».</p>
            <a className="k-btn k-btn-secondary" href="/panel">
              Ir al acceso
            </a>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 className="k-title">Crea tu contraseña</h1>
            <label className="k-field">
              <span>Contraseña nueva</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="k-field">
              <span>Repite la contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
              />
            </label>
            {error ? (
              <p className="k-alert" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="k-btn k-btn-primary k-btn-block" disabled={busy}>
              {busy ? "Guardando…" : "Guardar y entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
