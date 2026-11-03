"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { createPanelApi, type PanelApi } from "@/lib/panel/api";
import type { PanelConfig } from "@/lib/panel/types";

type PanelContextValue = {
  readonly supabase: SupabaseClient | null;
  readonly api: PanelApi;
  /** undefined mientras se lee la sesión guardada; null si no hay sesión. */
  readonly session: Session | null | undefined;
  readonly configured: boolean;
};

const PanelContext = createContext<PanelContextValue | null>(null);

let cachedClient: { key: string; client: SupabaseClient } | null = null;

/** Un único cliente de Supabase por pestaña (evita varias escuchas de la misma sesión). */
function supabaseFor(config: PanelConfig): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  const key = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (cachedClient?.key !== key) {
    cachedClient = {
      key,
      client: createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }),
    };
  }
  return cachedClient.client;
}

export function PanelProvider({
  config,
  children,
}: {
  readonly config: PanelConfig;
  readonly children: ReactNode;
}) {
  const supabase = supabaseFor(config);
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const api = useMemo(
    () =>
      createPanelApi(config.apiUrl, async () => {
        if (!supabase) return null;
        // getSession renueva el token si ha caducado.
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      }),
    [config.apiUrl, supabase],
  );

  const value = useMemo(
    () => ({ supabase, api, session, configured: supabase !== null }),
    [supabase, api, session],
  );
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelContextValue {
  const value = useContext(PanelContext);
  if (!value) throw new Error("usePanel fuera de PanelProvider");
  return value;
}
