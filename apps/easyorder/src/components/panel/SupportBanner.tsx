"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PanelAccess } from "@/lib/panel/types";
import { usePanel } from "./PanelProvider";
import "./support-banner.css";

const hourFormat = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

/** Banda fija del modo soporte de Konnecttia: solo lectura, hasta cierta hora, con salida. */
export function SupportBanner({
  support,
}: {
  readonly support: NonNullable<PanelAccess["soporte"]>;
}) {
  const { platformApi } = usePanel();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function leave() {
    setBusy(true);
    await platformApi.leaveSupport(support.restaurante_id);
    router.replace(`/interno/${support.restaurante_id}`);
  }

  return (
    <p className="k-support" role="status">
      <span>
        Modo soporte de Konnecttia · solo lectura · hasta las{" "}
        {hourFormat.format(new Date(support.expira_en))}. Motivo: {support.motivo}
      </span>
      <button
        type="button"
        className="k-btn k-btn-secondary k-btn-sm"
        disabled={busy}
        onClick={leave}
      >
        Salir
      </button>
    </p>
  );
}
