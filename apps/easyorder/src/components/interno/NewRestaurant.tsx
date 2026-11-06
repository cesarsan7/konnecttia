"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import {
  type FormErrors,
  invitationLink,
  type NewRestaurantForm,
  platformErrorMessage,
  suggestSlug,
  toNewRestaurantBody,
  validateNewRestaurant,
} from "@/lib/interno/logic";
import type { CreatedRestaurant } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import { InviteLink } from "./InviteLink";
import "./new-restaurant.css";

const EMPTY: NewRestaurantForm = {
  nombre: "",
  slug: "",
  zonaHoraria: "",
  plan: "",
  localNombre: "",
  direccion: "",
  telefono: "",
  propietarioEmail: "",
};

type Plans = readonly { readonly code: string; readonly nombre: string }[];

export function NewRestaurant() {
  const { api, canWrite } = usePlatform();
  const [form, setForm] = useState<NewRestaurantForm>(EMPTY);
  // Mientras no se toquen a mano, el enlace y el local siguen al nombre del restaurante.
  const [slugTouched, setSlugTouched] = useState(false);
  const [localTouched, setLocalTouched] = useState(false);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedRestaurant | null>(null);

  useEffect(() => {
    let active = true;
    void api.restaurants("").then((result) => {
      if (active && result.ok) setPlans(result.data.planes);
    });
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
    setForm({ ...EMPTY, zonaHoraria: form.zonaHoraria });
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
            que la persona propietaria acepte la invitación para entrar a su panel.
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

      <form className="k-card k-nr-form" onSubmit={onSubmit} noValidate>
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
