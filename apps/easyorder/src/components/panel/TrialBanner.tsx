"use client";

import { type Trial, trialBanner } from "@/lib/panel/trial";
import "./trial-banner.css";

/**
 * Aviso de la prueba gratuita, arriba del panel: días o pedidos que quedan, pendiente de
 * aprobación o prueba terminada («tus datos se conservan»). No se muestra si el restaurante no
 * está en prueba.
 */
export function TrialBanner({ trial }: { readonly trial: Trial | null }) {
  const banner = trialBanner(trial);
  if (!banner) return null;
  return (
    <p
      className={`k-trial k-trial-${banner.tone}`}
      role={banner.tone === "danger" ? "alert" : "status"}
    >
      <span>{banner.text}</span>
      {banner.contact ? (
        <>
          {" "}
          <a href={`mailto:${banner.contact}`} className="k-trial-contact">
            {banner.contact}
          </a>
          .
        </>
      ) : null}
    </p>
  );
}
