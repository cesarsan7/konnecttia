/**
 * El envío (Resend) y las plantillas viven en `@konnecttia/notifications`, compartido con el
 * worker. Este módulo conserva las rutas de importación de la API.
 */
export { createResendMailer, inviteEmail, recoveryEmail } from "@konnecttia/notifications";
