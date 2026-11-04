import { NextResponse } from "next/server";

/**
 * Comprobación de salud para EasyPanel. Indica si el acceso al panel está configurado,
 * sin mostrar la URL ni ningún otro valor de entorno.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    panelAccess: Boolean(process.env.EASYORDER_PANEL_URL),
  });
}
