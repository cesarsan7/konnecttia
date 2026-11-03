import type { AccessContext } from "@konnecttia/access";
import type { Sql } from "./lib/db";
import type { Restaurant } from "./repositories/restaurants";

export type AuthenticatedUser = { readonly userId: string; readonly email: string | null };

/** Dependencias inyectadas: permiten probar la API con una base real y una autenticación falsa. */
export type AppDeps = {
  readonly sql: Sql;
  readonly verifyToken: (token: string) => Promise<AuthenticatedUser | null>;
  readonly now: () => Date;
  readonly clientIpHeader: string;
  readonly allowedOrigins: readonly string[];
};

export type AppEnv = {
  Variables: {
    requestId: string;
    restaurant: Restaurant;
    user: AuthenticatedUser;
    access: AccessContext;
  };
};
