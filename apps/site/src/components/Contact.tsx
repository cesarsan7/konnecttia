"use client";

import { type FormEvent, useState } from "react";
import { CONTACT } from "@/content/site";
import { PRODUCT_INTEREST } from "@/lib/demo-request";

const STATUS = {
  Idle: "idle",
  Sending: "sending",
  Sent: "sent",
  Error: "error",
} as const;

type Status = (typeof STATUS)[keyof typeof STATUS];

const FIELD_CLASS =
  "mt-1.5 w-full rounded-xl border border-[#d8e3ed] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-[#8aa0b2] focus:border-sky focus:outline-none";

export function Contact() {
  const [status, setStatus] = useState<Status>(STATUS.Idle);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus(STATUS.Sending);
    setMessage("");
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: data.get("nombre"),
          negocio: data.get("negocio"),
          municipio: data.get("municipio"),
          contacto: data.get("contacto"),
          producto: data.get("producto"),
          mensaje: data.get("mensaje"),
          privacidad: data.get("privacidad") === "on",
          website: data.get("website"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus(STATUS.Error);
        setMessage(result.error ?? "No pudimos enviar tu solicitud.");
        return;
      }
      form.reset();
      setStatus(STATUS.Sent);
      setMessage("¡Gracias! Te contactaremos pronto para concretar la demo.");
    } catch {
      setStatus(STATUS.Error);
      setMessage("No pudimos enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo.");
    }
  }

  return (
    <section id="contacto" className="bg-navy py-20 text-white">
      <div className="wrap grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="mb-4 text-[11px] font-extrabold tracking-[0.13em] text-cyan uppercase">
            {CONTACT.eyebrow}
          </p>
          <h2 className="mb-4 text-[clamp(31px,3.8vw,46px)] leading-[1.14] font-extrabold tracking-[-0.045em] text-white">
            {CONTACT.title}
          </h2>
          <p className="mb-3 text-[15px] leading-[1.78] text-[#c7dceb]">{CONTACT.copy}</p>
          <p className="text-[14px] text-[#9fbfd6]">{CONTACT.assurance}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          aria-label="Solicitud de demo"
          className="rounded-[22px] bg-white p-6 text-ink md:p-8"
          noValidate={false}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-[13px] font-bold text-navy">
              Tu nombre
              <input
                name="nombre"
                required
                minLength={2}
                autoComplete="name"
                className={FIELD_CLASS}
              />
            </label>
            <label className="text-[13px] font-bold text-navy">
              Negocio
              <input
                name="negocio"
                required
                minLength={2}
                autoComplete="organization"
                className={FIELD_CLASS}
              />
            </label>
            <label className="text-[13px] font-bold text-navy">
              Municipio o isla
              <input name="municipio" required minLength={2} className={FIELD_CLASS} />
            </label>
            <label className="text-[13px] font-bold text-navy">
              Teléfono o correo electrónico
              <input name="contacto" required minLength={6} className={FIELD_CLASS} />
            </label>
            <label className="text-[13px] font-bold text-navy sm:col-span-2">
              ¿Qué te interesa?
              <select
                name="producto"
                required
                className={FIELD_CLASS}
                defaultValue={PRODUCT_INTEREST[0]}
              >
                {PRODUCT_INTEREST.map((product) => (
                  <option key={product} value={product}>
                    {product}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[13px] font-bold text-navy sm:col-span-2">
              ¿Qué te gustaría mejorar?
              <textarea
                name="mensaje"
                rows={3}
                maxLength={1000}
                placeholder="Cuéntanos brevemente cómo recibes los pedidos"
                className={FIELD_CLASS}
              />
            </label>
            {/* Campo trampa para bots: oculto a personas y lectores de pantalla. */}
            <div aria-hidden="true" className="hidden">
              <label>
                Web
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
          </div>
          <label className="mt-5 flex items-start gap-3 text-[13px] text-muted">
            <input
              name="privacidad"
              type="checkbox"
              required
              className="mt-1 size-4 accent-brand"
            />
            <span>
              He leído la{" "}
              <a href="/privacidad" className="font-bold text-ocean underline">
                política de privacidad
              </a>{" "}
              y acepto que Konnecttia use estos datos para responder a mi solicitud. No enviaremos
              publicidad sin tu permiso.
            </span>
          </label>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="submit" className="btn" disabled={status === STATUS.Sending}>
              {status === STATUS.Sending ? "Enviando…" : "Solicitar una demo"}{" "}
              <span aria-hidden="true">→</span>
            </button>
            <p
              role="status"
              aria-live="polite"
              className={`text-[14px] font-bold ${status === STATUS.Error ? "text-red-700" : "text-ocean"}`}
            >
              {message}
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}
