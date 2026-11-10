"use client";

import { resolveCountry } from "@konnecttia/domain";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  EMPTY_OPENING_DATA,
  type FormErrors,
  invitationLink,
  type NewRestaurantForm,
  platformErrorMessage,
  suggestSlug,
  toNewRestaurantBody,
  validateNewRestaurant,
} from "@/lib/interno/logic";
import type { CreatedRestaurant } from "@/lib/interno/types";
import { CountrySelect } from "../CountrySelect";
import { usePlatform } from "./InternalShell";
import { InviteLink } from "./InviteLink";
import "./new-restaurant.css";
import { HelpNote } from "@/components/HelpNote";
import { INTERNO_HELP } from "@/lib/interno/help";

const EMPTY: NewRestaurantForm = {
  nombre: "",
  slug: "",
  zonaHoraria: "",
  clonarDe: "",
  copiarCarta: true,
  copiarHorario: true,
  copiarReparto: true,
  copiarAjustes: true,
  pais: "",
  plan: "",
  localNombre: "",
  direccion: "",
  telefono: "",
  propietarioEmail: "",
  ...EMPTY_OPENING_DATA,
};

type Plans = readonly { readonly code: string; readonly nombre: string }[];

export function NewRestaurant() {
  const { api, canWrite } = usePlatform();
  const [form, setForm] = useState<NewRestaurantForm>(EMPTY);
  // Mientras no se toquen a mano, el enlace y el local siguen al nombre del restaurante.
  const [slugTouched, setSlugTouched] = useState(false);
  const [localTouched, setLocalTouched] = useState(false);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [sources, setSources] = useState<
    readonly { id: number; nombre: string; slug: string | null }[]
  >([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedRestaurant | null>(null);

  useEffect(() => {
    let active = true;
    void api.restaurants("").then((result) => {
      if (active && result.ok) {
        setPlans(result.data.planes);
        setSources(result.data.restaurantes.map(({ id, nombre, slug }) => ({ id, nombre, slug })));
      }
    });
    // «Clonar» desde la ficha de un restaurante llega con ?clonar=<id>.
    const wanted = new URLSearchParams(window.location.search).get("clonar");
    if (wanted && /^\d+$/.test(wanted)) {
      setForm((current) => (current.clonarDe ? current : { ...current, clonarDe: wanted }));
    }
    // La zona horaria del navegador es solo una sugerencia: se puede cambiar.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setForm((current) => (current.zonaHoraria ? current : { ...current, zonaHoraria: zone ?? "" }));
    return () => {
      active = false;
    };
  }, [api]);

  const set = <K extends keyof NewRestaurantForm>(key: K, value: NewRestaurantForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function setName(nombre: string) {
    setForm((current) => ({
      ...current,
      nombre,
      slug: slugTouched ? current.slug : suggestSlug(nombre),
      localNombre: localTouched ? current.localNombre : nombre,
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found = validateNewRestaurant(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const result = await api.createRestaurant(toNewRestaurantBody(form));
    setBusy(false);
    if (result.ok) {
      setCreated(result.data);
      return;
    }
    const field = result.body?.reason?.startsWith("slug_") ? "slug" : null;
    const message = platformErrorMessage(result.status, result.body);
    if (field) setErrors({ slug: message });
    else setFormError(message);
  }

  function reset() {
    setCreated(null);
    setForm({ ...EMPTY, zonaHoraria: form.zonaHoraria, pais: form.pais });
    setSlugTouched(false);
    setLocalTouched(false);
    setErrors({});
  }

  if (!canWrite) {
    return (
      <div className="k-page">
        <p className="k-card">Tu rol es de consulta: no puedes dar de alta restaurantes.</p>
      </div>
    );
  }

  if (created) {
    const link = invitationLink(
      created.invitacion.enlace,
      created.invitacion.token,
      window.location.origin,
    );
    return (
      <div className="k-page k-nr">
        <section className="k-card k-nr-done" aria-labelledby="nr-done">
          <p className="k-eyebrow">Restaurante creado</p>
          <h1 id="nr-done" className="k-heading">
            {form.nombre.trim()}
          </h1>
          <p>
            Plan {created.plan}, con {created.modulos.length} módulos y su local principal. Falta
            que la persona propietaria acepte la invitación para entrar a su panel. Para cargar la
            carta, abre la ficha.
          </p>
          <h2 className="k-subtitle">Invitación de {created.invitacion.email}</h2>
          <p className="k-muted k-small">
            {created.invitacion.email_enviado
              ? "Ya le hemos enviado el enlace por email. Puedes copiarlo y mandárselo también."
              : "No se ha enviado ningún email (el envío no está configurado o falló). Copia el enlace y mándaselo."}{" "}
            Solo sirve para ese email y caduca en unos días.
          </p>
          <InviteLink link={link} />
          <div className="k-nr-actions">
            <Link href={`/interno/${created.id}`} className="k-btn k-btn-primary">
              Ver la ficha
            </Link>
            <button type="button" className="k-btn k-btn-secondary" onClick={reset}>
              Crear otro
            </button>
          </div>
        </section>
      </div>
    );
  }

  const field = (key: keyof NewRestaurantForm) =>
    errors[key] ? (
      <span className="k-field-error" role="alert">
        {errors[key]}
      </span>
    ) : null;

  return (
    <div className="k-page k-nr">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">Konnecttia</p>
          <h1 className="k-heading">Nuevo restaurante</h1>
        </div>
      </header>
      <HelpNote items={INTERNO_HELP.nuevo} />

      <form className="k-card k-nr-form" onSubmit={onSubmit} noValidate>
        <fieldset className="k-nr-group">
          <legend className="k-title">Partir de otro restaurante (opcional)</legend>
          <label className="k-field">
            <span>Restaurante de origen</span>
            <select value={form.clonarDe} onChange={(event) => set("clonarDe", event.target.value)}>
              <option value="">Empezar en blanco</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.nombre}
                  {source.slug ? ` (/${source.slug})` : ""}
                </option>
              ))}
            </select>
            <span className="k-hint-text k-small k-muted">
              Sirve de plantilla. Nunca se copian el nombre, enlace, teléfono, dirección, datos
              bancarios, logo, equipo, pedidos ni clientes.
            </span>
          </label>
          {form.clonarDe ? (
            <div className="k-nr-grid">
              {(
                [
                  ["copiarCarta", "Carta (categorías, productos, variantes y extras)"],
                  ["copiarHorario", "Horario"],
                  ["copiarReparto", "Zonas de reparto"],
                  ["copiarAjustes", "Ajustes (eslogan, color, mensajes, tiempos)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="k-check">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(event) => set(key, event.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="k-nr-group">
          <legend className="k-title">Restaurante</legend>
          <label className="k-field">
            <span>Nombre</span>
            <input
              type="text"
              required
              maxLength={120}
              value={form.nombre}
              onChange={(event) => setName(event.target.value)}
            />
            {field("nombre")}
          </label>
          <label className="k-field">
            <span>Enlace de la carta</span>
            <input
              type="text"
              required
              maxLength={40}
              autoCapitalize="none"
              spellCheck={false}
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                set("slug", event.target.value.toLowerCase());
              }}
            />
            <span className="k-hint-text k-small k-muted">
              La carta estará en easyorder…/{form.slug.trim() || "enlace"}. No se puede repetir.
            </span>
            {field("slug")}
          </label>
          <div className="k-nr-grid">
            <label className="k-field">
              <span>Zona horaria</span>
              <input
                type="text"
                required
                autoCapitalize="none"
                spellCheck={false}
                value={form.zonaHoraria}
                onChange={(event) => set("zonaHoraria", event.target.value)}
              />
              <span className="k-hint-text k-small k-muted">
                Nombre IANA, por ejemplo Atlantic/Canary. Revisa que sea la del restaurante.
              </span>
              {field("zonaHoraria")}
            </label>
            <CountrySelect
              value={resolveCountry(form.pais, form.zonaHoraria)}
              onChange={(code) => set("pais", code)}
            />
            <label className="k-field">
              <span>Plan</span>
              <select
                required
                value={form.plan}
                disabled={plans === null}
                onChange={(event) => set("plan", event.target.value)}
              >
                <option value="">{plans === null ? "Cargando…" : "Elige un plan"}</option>
                {(plans ?? []).map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.nombre}
                  </option>
                ))}
              </select>
              {field("plan")}
            </label>
          </div>
        </fieldset>

        <fieldset className="k-nr-group">
          <legend className="k-title">Local principal</legend>
          <label className="k-field">
            <span>Nombre del local</span>
            <input
              type="text"
              required
              maxLength={120}
              value={form.localNombre}
              onChange={(event) => {
                setLocalTouched(true);
                set("localNombre", event.target.value);
              }}
            />
            {field("localNombre")}
          </label>
          <div className="k-nr-grid">
            <label className="k-field">
              <span>
                Dirección <span className="k-optional">(opcional)</span>
              </span>
              <input
                type="text"
                maxLength={200}
                autoComplete="off"
                value={form.direccion}
                onChange={(event) => set("direccion", event.target.value)}
              />
              {field("direccion")}
            </label>
            <label className="k-field">
              <span>
                Teléfono <span className="k-optional">(opcional)</span>
              </span>
              <input
                type="tel"
                maxLength={30}
                autoComplete="off"
                value={form.telefono}
                onChange={(event) => set("telefono", event.target.value)}
              />
              {field("telefono")}
            </label>
          </div>
        </fieldset>

        <fieldset className="k-nr-group">
          <legend className="k-title">
            Para abrir al público <span className="k-optional">(opcional)</span>
          </legend>
          <p className="k-muted k-small k-nr-note">
            Todo se puede completar después en el panel del restaurante. Lo que no rellenes no se
            crea. Los festivos usan el horario del domingo.
          </p>
          <div className="k-nr-grid">
            <label className="k-field">
              <span>Latitud</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={form.lat}
                onChange={(event) => set("lat", event.target.value)}
              />
              {field("lat")}
            </label>
            <label className="k-field">
              <span>Longitud</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={form.lng}
                onChange={(event) => set("lng", event.target.value)}
              />
              {field("lng")}
            </label>
          </div>
          <span className="k-hint-text k-small k-muted">
            Clic derecho sobre el pin en Google Maps para copiar las coordenadas.
          </span>
          <div className="k-nr-grid">
            {(
              [
                ["semanaApertura", "Lunes a viernes: apertura"],
                ["semanaCierre", "Lunes a viernes: cierre"],
                ["findeApertura", "Sábado y domingo: apertura"],
                ["findeCierre", "Sábado y domingo: cierre"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="k-field">
                <span>{label}</span>
                <input
                  type="time"
                  value={form[key]}
                  onChange={(event) => set(key, event.target.value)}
                />
                {field(key)}
              </label>
            ))}
          </div>
          <label className="k-field">
            <span>Minutos para recoger</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.recogidaMinutos}
              onChange={(event) => set("recogidaMinutos", event.target.value)}
            />
            {field("recogidaMinutos")}
          </label>
          <div className="k-nr-grid">
            {(
              [
                ["radioKm", "Reparto: radio (km)"],
                ["tarifa", "Reparto: tarifa de envío (€)"],
                ["minimo", "Reparto: pedido mínimo (€)"],
                ["repartoMinutos", "Reparto: minutos"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="k-field">
                <span>{label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form[key]}
                  onChange={(event) => set(key, event.target.value)}
                />
                {field(key)}
              </label>
            ))}
          </div>
          <fieldset className="k-nr-checks">
            <legend className="k-small k-muted">Métodos de cobro</legend>
            <label className="k-nr-check">
              <input
                type="checkbox"
                checked={form.efectivo}
                onChange={(event) => set("efectivo", event.target.checked)}
              />
              <span>Efectivo</span>
            </label>
            <label className="k-nr-check">
              <input
                type="checkbox"
                checked={form.tarjeta}
                onChange={(event) => set("tarjeta", event.target.checked)}
              />
              <span>Tarjeta</span>
            </label>
          </fieldset>
          <span className="k-hint-text k-small k-muted">
            Transferencia y Bizum los configura el propietario en Ajustes, con su IBAN o teléfono.
          </span>
          {field("efectivo")}
        </fieldset>

        <fieldset className="k-nr-group">
          <legend className="k-title">Antifraude en el pedido web</legend>
          <p className="k-muted k-small k-nr-note">
            Código de verificación por WhatsApp, solo cuando el pedido tiene riesgo: teléfono sin
            pedidos entregados, reparto pagado en efectivo o importe alto. Se envía desde el número
            de Konnecttia y cuesta unos 0,017 € por código, con un tope mensual por restaurante.
          </p>
          <fieldset className="k-nr-checks">
            <legend className="k-sr-only">Código de verificación</legend>
            <label className="k-nr-check">
              <input
                type="radio"
                name="codigo-verificacion"
                checked={form.codigoVerificacion === "whatsapp"}
                onChange={() => set("codigoVerificacion", "whatsapp")}
              />
              <span>WhatsApp (recomendado)</span>
            </label>
            <label className="k-nr-check">
              <input
                type="radio"
                name="codigo-verificacion"
                checked={form.codigoVerificacion === "apagado"}
                onChange={() => set("codigoVerificacion", "apagado")}
              />
              <span>Apagado</span>
            </label>
          </fieldset>
          <span className="k-hint-text k-small k-muted">
            Se puede cambiar después desde la ficha del restaurante, junto con el importe y el tope.
          </span>
        </fieldset>

        <fieldset className="k-nr-group">
          <legend className="k-title">Persona propietaria</legend>
          <label className="k-field">
            <span>Email</span>
            <input
              type="email"
              required
              inputMode="email"
              autoComplete="off"
              value={form.propietarioEmail}
              onChange={(event) => set("propietarioEmail", event.target.value)}
            />
            <span className="k-hint-text k-small k-muted">
              Le llega una invitación con el rol Propietario. Solo ese email podrá aceptarla.
            </span>
            {field("propietarioEmail")}
          </label>
        </fieldset>

        {formError ? (
          <p className="k-alert" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="k-nr-actions">
          <button type="submit" className="k-btn k-btn-primary" disabled={busy}>
            {busy ? "Creando…" : "Crear restaurante"}
          </button>
          <Link href="/interno" className="k-btn k-btn-secondary">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
