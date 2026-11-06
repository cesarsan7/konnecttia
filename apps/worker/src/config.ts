import { ORDER_STATUS } from "@konnecttia/domain";
import type { Sql } from "./db";

/** Claves de `restaurante_config` que lee el worker (documentadas en `config_clave`, migración 0025). */
export const CONFIG_KEY = {
  LocalEnabled: "avisos_email_local_activo",
  LocalRecipients: "avisos_email_local",
  CustomerEnabled: "avisos_email_cliente_activo",
  CustomerStatuses: "avisos_email_cliente_estados",
} as const;

/** Estados que avisan al cliente si el restaurante no configura la lista. */
export const DEFAULT_CUSTOMER_STATUSES: readonly string[] = [
  ORDER_STATUS.Confirmed,
  ORDER_STATUS.Ready,
  ORDER_STATUS.OnTheWay,
  ORDER_STATUS.Cancelled,
];

/** Tope de direcciones por restaurante (evita que una clave mal escrita dispare cientos de envíos). */
export const MAX_LOCAL_RECIPIENTS = 10;

export type NoticeConfig = {
  readonly localEnabled: boolean;
  readonly localRecipients: readonly string[];
  readonly customerEnabled: boolean;
  readonly customerStatuses: ReadonlySet<string>;
};

/** Apagado por defecto: solo `true` enciende. */
export const parseFlag = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

const EMAIL_PATTERN = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

export const isEmail = (value: string): boolean => value.length <= 254 && EMAIL_PATTERN.test(value);

/** Lista de emails separados por coma, punto y coma o espacios: en minúsculas, sin repetidos ni inválidos. */
export function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  const unique = new Set<string>();
  for (const part of value.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (isEmail(email)) unique.add(email);
  }
  return [...unique].slice(0, MAX_LOCAL_RECIPIENTS);
}

/** Lista de estados separados por coma; sin clave (o vacía) valen los de por defecto. */
export function parseStatusList(value: string | undefined): Set<string> {
  const items = (value ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return new Set(items.length > 0 ? items : DEFAULT_CUSTOMER_STATUSES);
}

export function buildNoticeConfig(values: ReadonlyMap<string, string>): NoticeConfig {
  return {
    localEnabled: parseFlag(values.get(CONFIG_KEY.LocalEnabled)),
    localRecipients: parseEmailList(values.get(CONFIG_KEY.LocalRecipients)),
    customerEnabled: parseFlag(values.get(CONFIG_KEY.CustomerEnabled)),
    customerStatuses: parseStatusList(values.get(CONFIG_KEY.CustomerStatuses)),
  };
}

export async function loadNoticeConfig(sql: Sql, restauranteId: number): Promise<NoticeConfig> {
  const rows = await sql<{ config_key: string; config_value: string }[]>`
    SELECT config_key, config_value
    FROM   public.restaurante_config
    WHERE  restaurante_id = ${restauranteId}
      AND  config_key = ANY(${Object.values(CONFIG_KEY)}::text[])
  `;
  return buildNoticeConfig(new Map(rows.map((row) => [row.config_key, row.config_value])));
}
