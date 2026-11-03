import { NextResponse } from "next/server";
import { demoRequestEmail, demoRequestSchema } from "@/lib/demo-request";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_REQUESTS_PER_WINDOW = 5;
const WINDOW_MS = 10 * 60 * 1000;

// Límite sencillo por IP para frenar abusos del formulario (una instancia).
const recentByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recentByIp.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
  hits.push(now);
  recentByIp.set(ip, hits);
  return hits.length > MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: Request) {
  // Detrás de Traefik, X-Real-IP lo fija el proxy; no se confía en X-Forwarded-For del cliente.
  const ip = request.headers.get("x-real-ip") ?? "desconocida";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Prueba más tarde." },
      { status: 429 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = demoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Revisa los datos del formulario.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (parsed.data.website) {
    return NextResponse.json({ ok: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DEMO_REQUEST_TO;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !to || !from) {
    return NextResponse.json(
      { error: "El formulario aún no está activo. Escríbenos por WhatsApp o correo." },
      { status: 503 },
    );
  }

  const email = demoRequestEmail(parsed.data);
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: email.subject, text: email.text }),
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "No pudimos enviar tu solicitud. Inténtalo de nuevo en unos minutos." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
