import { NextResponse } from "next/server";

/**
 * Acceso de restaurantes: redirige al login del panel de EasyOrder. La URL se lee en tiempo de
 * ejecución (EASYORDER_PANEL_URL), así el mismo build sirve para staging y producción.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const target = process.env.EASYORDER_PANEL_URL;
  if (!target) {
    return new NextResponse("El acceso al panel no está configurado.", { status: 503 });
  }
  return NextResponse.redirect(target, 307);
}
