"use client";

import { type FormEvent, useState } from "react";
import { EasyOrderLockup } from "../panel/Brand";
import { authMessage } from "../panel/LoginScreen";
import { usePanel } from "../panel/PanelProvider";

/** Acceso al panel interno: el mismo Supabase Auth que el panel de los restaurantes. */
export function InternalLogin() {
  const { supabase, configured } = usePanel();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError) setError(authMessage(authError.message));
  }

  return (
    <main className="k-center-page">
      <div className="k-card k-login-card">
        <EasyOrderLockup />
        {!configured ? (
          <div role="alert">
            <h1 className="k-title">El acceso no está configurado</h1>
            <p className="k-muted">
              Faltan las variables SUPABASE_URL y SUPABASE_ANON_KEY en este servicio.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <h1 className="k-title">Panel interno de Konnecttia</h1>
            <p className="k-muted k-form-lead">Entra con tu cuenta del equipo.</p>
            <label className="k-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="k-field">
              <span>Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? (
              <p className="k-alert" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="k-btn k-btn-primary k-btn-block" disabled={busy}>
              {busy ? "Un momento…" : "Entrar"}
            </button>
            <a className="k-link" href="/panel?recuperar=1">
              ¿Olvidaste tu contraseña?
            </a>
          </form>
        )}
      </div>
    </main>
  );
}
