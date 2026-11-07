"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { helpPath } from "@/lib/ayuda/slugs";
import { parseReturnTarget, rememberReturn } from "@/lib/panel/recovery";
import { sortByLastUsed } from "@/lib/panel/restaurants";
import type { MyRestaurants } from "@/lib/panel/types";
import { EasyOrderLockup } from "./Brand";
import { usePanel } from "./PanelProvider";

const LAST_RESTAURANT_KEY = "easyorder.panel.restaurante";

/** Recuerda el último restaurante abierto en este navegador (solo para ponerlo primero). */
export function rememberRestaurant(slug: string) {
  try {
    localStorage.setItem(LAST_RESTAURANT_KEY, slug);
  } catch {
    // Navegación privada: no pasa nada, se vuelve a elegir.
  }
}

function lastRestaurant(): string | null {
  try {
    return localStorage.getItem(LAST_RESTAURANT_KEY);
  } catch {
    return null;
  }
}

type Mode = "login" | "recover" | "recover-sent";

/** Mensajes de Supabase Auth traducidos (los que puede ver el equipo de un restaurante). */
export function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "Confirma tu email antes de entrar.";
  if (/rate limit|too many/i.test(message))
    return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

export function LoginScreen() {
  const { supabase, api, publicApi, session, configured } = usePanel();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  // `?recuperar=1` abre directamente «Recupera tu contraseña» (enlace desde /alta y /interno).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("recuperar")) {
      setMode("recover");
      rememberReturn(parseReturnTarget(params.get("volver")));
    }
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<MyRestaurants["restaurantes"] | null>(null);

  const enter = useCallback(async () => {
    const result = await api.myRestaurants();
    if (!result.ok) {
      setError(
        result.status === 0
          ? "No hay conexión con el servidor de EasyOrder."
          : "No pudimos cargar tus restaurantes.",
      );
      return;
    }
    const list = result.data.restaurantes;
    // Con un solo restaurante se entra directamente; con varios, siempre se elige.
    const only = list.length === 1 ? list[0] : undefined;
    if (only) {
      rememberRestaurant(only.slug);
      router.replace(`/panel/${only.slug}`);
      return;
    }
    setChoices(sortByLastUsed(list, lastRestaurant()));
  }, [api, router]);

  // Con una sesión ya abierta, se entra directamente.
  useEffect(() => {
    if (session) void enter();
  }, [session, enter]);

  async function onLogin(event: FormEvent) {
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

  async function onRecover(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    // Primero la API (email de EasyOrder con Resend); si no puede, el de Supabase.
    const sent = await publicApi.recoverPassword(email.trim());
    if (sent.ok && sent.data.enviado_por === "easyorder") {
      setBusy(false);
      setMode("recover-sent");
      return;
    }
    if (!sent.ok && sent.status === 429) {
      setBusy(false);
      setError("Demasiados intentos. Espera unos minutos y vuelve a probar.");
      return;
    }
    if (!sent.ok && sent.status === 400) {
      setBusy(false);
      setError("Escribe un email válido.");
      return;
    }
    const { error: recoverError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/panel/restablecer`,
    });
    setBusy(false);
    if (recoverError) {
      setError(authMessage(recoverError.message));
      return;
    }
    setMode("recover-sent");
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setChoices(null);
  }

  return (
    <main className="k-login">
      <section className="k-login-brand" aria-label="EasyOrder">
        <EasyOrderLockup />
        <div>
          <h1 className="k-display">Tu cocina, en orden.</h1>
          <p className="k-lead">
            Los pedidos de la web y de WhatsApp en un solo tablero, con aviso sonoro, y las ventas
            de cada local de un vistazo.
          </p>
        </div>
        <p className="k-login-foot">Konnecttia · Tu aliado digital en Canarias</p>
      </section>

      <section className="k-login-panel">
        <div className="k-card k-login-card">
          {!configured ? (
            <div role="alert">
              <h2 className="k-title">El acceso no está configurado</h2>
              <p className="k-muted">
                Faltan las variables SUPABASE_URL y SUPABASE_ANON_KEY en este servicio.
              </p>
            </div>
          ) : choices ? (
            <div>
              <h2 className="k-title">Elige el restaurante</h2>
              {choices.length === 0 ? (
                <p className="k-muted">
                  Tu usuario todavía no tiene ningún restaurante asignado. Escríbenos a{" "}
                  <a href="mailto:hola@konnecttia.com">hola@konnecttia.com</a> y lo activamos.
                </p>
              ) : (
                <ul className="k-choice-list">
                  {choices.map((restaurant, index) => (
                    <li key={restaurant.slug}>
                      <button
                        type="button"
                        className="k-choice"
                        onClick={() => {
                          rememberRestaurant(restaurant.slug);
                          router.push(`/panel/${restaurant.slug}`);
                        }}
                      >
                        <span className="k-choice-name">{restaurant.nombre}</span>
                        <span className="k-muted k-small">
                          {restaurant.roles.join(", ")}
                          {index === 0 && restaurant.slug === lastRestaurant()
                            ? " · último usado"
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="k-link" onClick={signOut}>
                Entrar con otra cuenta
              </button>
            </div>
          ) : mode === "recover-sent" ? (
            <div role="status">
              <h2 className="k-title">Revisa tu correo</h2>
              <p className="k-muted">
                Si {email} tiene acceso, recibirás un enlace para crear una contraseña nueva.
              </p>
              <button type="button" className="k-link" onClick={() => setMode("login")}>
                Volver a entrar
              </button>
            </div>
          ) : (
            <form onSubmit={mode === "login" ? onLogin : onRecover} noValidate={false}>
              <h2 className="k-title">
                {mode === "login" ? "Entra en tu panel" : "Recupera tu contraseña"}
              </h2>
              <p className="k-muted k-form-lead">
                {mode === "login"
                  ? "Usa el email con el que te dimos de alta."
                  : "Te enviaremos un enlace para crear una contraseña nueva."}
              </p>
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
              {mode === "login" ? (
                <label className="k-field">
                  <span>Contraseña</span>
                  <span className="k-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      className="k-password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </span>
                </label>
              ) : null}
              {error ? (
                <p className="k-alert" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="k-btn k-btn-primary k-btn-block" disabled={busy}>
                {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Enviar enlace"}
              </button>
              <button
                type="button"
                className="k-link"
                onClick={() => {
                  setError(null);
                  setMode(mode === "login" ? "recover" : "login");
                }}
              >
                {mode === "login" ? "¿Olvidaste tu contraseña?" : "Volver a entrar"}
              </button>
              <p className="k-small">
                <a className="k-link" href={helpPath()} target="_blank" rel="noreferrer">
                  ¿Necesitas ayuda? Abre la guía
                </a>
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
