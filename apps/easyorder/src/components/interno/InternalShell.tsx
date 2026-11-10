"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PlatformApi } from "@/lib/interno/api";
import type { PlatformMe } from "@/lib/interno/types";
import { EasyOrderLockup } from "../panel/Brand";
import { usePanel } from "../panel/PanelProvider";
import { InternalLogin } from "./InternalLogin";
import "./internal-shell.css";

type PlatformValue = {
  readonly api: PlatformApi;
  readonly me: PlatformMe;
  /** Solo el rol «admin» escribe; «soporte» consulta. */
  readonly canWrite: boolean;
  /** Avisos breves (se ven abajo a la derecha). */
  readonly toast: (text: string, tone?: "ok" | "error") => void;
};

const PlatformContext = createContext<PlatformValue | null>(null);

export function usePlatform(): PlatformValue {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("usePlatform fuera de InternalShell");
  return value;
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly me: PlatformMe }
  | { readonly kind: "denied" }
  | { readonly kind: "error"; readonly status: number };

type Toast = { readonly id: number; readonly text: string; readonly tone: "ok" | "error" };

const ROLE_LABEL: Record<PlatformMe["rol"], string> = {
  admin: "Administración",
  soporte: "Soporte (solo lectura)",
};

/**
 * Marco del panel interno de Konnecttia: pide la sesión del panel, pregunta a la API si la
 * persona es del equipo (`/plataforma/yo`) y solo entonces enseña las pantallas. La frontera de
 * seguridad real está en la API: esto solo decide qué mostrar.
 */
export function InternalShell({ children }: { readonly children: ReactNode }) {
  const { platformApi, session, supabase, configured } = usePanel();
  const pathname = usePathname();
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4500);
  }, []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await platformApi.me();
    if (result.ok) setState({ kind: "ready", me: result.data });
    else if (result.status === 403) setState({ kind: "denied" });
    else setState({ kind: "error", status: result.status });
  }, [platformApi]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  const value = useMemo<PlatformValue | null>(
    () =>
      state.kind === "ready"
        ? { api: platformApi, me: state.me, canWrite: state.me.rol === "admin", toast }
        : null,
    [state, platformApi, toast],
  );

  if (session === undefined) {
    return (
      <div className="k-center-page" aria-busy="true">
        <p className="k-muted">Cargando…</p>
      </div>
    );
  }
  if (!configured || session === null) return <InternalLogin />;

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  if (state.kind === "loading") {
    return (
      <div className="k-center-page" aria-busy="true">
        <p className="k-muted">Comprobando tu acceso…</p>
      </div>
    );
  }
  if (state.kind === "denied" || state.kind === "error") {
    return (
      <main className="k-center-page">
        <div className="k-card k-login-card">
          <EasyOrderLockup />
          <h1 className="k-title">
            {state.kind === "denied"
              ? "No tienes acceso al panel interno"
              : "No pudimos cargar el panel interno"}
          </h1>
          <p className="k-muted">
            {state.kind === "denied"
              ? "Este panel es solo para el equipo de Konnecttia. Si trabajas en un restaurante, entra por tu panel."
              : state.status === 0
                ? "Revisa la conexión e inténtalo de nuevo."
                : "Inténtalo de nuevo en unos segundos."}
          </p>
          <div className="k-internal-actions">
            {state.kind === "error" ? (
              <button type="button" className="k-btn k-btn-primary" onClick={() => void load()}>
                Reintentar
              </button>
            ) : null}
            <Link href="/panel" className="k-btn k-btn-secondary">
              Ir a mi panel
            </Link>
            <button type="button" className="k-btn k-btn-secondary" onClick={signOut}>
              Entrar con otra cuenta
            </button>
          </div>
        </div>
      </main>
    );
  }
  if (!value) return null;

  const onList = pathname === "/interno";
  const onNew = pathname === "/interno/nuevo";
  const onTrials = pathname === "/interno/pruebas";
  const onSignup = pathname === "/interno/alta";
  const onTemplates = pathname === "/interno/plantillas";
  const onTeam = pathname === "/interno/equipo";
  return (
    <PlatformContext.Provider value={value}>
      <div className="k-internal">
        <header className="k-internal-bar">
          <Link href="/interno" className="k-internal-brand" aria-label="Panel interno, inicio">
            <EasyOrderLockup compact />
            <span className="k-internal-tag">Interno</span>
          </Link>
          <nav className="k-internal-nav" aria-label="Panel interno">
            <Link
              href="/interno"
              className={`k-internal-link${onList ? " is-current" : ""}`}
              aria-current={onList ? "page" : undefined}
            >
              Restaurantes
            </Link>
            <Link
              href="/interno/pruebas"
              className={`k-internal-link${onTrials ? " is-current" : ""}`}
              aria-current={onTrials ? "page" : undefined}
            >
              Pruebas
            </Link>
            <Link
              href="/interno/plantillas"
              className={`k-internal-link${onTemplates ? " is-current" : ""}`}
              aria-current={onTemplates ? "page" : undefined}
            >
              Plantillas de roles
            </Link>
            <Link
              href="/interno/equipo"
              className={`k-internal-link${onTeam ? " is-current" : ""}`}
              aria-current={onTeam ? "page" : undefined}
            >
              Equipo
            </Link>
            <Link
              href="/interno/alta"
              className={`k-internal-link${onSignup ? " is-current" : ""}`}
              aria-current={onSignup ? "page" : undefined}
            >
              Configuración del alta
            </Link>
            {value.canWrite ? (
              <Link
                href="/interno/nuevo"
                className={`k-internal-link${onNew ? " is-current" : ""}`}
                aria-current={onNew ? "page" : undefined}
              >
                Nuevo restaurante
              </Link>
            ) : null}
          </nav>
          <div className="k-internal-user">
            <span className="k-small k-ellipsis">{value.me.email ?? "Equipo Konnecttia"}</span>
            <span className="k-muted k-small">{ROLE_LABEL[value.me.rol]}</span>
            <button type="button" className="k-link k-small" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="k-internal-main">{children}</main>
        <div className="k-toasts" aria-live="polite">
          {toasts.map((item) => (
            <p key={item.id} className={`k-toast is-${item.tone}`}>
              {item.text}
            </p>
          ))}
        </div>
      </div>
    </PlatformContext.Provider>
  );
}
