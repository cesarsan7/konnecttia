import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Operaciones de administración sobre Supabase Auth (clave de servicio). Solo las usa el panel
 * interno: buscar a una persona por email para darle acceso y borrar una cuenta que ya no se usa.
 */
export type AuthAccount = {
  readonly id: string;
  readonly email: string | null;
  readonly createdAt: string;
  readonly lastSignInAt: string | null;
};

export type AuthAdmin = {
  readonly findByEmail: (email: string) => Promise<AuthAccount | null>;
  readonly listAccounts: () => Promise<AuthAccount[]>;
  readonly deleteAccount: (id: string) => Promise<boolean>;
};

const PAGE = 200;
/** Tope de cuentas que se recorren (más de esto exige otra estrategia, no un barrido). */
const MAX_ACCOUNTS = 5000;

export function createAuthAdmin(admin: SupabaseClient): AuthAdmin {
  const listAccounts = async () => {
    const accounts: AuthAccount[] = [];
    for (let page = 1; accounts.length < MAX_ACCOUNTS; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) throw new Error("auth_list_failed");
      for (const user of data.users) {
        accounts.push({
          id: user.id,
          email: user.email ?? null,
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at ?? null,
        });
      }
      if (data.users.length < PAGE) break;
    }
    return accounts;
  };
  return {
    listAccounts,
    findByEmail: async (email) => {
      const wanted = email.trim().toLowerCase();
      return (await listAccounts()).find((a) => a.email?.toLowerCase() === wanted) ?? null;
    },
    deleteAccount: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      return !error;
    },
  };
}
