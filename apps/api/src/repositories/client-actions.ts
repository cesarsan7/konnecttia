/**
 * Acciones que el restaurante permite al cliente desde el enlace de seguimiento del pedido.
 * Sin clave, o con cualquier valor distinto de «false», la acción está permitida (así no cambia
 * el comportamiento de los restaurantes que no las han configurado).
 */
export function clientActionAllowed(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() !== "false";
}
