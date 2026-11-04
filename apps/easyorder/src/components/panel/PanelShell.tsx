"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { PanelAccess } from "@/lib/panel/types";
import { EasyOrderLockup } from "./Brand";
import { Icon, type IconName } from "./Icon";
import { rememberRestaurant } from "./LoginScreen";
import { usePanel } from "./PanelProvider";

export const PERMISSION = {
  OrdersView: "orders.view",
  OrdersChangeStatus: "orders.change_status",
  OrdersUpdate: "orders.update",
  AnalyticsView: "analytics.view",
  MenuView: "menu.view",
  MenuCreate: "menu.create",
  MenuUpdate: "menu.update",
  MenuDelete: "menu.delete",
  SettingsView: "settings.view",
  SettingsUpdate: "settings.update",
  DeliveryView: "delivery.view",
  DeliveryManage: "delivery.manage",
} as const;

type AccessValue = {
  readonly slug: string;
  readonly access: PanelAccess;
  readonly can: (permission: string) => boolean;
};

const AccessContext = createContext<AccessValue | null>(null);

export function useAccess(): AccessValue {
  const value = useContext(AccessContext);
  if (!value) throw new Error("useAccess fuera de PanelShell");
  return value;
}

type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  readonly permission?: string;
  readonly soon?: boolean;
};

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly access: PanelAccess }
  | { readonly kind: "error"; readonly status: number };

export function PanelShell({ children }: { readonly children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { api, session, supabase } = usePanel();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (session === null) router.replace("/panel");
  }, [session, router]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    api.access(slug).then((result) => {
      if (!active) return;
      if (result.ok) {
        rememberRestaurant(slug);
        setState({ kind: "ready", access: result.data });
      } else {
        setState({ kind: "error", status: result.status });
      }
    });
    return () => {
      active = false;
    };
  }, [api, session, slug]);

  if (session === undefined || state.kind === "loading") {
    return (
      <div className="k-center-page" aria-busy="true">
        <p className="k-muted">Cargando el panel…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="k-center-page">
        <div className="k-card k-login-card">
          <EasyOrderLockup />
          <h1 className="k-title">
            {state.status === 403
              ? "Tu usuario no tiene acceso a este restaurante"
              : state.status === 404
                ? "No encontramos este restaurante"
                : "No pudimos cargar el panel"}
          </h1>
          <p className="k-muted">
            {state.status === 0
              ? "Revisa la conexión e inténtalo de nuevo."
              : "Si crees que es un error, escríbenos a hola@konnecttia.com."}
          </p>
          <button
            type="button"
            className="k-btn k-btn-secondary"
            onClick={async () => {
              await supabase?.auth.signOut();
              router.replace("/panel");
            }}
          >
            Entrar con otra cuenta
          </button>
        </div>
      </main>
    );
  }

  const access = state.access;
  const permissions = new Set(access.permisos);
  const can = (permission: string) => permissions.has(permission);
  const base = `/panel/${slug}`;
  const nav: NavItem[] = [
    { href: base, label: "Pedidos", icon: "orders", permission: PERMISSION.OrdersView },
    {
      href: `${base}/estadisticas`,
      label: "Estadísticas",
      icon: "chart",
      permission: PERMISSION.AnalyticsView,
    },
    { href: `${base}/carta`, label: "Carta", icon: "menu", permission: PERMISSION.MenuView },
    {
      href: `${base}/ajustes`,
      label: "Ajustes",
      icon: "settings",
      permission: PERMISSION.SettingsView,
    },
  ];

  return (
    <AccessContext.Provider value={{ slug, access, can }}>
      <div className="k-app">
        <a className="k-skip" href="#contenido">
          Saltar al contenido
        </a>
        <aside className="k-sidebar">
          <Link href={base} className="k-sidebar-brand" aria-label="EasyOrder, pedidos">
            <EasyOrderLockup />
          </Link>
          <div className="k-restaurant">
            <span className="k-eyebrow">Restaurante</span>
            <strong>{access.restaurante.nombre}</strong>
            <span className="k-muted k-small">
              {access.roles.map((rol) => rol.nombre).join(", ")}
            </span>
          </div>
          <nav className="k-nav" aria-label="Secciones del panel">
            {nav.map((item) => {
              const current = pathname === item.href;
              const locked = item.permission !== undefined && !can(item.permission);
              if (item.soon) {
                return (
                  <span key={item.href} className="k-nav-item is-disabled" aria-disabled="true">
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    <span className="k-soon">Pronto</span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`k-nav-item${current ? " is-current" : ""}`}
                  aria-current={current ? "page" : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {locked ? <span className="k-soon">Premium</span> : null}
                </Link>
              );
            })}
          </nav>
          <div className="k-sidebar-foot">
            <a className="k-nav-item" href={`/${slug}`} target="_blank" rel="noreferrer">
              <Icon name="external" />
              <span>Ver carta online</span>
            </a>
            <div className="k-user">
              <span className="k-small k-muted k-ellipsis" title={access.usuario.email ?? ""}>
                {access.usuario.email}
              </span>
              <button
                type="button"
                className="k-link k-small"
                onClick={async () => {
                  await supabase?.auth.signOut();
                  router.replace("/panel");
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </aside>
        <main id="contenido" className="k-main">
          {children}
        </main>
        <nav className="k-tabbar" aria-label="Secciones del panel">
          {nav
            .filter((item) => !item.soon)
            .map((item) => {
              const current = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`k-tab${current ? " is-current" : ""}`}
                  aria-current={current ? "page" : undefined}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          <button
            type="button"
            className="k-tab"
            onClick={async () => {
              await supabase?.auth.signOut();
              router.replace("/panel");
            }}
          >
            <Icon name="logout" />
            <span>Salir</span>
          </button>
        </nav>
      </div>
    </AccessContext.Provider>
  );
}
