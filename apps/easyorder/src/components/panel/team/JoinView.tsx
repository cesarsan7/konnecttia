"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type InvitePreview,
  inviteStateText,
  MEMBER_NAME_MAX,
  parseMemberName,
  teamErrorMessage,
} from "@/lib/panel/team";
import { EasyOrderLockup } from "../Brand";
import { rememberRestaurant } from "../LoginScreen";
import { usePanel } from "../PanelProvider";
import "../profile-dialog.css";

type Mode = "login" | "signup" | "check-email";

/**
 * Página del enlace de invitación: quien la abre entra (o crea su cuenta) y acepta. El servidor
 * comprueba que la invitación sigue viva y, si lleva email, que es el de esa cuenta.
 */
export function JoinView({ token }: { readonly token: string }) {
  const { supabase, api, session, configured } = usePanel();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apodo, setApodo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPreview = useCallback(async () => {
    const result = await api.invite(token);
    if (result.ok) setPreview(result.data);
    else
      setLoadError(
        result.status === 404
          ? "Este enlace de invitación no existe."
          : "No pudimos abrir la invitación.",
      );
  }, [api, token]);

  useEffect(() => {
    if (session) void loadPreview();
  }, [session, loadPreview]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.href },
      });
      setBusy(false);
      if (signUpError) {
        return setError(
          /already registered/i.test(signUpError.message)
            ? "Ese email ya tiene cuenta. Elige «Ya tengo cuenta»."
            : /password/i.test(signUpError.message)
              ? "La contraseña debe tener al menos 8 caracteres."
              : "No se pudo crear la cuenta. Inténtalo de nuevo.",
        );
      }
      // Si Supabase pide confirmar el email, la sesión llega al volver desde el correo.
      if (!data.session) setMode("check-email");
      return;
    }
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (loginError) setError("Email o contraseña incorrectos.");
  }

  async function accept(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMemberName(nombre, apodo);
    if ("error" in parsed) return setError(parsed.error);
    setBusy(true);
    setError(null);
    const result = await api.acceptInvite(token, parsed.value);
    setBusy(false);
    if (!result.ok) {
      const reason = (result.body as { reason?: string } | null)?.reason;
      // name_required y los estados de la invitación (usada, caducada…) tienen su texto.
      setError(
        (reason === "name_required" ? teamErrorMessage(reason) : null) ||
          (reason ? inviteStateText(reason as InvitePreview["estado"]) : null) ||
          "No se pudo aceptar la invitación.",
      );
      return;
    }
    if (result.data.slug) {
      rememberRestaurant(result.data.slug);
      router.replace(`/panel/${result.data.slug}`);
    } else {
      router.replace("/panel");
    }
  }

  return (
    <main className="k-center-page">
      <div className="k-card k-login-card k-join">
        <EasyOrderLockup />
        {!configured ? (
          <p className="k-alert">El acceso no está configurado en este entorno.</p>
        ) : session === undefined ? (
          <p className="k-muted">Cargando…</p>
        ) : !session ? (
          mode === "check-email" ? (
            <>
              <h1 className="k-title">Revisa tu correo</h1>
              <p className="k-muted">
                Te enviamos un enlace a <strong>{email}</strong> para confirmar la cuenta. Ábrelo y
                volverás aquí para aceptar la invitación.
              </p>
            </>
          ) : (
            <form onSubmit={authenticate} noValidate>
              <h1 className="k-title">Te han invitado a un panel de EasyOrder</h1>
              <p className="k-muted">
                {mode === "signup"
                  ? "Crea tu cuenta con el email al que te invitaron."
                  : "Entra con tu cuenta para aceptar la invitación."}
              </p>
              <div className="k-segment k-segment-sm k-join-tabs">
                <button
                  type="button"
                  className={mode === "signup" ? "is-on" : ""}
                  aria-pressed={mode === "signup"}
                  onClick={() => setMode("signup")}
                >
                  Crear cuenta
                </button>
                <button
                  type="button"
                  className={mode === "login" ? "is-on" : ""}
                  aria-pressed={mode === "login"}
                  onClick={() => setMode("login")}
                >
                  Ya tengo cuenta
                </button>
              </div>
              {error ? (
                <p className="k-alert" role="alert">
                  {error}
                </p>
              ) : null}
              <label className="k-field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="k-field">
                <span>Contraseña</span>
                <input
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="k-btn k-btn-primary k-btn-block" disabled={busy}>
                {mode === "signup" ? "Crear cuenta y continuar" : "Entrar"}
              </button>
            </form>
          )
        ) : loadError ? (
          <>
            <h1 className="k-title">{loadError}</h1>
            <p className="k-muted">Pide un enlace nuevo a quien te invitó.</p>
          </>
        ) : !preview ? (
          <p className="k-muted">Cargando la invitación…</p>
        ) : (
          <>
            <h1 className="k-title">Únete a {preview.restaurante.nombre}</h1>
            {preview.estado === "valida" ? (
              <form onSubmit={accept} noValidate className="k-join-name">
                <p className="k-muted">
                  Entrarás como <strong>{preview.rol?.toLowerCase()}</strong>
                  {preview.todos_los_locales ? "" : " en algunos locales"}. Cuenta:{" "}
                  <strong>{preview.tu_email}</strong>.
                </p>
                <p className="k-muted k-small">
                  Dinos cómo te llamas: el equipo te verá con tu nombre (o tu apodo), no con tu
                  email.
                </p>
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
                    onChange={(e) => setNombre(e.target.value)}
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
                    onChange={(e) => setApodo(e.target.value)}
                  />
                </label>
                <button type="submit" className="k-btn k-btn-primary k-btn-block" disabled={busy}>
                  Aceptar y entrar al panel
                </button>
              </form>
            ) : (
              <>
                <p className="k-alert" role="alert">
                  {inviteStateText(preview.estado)}
                </p>
                {preview.estado === "ya_miembro" && preview.restaurante.slug ? (
                  <a
                    className="k-btn k-btn-primary k-btn-block"
                    href={`/panel/${preview.restaurante.slug}`}
                  >
                    Ir al panel
                  </a>
                ) : null}
              </>
            )}
            <button
              type="button"
              className="k-link k-small"
              onClick={async () => {
                await supabase?.auth.signOut();
                setPreview(null);
              }}
            >
              Usar otra cuenta
            </button>
          </>
        )}
      </div>
    </main>
  );
}
