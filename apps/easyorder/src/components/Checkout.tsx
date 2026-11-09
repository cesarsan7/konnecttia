"use client";

import { addCents, type Cents, centsFromDecimal } from "@konnecttia/domain";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Api } from "@/lib/api";
import { type CartLine, lineCents, setQuantity, toOrderItems } from "@/lib/cart";
import {
  consentFields,
  describeApiError,
  describeZoneFee,
  emailProblem,
  normalizeEmail,
  normalizePhone,
  paymentLabel,
  privacyHref,
  privacyProblem,
  readRememberedEmail,
  rememberEmail,
} from "@/lib/checkout";
import { eurosFromCents } from "@/lib/format";
import { captchaFields, captchaProblem } from "@/lib/turnstile";
import type { Branch, CreatedOrder, DeliveryZone, Fulfillment, Menu } from "@/lib/types";
import { totalForCode } from "@/lib/verification";
import { CodeVerification } from "./CodeVerification";
import { TurnstileWidget } from "./TurnstileWidget";
import "./checkout-consent.css";

type Point = { readonly lat: number; readonly lng: number };

type Props = {
  readonly api: Api;
  readonly slug: string;
  /** Clave pública de Turnstile (la página la lee en el servidor); null = sin captcha. */
  readonly captchaSiteKey: string | null;
  readonly restaurant: Menu["restaurante"];
  readonly branches: readonly Branch[];
  readonly branchId: number | null;
  readonly onBranchChange: (id: number) => void;
  readonly zones: readonly DeliveryZone[];
  readonly point: Point | null;
  readonly locating: boolean;
  readonly onLocate: () => void;
  readonly lines: readonly CartLine[];
  readonly onLinesChange: (lines: CartLine[]) => void;
  readonly subtotal: Cents;
  readonly onBack: () => void;
  readonly onCreated: (order: CreatedOrder) => void;
};

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Checkout en una pantalla: carrito, entrega, datos y pago. */
export function Checkout(props: Props) {
  const { restaurant, branches, zones, lines, subtotal } = props;
  const formId = useId();
  const options: Fulfillment[] = [
    ...(restaurant.recogida ? (["retiro"] as const) : []),
    ...(restaurant.reparto ? (["delivery"] as const) : []),
  ];
  const [fulfillment, setFulfillment] = useState<Fulfillment>(options[0] ?? "retiro");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Rellena el email recordado en este navegador (si hay); el cliente puede cambiarlo.
  useEffect(() => {
    const remembered = readRememberedEmail(() => window.localStorage);
    if (remembered) setEmail((current) => current || remembered);
  }, []);
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [payment, setPayment] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  // Sin marcar de salida: la política es obligatoria y las promociones, voluntarias.
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [promotions, setPromotions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Captcha invisible (opcional): sin clave del sitio no se carga nada.
  const { captchaSiteKey } = props;
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaLoadFailed, setCaptchaLoadFailed] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  // Antifraude capa 3: el servidor pidió un código; `codeTotal` es el total con el que decidió.
  const [codeTotal, setCodeTotal] = useState<number | null>(null);
  const [submitWhenReady, setSubmitWhenReady] = useState(false);
  // Misma clave en los reintentos: si la red falla tras crear el pedido, no se duplica.
  const idempotencyKey = useRef(newKey());

  const pickupBranches = branches.filter((branch) => branch.recogida);
  const zone = zones.find((candidate) => candidate.id === zoneId) ?? null;
  const minimum: Cents = zone ? centsFromDecimal(zone.minimo) : (0 as Cents);
  const missing = fulfillment === "delivery" && zone && subtotal < minimum ? minimum - subtotal : 0;
  const freeDelivery =
    zone?.gratis_desde != null && subtotal >= centsFromDecimal(zone.gratis_desde);
  // Envío conocido solo con tarifa fija; por km depende de la distancia y lo calcula el servidor.
  const knownFee: Cents | null =
    fulfillment !== "delivery"
      ? (0 as Cents)
      : !zone
        ? null
        : freeDelivery
          ? (0 as Cents)
          : zone.tipo_tarifa === "fija"
            ? centsFromDecimal(zone.envio)
            : null;
  const estimate = addCents(subtotal, knownFee ?? (0 as Cents));

  const problem = useMemo((): string | null => {
    if (lines.length === 0) return "Tu carrito está vacío.";
    if (!name.trim()) return "Escribe tu nombre.";
    if (!normalizePhone(phone)) return "Escribe un teléfono válido.";
    const emailIssue = emailProblem(email);
    if (emailIssue) return emailIssue;
    if (fulfillment === "retiro" && pickupBranches.length > 1 && props.branchId === null) {
      return "Elige el local donde recogerás el pedido.";
    }
    if (fulfillment === "delivery") {
      if (!address.trim()) return "Escribe la dirección de entrega.";
      if (zoneId === null && props.point === null) {
        return "Elige tu zona o usa tu ubicación para calcular el reparto.";
      }
      if (zone?.tipo_tarifa === "por_km" && props.point === null) {
        return "Esta zona cobra por distancia: pulsa «Usar mi ubicación» para calcular el envío.";
      }
      if (missing > 0) {
        return `Te faltan ${eurosFromCents(missing as Cents)} para el pedido mínimo de reparto. Añade algo más o cambia a recogida.`;
      }
    }
    if (!payment) return "Elige cómo vas a pagar.";
    return (
      privacyProblem(privacyAccepted) ??
      captchaProblem(captchaSiteKey !== null, captchaToken, captchaLoadFailed)
    );
  }, [
    lines.length,
    name,
    phone,
    email,
    fulfillment,
    pickupBranches.length,
    props.branchId,
    address,
    zoneId,
    zone?.tipo_tarifa,
    props.point,
    missing,
    payment,
    privacyAccepted,
    captchaSiteKey,
    captchaToken,
    captchaLoadFailed,
  ]);

  /** Pide un token de captcha nuevo (el anterior ya se usó) y espera a que llegue el siguiente. */
  const spendCaptcha = useCallback(() => {
    if (!captchaSiteKey) return;
    setCaptchaToken(null);
    setCaptchaReset((count) => count + 1);
  }, [captchaSiteKey]);

  async function submit() {
    if (problem || sending) return;
    setSending(true);
    setError(null);
    const body = {
      nombre: name.trim(),
      telefono: normalizePhone(phone),
      email: normalizeEmail(email),
      tipo_despacho: fulfillment,
      metodo_pago: payment,
      ...(notes.trim() ? { notas: notes.trim() } : {}),
      ...(fulfillment === "retiro" && props.branchId !== null
        ? { sucursal_id: props.branchId }
        : {}),
      ...(fulfillment === "delivery"
        ? {
            direccion: address.trim(),
            ...(zoneId !== null ? { zona_id: zoneId } : {}),
            // La ubicación se envía siempre que exista: elige local y calcula tarifas por km.
            ...(props.point ? { lat: props.point.lat, lng: props.point.lng } : {}),
          }
        : {}),
      ...consentFields(privacyAccepted, promotions),
      ...captchaFields(captchaToken),
      items: toOrderItems(lines),
    };
    const result = await props.api.createOrder(props.slug, body, idempotencyKey.current);
    setSending(false);
    if (result.ok) {
      setCodeTotal(null);
      rememberEmail(() => window.localStorage, normalizeEmail(email) ?? "");
      props.onCreated(result.data);
      return;
    }
    // El token del captcha es de un solo uso: el siguiente intento necesita uno nuevo.
    spendCaptcha();
    if (result.body?.error === "verification_required") {
      setCodeTotal(totalForCode(result.body, estimate / 100));
      return;
    }
    if (result.body?.error === "branch_required" && result.body.locales?.[0]) {
      setError("Elige en qué local quieres recoger el pedido.");
      return;
    }
    setError(describeApiError(result.status, result.body));
  }

  // Teléfono verificado: el pedido se reenvía en cuanto el captcha tenga su token nuevo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: submit se recrea en cada render
  useEffect(() => {
    if (!submitWhenReady || problem !== null || sending) return;
    setSubmitWhenReady(false);
    void submit();
  }, [submitWhenReady, problem, sending]);

  return (
    <section className="checkout" aria-labelledby={`${formId}-title`}>
      <div className="checkout-head">
        <button type="button" className="link-btn" onClick={props.onBack}>
          ← Seguir pidiendo
        </button>
        <h1 id={`${formId}-title`} className="title">
          Tu pedido
        </h1>
      </div>

      <ul className="lines">
        {lines.map((line) => (
          <li key={line.key} className="line">
            <div>
              <strong>{line.name}</strong>
              <span className="muted">
                {" "}
                · {line.variantName}
                {line.extras.length > 0 && ` · ${line.extras.map((e) => e.name).join(", ")}`}
              </span>
              {line.note && <div className="muted small">«{line.note}»</div>}
            </div>
            <div className="line-side">
              <fieldset className="stepper small" aria-label={`Cantidad de ${line.name}`}>
                <button
                  type="button"
                  aria-label="Quitar uno"
                  onClick={() =>
                    props.onLinesChange(setQuantity(lines, line.key, line.quantity - 1))
                  }
                >
                  −
                </button>
                <output>{line.quantity}</output>
                <button
                  type="button"
                  aria-label="Añadir uno"
                  onClick={() =>
                    props.onLinesChange(setQuantity(lines, line.key, line.quantity + 1))
                  }
                >
                  +
                </button>
              </fieldset>
              <span className="price">{eurosFromCents(lineCents(line))}</span>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {options.length > 1 && (
          <fieldset className="segmented">
            <legend>¿Cómo lo quieres?</legend>
            {options.map((option) => (
              <label key={option} className={fulfillment === option ? "on" : ""}>
                <input
                  type="radio"
                  name="fulfillment"
                  checked={fulfillment === option}
                  onChange={() => setFulfillment(option)}
                />
                {option === "retiro" ? "Recoger en el local" : "A domicilio"}
              </label>
            ))}
          </fieldset>
        )}

        {fulfillment === "retiro" && pickupBranches.length > 0 && (
          <fieldset className="group">
            <legend>Local de recogida</legend>
            {pickupBranches.map((branch) => (
              <label key={branch.id} className={`choice${branch.abierto ? "" : " disabled"}`}>
                <input
                  type="radio"
                  name="branch"
                  disabled={!branch.abierto}
                  checked={props.branchId === branch.id}
                  onChange={() => props.onBranchChange(branch.id)}
                />
                <span>
                  {branch.nombre}
                  {branch.direccion && (
                    <span className="muted small block">{branch.direccion}</span>
                  )}
                </span>
                <span className="muted small">
                  {branch.abierto
                    ? [
                        branch.distancia_km !== null ? `${branch.distancia_km} km` : null,
                        branch.tiempo_recogida ? `listo en ${branch.tiempo_recogida}` : "Abierto",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Cerrado"}
                </span>
              </label>
            ))}
            {pickupBranches.length > 1 && (
              <button
                type="button"
                className="link-btn"
                onClick={props.onLocate}
                disabled={props.locating}
              >
                {props.locating
                  ? "Buscando tu ubicación…"
                  : "Usar mi ubicación para ver el más cercano"}
              </button>
            )}
          </fieldset>
        )}

        {fulfillment === "delivery" && (
          <fieldset className="group">
            <legend>Entrega</legend>
            <label className="field">
              <span>Dirección</span>
              <input
                type="text"
                autoComplete="street-address"
                maxLength={300}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Calle, número, piso"
              />
            </label>
            {zones.length > 0 && (
              <label className="field">
                <span>Zona</span>
                <select
                  value={zoneId ?? ""}
                  onChange={(event) =>
                    setZoneId(event.target.value ? Number(event.target.value) : null)
                  }
                >
                  <option value="">{props.point ? "Según mi ubicación" : "Elige tu zona"}</option>
                  {zones.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.nombre} · {describeZoneFee(option)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="link-btn"
              onClick={props.onLocate}
              disabled={props.locating}
            >
              {props.locating
                ? "Buscando tu ubicación…"
                : props.point
                  ? "Ubicación recibida ✓ (actualizar)"
                  : "Usar mi ubicación"}
            </button>
            {missing > 0 && (
              <p className="notice" role="status">
                Te faltan {eurosFromCents(missing as Cents)} para el pedido mínimo de esta zona.{" "}
                {restaurant.recogida && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setFulfillment("retiro")}
                  >
                    Cambiar a recogida
                  </button>
                )}
              </p>
            )}
          </fieldset>
        )}

        <fieldset className="group">
          <legend>Tus datos</legend>
          <label className="field">
            <span>Nombre</span>
            <input
              type="text"
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Teléfono</span>
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="612 345 678"
            />
          </label>
          <label className="field">
            <span>Email (para avisarte de tu pedido)</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@email.com"
            />
          </label>
          <label className="field">
            <span>Notas para el local (opcional)</span>
            <textarea
              maxLength={500}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="group">
          <legend>Pago</legend>
          {restaurant.metodos_pago.map((method) => (
            <label key={method} className="choice">
              <input
                type="radio"
                name="payment"
                checked={payment === method}
                onChange={() => setPayment(method)}
              />
              <span>{paymentLabel(method)}</span>
            </label>
          ))}
          {payment === "transferencia" && (
            <p className="muted small">
              Te daremos los datos para la transferencia. El pedido queda pendiente hasta que el
              local confirme el pago.
            </p>
          )}
        </fieldset>

        <dl className="totals">
          <div>
            <dt>Productos</dt>
            <dd>{eurosFromCents(subtotal)}</dd>
          </div>
          {fulfillment === "delivery" && (
            <div>
              <dt>Envío</dt>
              <dd>{knownFee !== null ? eurosFromCents(knownFee) : "Se calcula al confirmar"}</dd>
            </div>
          )}
          <div className="total">
            <dt>Total estimado</dt>
            <dd>{eurosFromCents(estimate)}</dd>
          </div>
        </dl>
        <p className="muted small">
          El total final lo calcula el local al confirmar (puede incluir suplementos como envases).
        </p>

        <fieldset className="group consent">
          <legend>Privacidad</legend>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(event) => setPrivacyAccepted(event.target.checked)}
              aria-required="true"
            />
            <span>
              He leído y acepto la{" "}
              <a
                href={privacyHref(props.slug, restaurant.privacidad_url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                política de privacidad
              </a>
              .
            </span>
          </label>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={promotions}
              onChange={(event) => setPromotions(event.target.checked)}
            />
            <span>Quiero recibir promociones de {restaurant.nombre}.</span>
          </label>
          <p className="muted small">
            Usaremos tus datos para gestionar este pedido. Las promociones son opcionales y puedes
            retirarlas cuando quieras.
          </p>
        </fieldset>

        {captchaSiteKey && (
          <TurnstileWidget
            siteKey={captchaSiteKey}
            resetKey={captchaReset}
            onToken={setCaptchaToken}
            onLoadError={() => setCaptchaLoadFailed(true)}
          />
        )}

        {(error || problem) && (
          <p className={error ? "error" : "hint"} role={error ? "alert" : "status"}>
            {error ?? problem}
          </p>
        )}
        {codeTotal !== null ? (
          <CodeVerification
            api={props.api}
            slug={props.slug}
            restaurantName={restaurant.nombre}
            phone={normalizePhone(phone) ?? phone}
            fulfillment={fulfillment}
            payment={payment ?? ""}
            totalEuros={codeTotal}
            captchaToken={captchaToken}
            captchaWaiting={captchaProblem(
              captchaSiteKey !== null,
              captchaToken,
              captchaLoadFailed,
            )}
            onTokenSpent={spendCaptcha}
            onVerified={() => {
              setCodeTotal(null);
              setSubmitWhenReady(true);
            }}
            onCancel={() => setCodeTotal(null)}
          />
        ) : (
          <button
            type="submit"
            className="btn primary block"
            disabled={problem !== null || sending}
          >
            {sending ? "Enviando…" : "Enviar pedido"}
          </button>
        )}
      </form>
    </section>
  );
}
