import { revalidatePath } from "next/cache";
import { PageHead, Section, SectionHead } from "@/components/ui/Layout";
import { DisconnectButton } from "@/components/DisconnectButton";
import { SyncButton } from "@/components/SyncButton";
import { fmtDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getLastSync, getSettings, getStravaAccount } from "@/lib/queries";
import { isStravaConfigured } from "@/lib/strava";
import { displayName, requireUser, requireUserId } from "@/lib/auth";
import { AccountActions } from "@/components/AccountActions";
import { CalendarSubscription } from "@/components/CalendarSubscription";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; welcome?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const userId = user.id;
  const [account, settings, lastSync, activityCount, runCount] = await Promise.all([
    getStravaAccount(userId),
    getSettings(userId),
    getLastSync(userId),
    prisma.activity.count({ where: { userId } }),
    prisma.activity.count({
      where: { userId, type: { in: ["Run", "TrailRun", "VirtualRun"] } },
    }),
  ]);
  const [planCount, sessionCount] = await Promise.all([
    prisma.trainingPlan.count({ where: { userId } }),
    prisma.session.count({ where: { userId, expiresAt: { gt: new Date() } } }),
  ]);
  const configured = isStravaConfigured();
  const calendar = await prisma.user.findUnique({ where: { id: userId }, select: { calendarToken: true } });
  // L'URL publique est préférée ; à défaut, l'hôte de la requête (dev local)
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  async function saveSettings(formData: FormData) {
    "use server";
    const num = (k: string) => {
      const v = formData.get(k);
      if (v === null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const data = {
      maxHr: num("maxHr"),
      restHr: num("restHr") ?? 55,
      birthYear: num("birthYear"),
      weightKg: num("weightKg"),
      vmaKmh: num("vmaKmh"),
      weeklyKmGoal: num("weeklyKmGoal") ?? 40,
    };

    const owner = await requireUserId();
    await prisma.settings.upsert({
      where: { userId: owner },
      create: { userId: owner, ...data },
      update: data,
    });
    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/records");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHead title="Réglages" />

      {params.error && (
        <div className="rounded-card border border-negative/35 bg-negative/8 px-4 py-3.5 text-sm text-rust">
          {decodeURIComponent(params.error)}
        </div>
      )}
      {params.welcome && (
        <div className="rounded-card border border-positive/35 bg-positive/8 px-4 py-3.5 text-sm text-sage">
          Bienvenue {displayName(user)}. Ton compte est créé : lance une première
          synchronisation pour importer ton historique Strava.
        </div>
      )}
      {params.connected && (
        <div className="rounded-card border border-positive/35 bg-positive/8 px-4 py-3.5 text-sm text-sage">
          Compte Strava connecté. Lance une synchronisation pour importer tes activités.
        </div>
      )}

      {/* -------------------------------------------------- Strava */}
      <Section>
        <SectionHead title="Connexion Strava"
          note="Source de toutes les données d'activité"
        />

        {!configured && (
          <div className="rounded-card border border-caution/30 bg-caution/8 p-4 text-sm text-amber-200">
            <p className="font-medium">Configuration requise</p>
            <ol className="mt-2.5 list-decimal space-y-1.5 pl-5 text-amber-200/85">
              <li>
                Crée une application sur{" "}
                <a
                  href="https://www.strava.com/settings/api"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  strava.com/settings/api
                </a>
              </li>
              <li>
                <code className="rounded bg-black/30 px-1 py-0.5 text-micro">
                  Authorization Callback Domain
                </code>{" "}
                ={" "}
                <code className="rounded bg-black/30 px-1 py-0.5 text-micro">localhost</code>
              </li>
              <li>
                Renseigne <code className="rounded bg-black/30 px-1 py-0.5 text-micro">STRAVA_CLIENT_ID</code>{" "}
                et <code className="rounded bg-black/30 px-1 py-0.5 text-micro">STRAVA_CLIENT_SECRET</code>{" "}
                dans <code className="rounded bg-black/30 px-1 py-0.5 text-micro">.env</code>
              </li>
              <li>Redémarre le serveur</li>
            </ol>
          </div>
        )}

        {account ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-4 rounded-card border border-hair bg-sunken p-4">
              {account.profileUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.profileUrl}
                  alt=""
                  className="h-11 w-11 rounded-full object-cover ring-1 ring-line-strong"
                />
              ) : (
                <div className="grid h-11 w-11 place-items-center rounded-full bg-clay/15 text-clay">
                  {account.firstname?.[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium ">
                  {account.firstname} {account.lastname}
                </div>
                <div className="text-xs text-ink3">
                  {[account.city, account.country].filter(Boolean).join(", ") ||
                    "Compte connecté"}
                </div>
              </div>
              <DisconnectButton />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Info label="Activités" value={String(activityCount)} />
              <Info label="Courses" value={String(runCount)} />
              <Info
                label="Dernière synchro"
                value={account.lastSyncAt ? fmtDate(account.lastSyncAt) : "jamais"}
              />
              <Info
                label="Dernier statut"
                value={lastSync?.status ?? "—"}
                tone={
                  lastSync?.status === "success"
                    ? "positive"
                    : lastSync?.status === "error"
                      ? "negative"
                      : "default"
                }
              />
            </div>

            {lastSync?.message && (
              <p className="text-xs text-ink3">{lastSync.message}</p>
            )}

            <div className="flex flex-wrap items-start gap-3 border-t border-hair pt-5">
              <SyncButton />
              <SyncButton full />
            </div>
            <p className="text-micro leading-relaxed text-ink3">
              La synchronisation normale ne récupère que les nouvelles activités. La
              réimportation complète reparcourt tout l&apos;historique — attention à la
              limite Strava de 100 requêtes par tranche de 15 minutes.
            </p>
          </div>
        ) : (
          <a
            href="/api/strava/connect"
            className={`btn-solid ${configured ? "" : "pointer-events-none opacity-40"}`}
          >
            Se connecter avec Strava
          </a>
        )}
      </Section>

      {/* -------------------------------------------------- Profil */}
      <Section>
        <SectionHead title="Profil athlète"
          note="Affine le calcul des zones cardiaques, de la charge d'entraînement et des allures cibles"
        />
        <form action={saveSettings} className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            name="maxHr"
            label="FC max (bpm)"
            defaultValue={settings.maxHr}
            placeholder="auto"
            note="Vide = estimée depuis tes séances"
          />
          <Field name="restHr" label="FC au repos (bpm)" defaultValue={settings.restHr} />
          <Field
            name="birthYear"
            label="Année de naissance"
            defaultValue={settings.birthYear}
            placeholder="1995"
            note="Sert à estimer la FC max"
          />
          <Field
            name="weightKg"
            label="Poids (kg)"
            defaultValue={settings.weightKg}
            step="0.1"
          />
          <Field
            name="vmaKmh"
            label="VMA (km/h)"
            defaultValue={settings.vmaKmh}
            step="0.1"
            placeholder="auto"
            note="Vide = calculée depuis ton VDOT"
          />
          <Field
            name="weeklyKmGoal"
            label="Objectif hebdomadaire (km)"
            defaultValue={settings.weeklyKmGoal}
          />
          <div className="sm:col-span-2 xl:col-span-3">
            <button type="submit" className="btn-solid">
              Enregistrer
            </button>
          </div>
        </form>
      </Section>

      {/* -------------------------------------------------- Agenda */}
      <Section className="scroll-mt-24" >
        <div id="agenda" className="scroll-mt-24" />
        <SectionHead
          title="Agenda"
          note="Abonnement iCalendar au plan d'entraînement actif"
        />
        <CalendarSubscription initialToken={calendar?.calendarToken ?? null} origin={origin} />
      </Section>

      {/* -------------------------------------------------- Compte */}
      <Section>
        <SectionHead
          title="Compte"
          note={`Connecté en tant que ${displayName(user)} · athlète Strava ${user.athleteId}`}
        />
        <AccountActions
          firstname={user.firstname?.trim() || displayName(user)}
          activityCount={activityCount}
          planCount={planCount}
          sessionCount={sessionCount}
        />
      </Section>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  step = "1",
  note,
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
  placeholder?: string;
  step?: string;
  note?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="field"
      />
      {note && <p className="mt-1.5 text-micro text-ink3">{note}</p>}
    </div>
  );
}

function Info({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass = {
    default: "text-ink",
    positive: "text-sage",
    negative: "text-rust",
  }[tone];
  return (
    <div className="rounded-lg border border-hair bg-sunken px-3.5 py-3">
      <div className="text-micro uppercase tracking-wider text-ink3">{label}</div>
      <div className={`mt-1 text-sm font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}
