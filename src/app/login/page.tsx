import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { currentUser, inviteCode } from "@/lib/auth";
import { safeNextPath } from "@/lib/locale";
import { isStravaConfigured } from "@/lib/strava";
import { ConnectWithStrava } from "@/components/StravaBrand";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("login");
  return { title: t("title") };
}

/** Les noms de langues s'écrivent dans leur propre langue. */
const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
] as const;

/** Erreurs émises par nos propres formulaires : traduites. Les autres
 *  (retour OAuth Strava) sont affichées telles quelles. */
const KNOWN_ERRORS = new Set([
  "invalid",
  "credentials",
  "throttled",
  "email-taken",
  "email-invalid",
  "password-short",
  "password-long",
  "name-missing",
  "not-allowed",
  "bad-invite",
  "origin",
]);

/**
 * Point d'entrée de l'instance.
 *
 * Deux portes : Strava (recommandée, les activités arrivent seules) ou un
 * compte email pour qui n'a pas Strava. La langue se choisit ici, avant
 * toute session — elle devient celle du profil à la création du compte.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string; deleted?: string }>;
}) {
  const t = await getTranslations("login");
  const locale = await getLocale();
  const { error, next, mode: rawMode, deleted } = await searchParams;
  if (await currentUser()) redirect("/");

  const mode = rawMode === "signup" ? "signup" : "signin";
  const configured = isStravaConfigured();
  const needsInvite = Boolean(inviteCode());
  const nextPath = next ? safeNextPath(next) : null;

  // Retour sur cette même page (mode conservé) après changement de langue.
  const here = `/login?${new URLSearchParams({
    ...(mode === "signup" ? { mode } : {}),
    ...(nextPath ? { next: nextPath } : {}),
  })}`;
  const modeHref = (m: "signin" | "signup") =>
    `/login?${new URLSearchParams({ mode: m, ...(nextPath ? { next: nextPath } : {}) })}`;

  const errorText = error
    ? KNOWN_ERRORS.has(error)
      ? t(`errors.${error}` as "errors.invalid")
      : decodeURIComponent(error)
    : null;

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center py-6">
      {/* ------------------------------------------------ marque + langue */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 17c3.5 0 4.5-10 8-10s4.5 10 8 10"
              stroke="rgb(var(--clay))"
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-lg font-semibold tracking-tight">Foulée</span>
        </div>

        <nav aria-label={t("language")} className="flex items-center gap-1 text-[0.8125rem]">
          {LANGUAGES.map((l, i) => (
            <span key={l.code} className="flex items-center gap-1">
              {i > 0 && <span className="text-ink3" aria-hidden>·</span>}
              {l.code === locale ? (
                <span
                  aria-current="true"
                  lang={l.code}
                  className="border-b border-clay px-1 py-0.5 font-medium text-clay"
                >
                  {l.label}
                </span>
              ) : (
                <a
                  href={`/api/lang-sync?lang=${l.code}&next=${encodeURIComponent(here)}`}
                  lang={l.code}
                  hrefLang={l.code}
                  className="px-1 py-0.5 text-ink2 transition-colors hover:text-ink"
                >
                  {l.label}
                </a>
              )}
            </span>
          ))}
        </nav>
      </div>

      <h1 className="display mt-8 text-d2">{t("tagline")}</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink2">{t("lead")}</p>

      {deleted === "1" && (
        <p role="status" className="mt-6 border-l-2 border-sage pl-3 text-sm text-ink2">
          {t("deleted")}
        </p>
      )}

      {errorText && (
        <div
          role="alert"
          className="mt-6 rounded-card border border-negative/35 bg-negative/8 px-4 py-3.5 text-sm text-rust"
        >
          {errorText}
        </div>
      )}

      {/* ------------------------------------------------ Strava */}
      {configured ? (
        <form action="/api/strava/connect" method="get" className="mt-8 space-y-3">
          {needsInvite && (
            <div>
              <label htmlFor="invite-strava" className="eyebrow">
                {t("invite")}
              </label>
              <input
                id="invite-strava"
                name="invite"
                required
                autoComplete="off"
                className="field mt-2"
                placeholder={t("invitePlaceholder")}
              />
            </div>
          )}
          <button
            type="submit"
            aria-label={t("withStrava")}
            className="mx-auto block rounded-[6px] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            <ConnectWithStrava />
          </button>
          <p className="text-center text-micro text-ink3">{t("stravaNote")}</p>
        </form>
      ) : (
        <div className="mt-8 rounded-card border border-caution/30 bg-caution/8 p-4 text-sm">
          <p className="font-medium text-ochre">{t("notConfigured")}</p>
          <p className="mt-1.5 text-ink2">{t("notConfiguredDetail")}</p>
        </div>
      )}

      {/* ------------------------------------------------ sans Strava */}
      <div className="mt-8 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-hair" />
        <span className="eyebrow">{t("or")}</span>
        <span className="h-px flex-1 bg-hair" />
      </div>

      <p className="mt-4 text-[0.875rem] leading-relaxed text-ink2">{t("noStravaLead")}</p>

      <div className="mt-5 flex gap-5 border-b border-hair text-[0.875rem]" role="tablist">
        {(["signin", "signup"] as const).map((m) => (
          <a
            key={m}
            href={modeHref(m)}
            role="tab"
            aria-selected={mode === m}
            className={`-mb-px border-b-2 pb-2 transition-colors ${
              mode === m ? "border-clay font-medium text-ink" : "border-transparent text-ink3 hover:text-ink2"
            }`}
          >
            {t(m)}
          </a>
        ))}
      </div>

      {mode === "signin" ? (
        <form action="/api/auth/signin" method="post" className="mt-5 space-y-4">
          {nextPath && <input type="hidden" name="next" value={nextPath} />}
          <Field id="email" name="email" type="email" label={t("email")} autoComplete="email" />
          <Field
            id="password"
            name="password"
            type="password"
            label={t("password")}
            autoComplete="current-password"
          />
          <button type="submit" className="btn-outline w-full justify-center">
            {t("signin")}
          </button>
        </form>
      ) : (
        <form action="/api/auth/signup" method="post" className="mt-5 space-y-4">
          <Field id="firstname" name="firstname" label={t("firstname")} autoComplete="given-name" />
          <Field id="email" name="email" type="email" label={t("email")} autoComplete="email" />
          <Field
            id="password"
            name="password"
            type="password"
            label={t("password")}
            autoComplete="new-password"
            minLength={10}
            hint={t("passwordHint")}
          />
          {needsInvite && (
            <Field
              id="invite"
              name="invite"
              label={t("invite")}
              autoComplete="off"
              placeholder={t("invitePlaceholder")}
            />
          )}
          <button type="submit" className="btn-outline w-full justify-center">
            {t("signup")}
          </button>
        </form>
      )}

      <div className="mt-8 border-t border-hair pt-5 text-[0.8125rem] leading-relaxed text-ink3">
        <p>{t("footAccount")}</p>
        {configured && <p className="mt-2">{t("footStrava")}</p>}
      </div>
    </div>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  placeholder,
  minLength,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="field mt-2"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-micro text-ink3">
          {hint}
        </p>
      )}
    </div>
  );
}
