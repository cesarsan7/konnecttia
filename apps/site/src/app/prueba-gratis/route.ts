import { NextResponse } from "next/server";
import { signupUrl } from "@/components/konnecttia/links";

/**
 * «Prueba gratis»: redirige al alta autoservicio del panel de EasyOrder (`/alta`). La URL se
 * arma en tiempo de ejecución con EASYORDER_PANEL_URL, igual que /acceder.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const target = signupUrl(process.env.EASYORDER_PANEL_URL);
  if (!target) {
    return new NextResponse("La prueba gratuita no está configurada.", { status: 503 });
  }
  return NextResponse.redirect(target, 307);
}
