import { redirect } from "next/navigation";
import { currentUser, inviteCode } from "@/lib/auth";
import { isStravaConfigured } from "@/lib/strava";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connexion — Foulée" };

/**
 * Point d'entrée de l'instance.
 *
 * Il n'y a rien à remplir : Strava est l'identité. Un code d'invitation
 * n'apparaît que si l'instance en exige un.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error } = await searchParams;
  if (await currentUser()) redirect("/");

  const configured = isStravaConfigured();
  const needsInvite = Boolean(inviteCode());

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
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

      <h1 className="display mt-6 text-d2">Analyse d&apos;entraînement</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink2">
        Volume, charge, prédictions de chrono et plan d&apos;entraînement séance par
        séance. Tout part de tes activités Strava.
      </p>

      {error && (
        <div className="mt-6 rounded-card border border-negative/35 bg-negative/8 px-4 py-3.5 text-sm text-red-200">
          {decodeURIComponent(error)}
        </div>
      )}

      {!configured ? (
        <div className="mt-8 rounded-card border border-caution/30 bg-caution/8 p-4 text-sm text-amber-200">
          <p className="font-medium">Instance non configurée</p>
          <p className="mt-1.5 text-amber-200/85">
            <code className="rounded bg-black/30 px-1 py-0.5 text-micro">
              STRAVA_CLIENT_ID
            </code>{" "}
            et{" "}
            <code className="rounded bg-black/30 px-1 py-0.5 text-micro">
              STRAVA_CLIENT_SECRET
            </code>{" "}
            manquent dans le fichier <code className="text-micro">.env</code> du serveur.
          </p>
        </div>
      ) : (
        <form action="/api/strava/connect" method="get" className="mt-8 space-y-4">
          {needsInvite && (
            <div>
              <label htmlFor="invite" className="eyebrow">
                Code d&apos;invitation
              </label>
              <input
                id="invite"
                name="invite"
                required
                autoComplete="off"
                className="field mt-2"
                placeholder="Fourni par l'administrateur de l'instance"
              />
            </div>
          )}

          <button type="submit" className="btn-solid w-full justify-center gap-2">
            <StravaMark />
            Se connecter avec Strava
          </button>
        </form>
      )}

      <div className="mt-8 border-t border-hair pt-5 text-[0.8125rem] leading-relaxed text-ink3">
        <p>
          Ton compte est créé au premier passage. Chaque utilisateur ne voit que ses
          propres activités, objectifs et plans.
        </p>
        <p className="mt-2">
          Permissions demandées : lecture de ton profil et de tes activités, y compris
          privées. L&apos;app n&apos;écrit jamais sur ton compte Strava.
        </p>
      </div>
    </div>
  );
}

function StravaMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.8 10.1 11.5 5.6 6.9 14.6h2.8l1.8-3.5 1.8 3.5h2.7l-1.9-4.5h-.3Z" />
      <path d="m15.4 14.6-1.5 3-1.5-3h-2.2l3.7 7.3 3.7-7.3h-2.2Z" />
    </svg>
  );
}
