/** El último restaurante usado en este navegador va primero; el resto, por nombre. */
export function sortByLastUsed<T extends { readonly slug: string }>(
  list: readonly T[],
  last: string | null,
): T[] {
  const index = list.findIndex((item) => item.slug === last);
  if (index <= 0) return [...list];
  return [list[index] as T, ...list.slice(0, index), ...list.slice(index + 1)];
}
