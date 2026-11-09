import { readSocialLinks, SOCIAL_LABEL, type SocialNetwork } from "@konnecttia/domain";

export type PublicSocialLink = {
  readonly red: SocialNetwork;
  readonly label: string;
  readonly url: string;
};

/**
 * Redes que muestra la carta pública. La API ya filtra, pero aquí se vuelve a validar: un enlace
 * que no sea https nunca llega a un `href`. «Google (ficha del negocio)» se acorta a «Google».
 */
export function publicSocialLinks(
  stored: readonly { readonly red: string; readonly url: string }[] | undefined,
): readonly PublicSocialLink[] {
  return readSocialLinks(stored).map((link) => ({
    red: link.red,
    label: SOCIAL_LABEL[link.red].replace(/ \(.*\)$/, ""),
    url: link.url,
  }));
}

/** Logo que se puede pintar: solo una URL https. */
export function publicLogo(url: string | null | undefined): string | null {
  const value = url?.trim() ?? "";
  return /^https:\/\//.test(value) ? value : null;
}
