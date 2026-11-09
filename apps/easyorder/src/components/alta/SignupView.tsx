"use client";

import { resolveCountry } from "@konnecttia/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  cartaUrl,
  EMPTY_SIGNUP,
  hasErrors,
  LAST_STEP,
  SIGNUP_STEP,
  SIGNUP_STEP_LABELS,
  type SignupErrors,
  type SignupForm,
  type SignupStep,
  signupAuthMessage,
  signupErrorMessage,
  signupErrorStep,
  slugCheckMessage,
  suggestedTimeZone,
  suggestSlug,
  toSignupBody,
  trialLimitsText,
  validateStep,
} from "@/lib/alta/logic";
import type { AltaConfig } from "@/lib/alta/types";
import { slugMessage } from "@/lib/interno/logic";
import { captchaProblem } from "@/lib/turnstile";
import { CountrySelect } from "../CountrySelect";
import { EasyOrderLockup } from "../panel/Brand";
import { rememberRestaurant } from "../panel/LoginScreen";
import { usePanel } from "../panel/PanelProvider";
import { TurnstileWidget } from "../TurnstileWidget";
import "./alta.css";

/** Pausa tras la última tecla antes de comprobar la dirección web. */
const SLUG_CHECK_DELAY_MS = 350;

type ConfigState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly config: AltaConfig }
  | { readonly kind: "error" };

type SlugState =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "ok" }
  | { readonly kind: "bad"; readonly message: string };

/**
 * Alta autoservicio: landing corta → registro con email y contraseña (Supabase, con confirmación
 * de email) → asistente en tres pasos → panel. Si Konnecttia tiene el alta apagada, solo se ve el
 * aviso con el contacto.
 */
export function SignupView({ captchaSiteKey }: { readonly captchaSiteKey: string | null }) {
  const { publicApi, session, configured } = usePanel();
  const [state, setState] = useState<ConfigState>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await publicApi.altaConfig();
    setState(result.ok ? { kind: "ready", config: result.data } : { kind: "error" });
  }, [publicApi]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="k-center-page">
      <div className="k-card k-alta">
        <EasyOrderLockup />
        {!configured ? (
          <p className="k-alert" role="alert">
            El acceso no está configurado en este entorno.
          </p>
        ) : state.kind === "loading" || session === undefined ? (
          <p className="k-muted" aria-busy="true">
            Cargando…
          </p>
        ) : state.kind === "error" ? (
          <>
            <p className="k-alert" role="alert">
              No pudimos cargar el alta. Inténtalo de nuevo en unos segundos.
            </p>
            <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
              Reintentar
            </button>
          </>
        ) : !state.config.activa ? (
          <Closed contact={state.config.contacto} />
        ) : session ? (
          <Wizard config={state.config} captchaSiteKey={captchaSiteKey} />
        ) : (
          <Landing config={state.config} />
        )}
      </div>
    </main>
  );
}

function Closed({ contact }: { readonly contact: string | null }) {
  return (
    <>
      <h1 className="k-title">El alta está cerrada por ahora</h1>
      <p className="k-muted">
        {contact ? (
          <>
            Escríbenos a <a href={`mailto:${contact}`}>{contact}</a> y te ayudamos a empezar.
          </>
        ) : (
          "Vuelve a pasar más adelante."
        )}
      </p>
      <Link href="/panel" className="k-link k-small">
        ¿Ya tienes cuenta? Entra a tu panel
      </Link>
    </>
  );
}

// -------------------------------------------------------------------------------- landing y cuenta

function Landing({ config }: { readonly config: AltaConfig }) {
  const limits = trialLimitsText(config);
  return (
    <>
      <div>
        <h1 className="k-title k-alta-title">Prueba EasyOrder gratis</h1>
        <p className="k-muted">
          Crea la carta de tu restaurante y empieza a recibir pedidos por la web, sin comisión por
          pedido.
        </p>
        <ul className="k-alta-points">
          <li>
            {limits
              ? `La prueba dura ${limits}, lo que ocurra primero.`
              : "La prueba no tiene límite por ahora."}
          </li>
          <li>Tus datos se conservan cuando termine.</li>
          {config.requiere_aprobacion ? (
            <li>Revisamos cada solicitud antes de activar los pedidos.</li>
          ) : null}
        </ul>
      </div>
      <AccountForm />
    </>
  );
}

type AccountMode = "signup" | "login" | "check-email";

function AccountForm() {
  const { supabase } = usePanel();
  const [mode, setMode] = useState<AccountMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Al confirmar el email se vuelve aquí para seguir con el asistente.
        options: { emailRedirectTo: `${window.location.origin}/alta` },
      });
      setBusy(false);
      if (signUpError) return setError(signupAuthMessage(signUpError.message));
      // Con confirmación de email activa no hay sesión hasta abrir el enlace del correo.
      if (!data.session) setMode("check-email");
      return;
    }
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (loginError) setError(signupAuthMessage(loginError.message));
  }

  if (mode === "check-email") {
    return (
      <div role="status">
        <h2 className="k-title">Revisa tu correo</h2>
        <p className="k-muted">
          Te enviamos un enlace a <strong>{email}</strong> para confirmar tu cuenta. Ábrelo y
          volverás aquí para crear tu restaurante.
        </p>
        <button type="button" className="k-link k-small" onClick={() => setMode("signup")}>
          Usar otro email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="k-alta-form" noValidate>
      <div className="k-segment k-segment-sm">
        <button
          type="button"
          className={mode === "signup" ? "is-on" : ""}
          aria-pressed={mode === "signup"}
          onClick={() => setMode("signup")}
        >
          Crear cuenta
        </button>
        <button
          type="button"
          className={mode === "login" ? "is-on" : ""}
          aria-pressed={mode === "login"}
          onClick={() => setMode("login")}
        >
          Ya tengo cuenta
        </button>
      </div>
      {error ? (
        <p className="k-alert" role="alert">
          {error}
        </p>
      ) : null}
      <label className="k-field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label className="k-field">
        <span>Contraseña</span>
        <input
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button type="submit" className="k-btn k-btn-primary k-btn-block" disabled={busy}>
        {busy ? "Un momento…" : mode === "signup" ? "Crear cuenta y continuar" : "Entrar"}
      </button>
      {mode === "signup" ? null : (
        <a className="k-link" href="/panel?recuperar=1&volver=alta">
          ¿Olvidaste tu contraseña?
        </a>
      )}
    </form>
  );
}

// ------------------------------------------------------------------------------------- asistente

/** Zonas horarias que conoce el navegador, para el desplegable de sugerencias. */
function knownTimeZones(): readonly string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

function Wizard({
  config,
  captchaSiteKey,
}: {
  readonly config: AltaConfig;
  readonly captchaSiteKey: string | null;
}) {
  const { api, publicApi, supabase } = usePanel();
  const router = useRouter();
  const [step, setStep] = useState<SignupStep>(SIGNUP_STEP.Restaurant);
  const [form, setForm] = useState<SignupForm>(EMPTY_SIGNUP);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [slugState, setSlugState] = useState<SlugState>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [alreadyHasTrial, setAlreadyHasTrial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaLoadFailed, setCaptchaLoadFailed] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const zones = useMemo(() => knownTimeZones(), []);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  // La zona horaria del navegador, como sugerencia inicial.
  useEffect(() => {
    setForm((current) =>
      current.zonaHoraria ? current : { ...current, zonaHoraria: suggestedTimeZone() },
    );
  }, []);

  const set = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Comprobación en vivo de la dirección web (con pausa y descartando respuestas viejas).
  useEffect(() => {
    const slug = form.slug.trim();
    if (!slug) return setSlugState({ kind: "idle" });
    const local = slugMessage(slug);
    if (local) return setSlugState({ kind: "bad", message: local });
    setSlugState({ kind: "checking" });
    let active = true;
    const timer = setTimeout(async () => {
      const result = await publicApi.altaSlug(slug);
      if (!active) return;
      if (!result.ok) return setSlugState({ kind: "idle" });
      const message = slugCheckMessage(result.data);
      setSlugState(message ? { kind: "bad", message } : { kind: "ok" });
    }, SLUG_CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.slug, publicApi]);

  function changeName(value: string) {
    setForm((current) => ({
      ...current,
      nombre: value,
      // Mientras no se toque a mano, la dirección web y el nombre del local siguen al nombre.
      slug: slugTouched ? current.slug : suggestSlug(value),
      localNombre:
        current.localNombre === "" || current.localNombre === current.nombre
          ? value
          : current.localNombre,
    }));
  }

  function next(event: FormEvent) {
    event.preventDefault();
    const found = validateStep(step, form);
    setErrors(found);
    if (hasErrors(found)) return;
    if (step === SIGNUP_STEP.Restaurant) {
      if (slugState.kind === "bad") return;
      if (slugState.kind === "checking") {
        setErrors({ slug: "Estamos comprobando la dirección. Un momento." });
        return;
      }
    }
    setError(null);
    if (step < LAST_STEP) setStep((step + 1) as SignupStep);
    else void create();
  }

  function back() {
    setErrors({});
    setError(null);
    if (step > SIGNUP_STEP.Restaurant) setStep((step - 1) as SignupStep);
  }

  async function create() {
    // Todos los pasos se vuelven a validar antes de enviar.
    for (const candidate of [SIGNUP_STEP.Restaurant, SIGNUP_STEP.Branch, SIGNUP_STEP.Service]) {
      const found = validateStep(candidate, form);
      if (hasErrors(found)) {
        setStep(candidate);
        setErrors(found);
        return;
      }
    }
    const waiting = captchaProblem(captchaSiteKey !== null, captchaToken, captchaLoadFailed);
    if (waiting) return setError(waiting);
    setBusy(true);
    setError(null);
    const result = await api.signup(toSignupBody(form, captchaToken));
    setBusy(false);
    // El token del captcha es de un solo uso: el siguiente intento necesita uno nuevo.
    if (captchaSiteKey) setCaptchaReset((count) => count + 1);
    if (!result.ok) {
      setAlreadyHasTrial(result.body?.reason === "already_has_trial");
      setError(signupErrorMessage(result.status, result.body));
      const failedStep = signupErrorStep(result.body);
      if (failedStep !== null) setStep(failedStep);
      return;
    }
    rememberRestaurant(result.data.slug);
    router.replace(`/panel/${result.data.slug}`);
  }

  const lastStep = step === LAST_STEP;
  const slugHint =
    slugState.kind === "checking"
      ? "Comprobando…"
      : slugState.kind === "ok"
        ? "Disponible"
        : slugState.kind === "bad"
          ? slugState.message
          : null;

  return (
    <form onSubmit={next} noValidate className="k-alta-wizard">
      <div>
        <h1 className="k-title k-alta-title">Crea tu restaurante</h1>
        <ol className="k-alta-steps" aria-label="Pasos del alta">
          {SIGNUP_STEP_LABELS.map((label, index) => (
            <li
              key={label}
              className={index === step ? "is-current" : index < step ? "is-done" : ""}
              aria-current={index === step ? "step" : undefined}
            >
              <span className="k-alta-step-n">{index + 1}</span>
              <span className="k-alta-step-label">{label}</span>
            </li>
          ))}
        </ol>
      </div>

      {step === SIGNUP_STEP.Restaurant ? (
        <>
          <label className="k-field">
            <span>Nombre de tu restaurante</span>
            <input
              value={form.nombre}
              maxLength={120}
              autoComplete="organization"
              onChange={(event) => changeName(event.target.value)}
              aria-invalid={errors.nombre ? true : undefined}
              required
            />
            {errors.nombre ? <small className="k-alta-error">{errors.nombre}</small> : null}
          </label>
          <label className="k-field">
            <span>Dirección web de tu carta</span>
            <input
              value={form.slug}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setSlugTouched(true);
                set("slug", event.target.value.toLowerCase());
              }}
              aria-invalid={errors.slug || slugState.kind === "bad" ? true : undefined}
              aria-describedby="k-alta-slug-hint"
              required
            />
            <small
              id="k-alta-slug-hint"
              className={
                slugState.kind === "bad" || errors.slug
                  ? "k-alta-error"
                  : slugState.kind === "ok"
                    ? "k-alta-ok"
                    : "k-muted"
              }
              aria-live="polite"
            >
              {errors.slug ?? slugHint ?? cartaUrl(origin, form.slug)}
            </small>
            {slugState.kind === "ok" ? (
              <small className="k-muted">{cartaUrl(origin, form.slug)}</small>
            ) : null}
          </label>
          <label className="k-field">
            <span>
              Tu nombre <span className="k-muted k-optional">(opcional)</span>
            </span>
            <input
              value={form.miembroNombre}
              maxLength={80}
              autoComplete="name"
              onChange={(event) => set("miembroNombre", event.target.value)}
            />
            {errors.miembroNombre ? (
              <small className="k-alta-error">{errors.miembroNombre}</small>
            ) : null}
          </label>
        </>
      ) : null}

      {step === SIGNUP_STEP.Branch ? (
        <>
          <label className="k-field">
            <span>Nombre del local</span>
            <input
              value={form.localNombre}
              maxLength={120}
              onChange={(event) => set("localNombre", event.target.value)}
              aria-invalid={errors.localNombre ? true : undefined}
              required
            />
            {errors.localNombre ? (
              <small className="k-alta-error">{errors.localNombre}</small>
            ) : null}
          </label>
          <label className="k-field">
            <span>
              Dirección <span className="k-muted k-optional">(opcional)</span>
            </span>
            <input
              value={form.direccion}
              maxLength={200}
              autoComplete="street-address"
              onChange={(event) => set("direccion", event.target.value)}
            />
            {errors.direccion ? <small className="k-alta-error">{errors.direccion}</small> : null}
          </label>
          <label className="k-field">
            <span>
              Teléfono <span className="k-muted k-optional">(opcional)</span>
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={form.telefono}
              maxLength={30}
              autoComplete="tel"
              onChange={(event) => set("telefono", event.target.value)}
            />
            {errors.telefono ? <small className="k-alta-error">{errors.telefono}</small> : null}
          </label>
          <CountrySelect
            value={resolveCountry(form.pais, form.zonaHoraria)}
            onChange={(code) => set("pais", code)}
          />
          <label className="k-field">
            <span>Zona horaria</span>
            <input
              value={form.zonaHoraria}
              list="k-alta-zones"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => set("zonaHoraria", event.target.value)}
              aria-invalid={errors.zonaHoraria ? true : undefined}
              required
            />
            <datalist id="k-alta-zones">
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            {errors.zonaHoraria ? (
              <small className="k-alta-error">{errors.zonaHoraria}</small>
            ) : (
              <small className="k-muted">
                Con ella calculamos si tu local está abierto. La hemos sugerido desde tu navegador.
              </small>
            )}
          </label>
        </>
      ) : null}

      {step === SIGNUP_STEP.Service ? (
        <fieldset className="k-alta-service">
          <legend className="k-subtitle">¿Cómo sirves tus pedidos?</legend>
          <label className="k-alta-check">
            <input
              type="checkbox"
              checked={form.recogida}
              onChange={(event) => set("recogida", event.target.checked)}
            />
            <span>
              <strong>Recogida en el local</strong>
              <small className="k-muted">El cliente pasa a recoger su pedido.</small>
            </span>
          </label>
          <label className="k-alta-check">
            <input
              type="checkbox"
              checked={form.reparto}
              onChange={(event) => set("reparto", event.target.checked)}
            />
            <span>
              <strong>Reparto a domicilio</strong>
              <small className="k-muted">Más adelante defines tus zonas y tarifas.</small>
            </span>
          </label>
          {errors.servicio ? <small className="k-alta-error">{errors.servicio}</small> : null}
          <p className="k-muted k-small">
            Empezarás cobrando en efectivo y con tarjeta; el resto de métodos los activas luego en
            Ajustes.
            {config.requiere_aprobacion
              ? " Revisaremos tu solicitud antes de activar los pedidos."
              : ""}
          </p>
          {captchaSiteKey ? (
            <TurnstileWidget
              siteKey={captchaSiteKey}
              resetKey={captchaReset}
              onToken={setCaptchaToken}
              onLoadError={() => setCaptchaLoadFailed(true)}
            />
          ) : null}
        </fieldset>
      ) : null}

      {error ? (
        <div className="k-alert" role="alert">
          <p className="k-alta-alert-text">{error}</p>
          {alreadyHasTrial ? (
            <Link href="/panel" className="k-link">
              Ir a mi panel
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="k-alta-actions">
        {step > SIGNUP_STEP.Restaurant ? (
          <button type="button" className="k-btn k-btn-secondary" onClick={back} disabled={busy}>
            Atrás
          </button>
        ) : null}
        <button type="submit" className="k-btn k-btn-primary" disabled={busy}>
          {busy ? "Creando tu restaurante…" : lastStep ? "Crear mi restaurante" : "Siguiente"}
        </button>
      </div>
      <button
        type="button"
        className="k-link k-small k-alta-other"
        onClick={async () => {
          await supabase?.auth.signOut();
        }}
      >
        Usar otra cuenta
      </button>
    </form>
  );
}
