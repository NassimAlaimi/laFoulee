import { revalidatePath } from "next/cache";
import { ConnectWithStrava } from "@/components/StravaBrand";
import { getTranslations } from "next-intl/server";
import { PageHead, Section, SectionHead } from "@/components/ui/Layout";
import { DisconnectButton } from "@/components/DisconnectButton";
import { SyncButton } from "@/components/SyncButton";
import { fmtDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getLastSync, getSettings, getStravaAccount } from "@/lib/queries";
import { deauthorize, isStravaConfigured } from "@/lib/strava";
import { displayName, requireUser, requireUserId } from "@/lib/auth";
import { AccountActions } from "@/components/AccountActions";
import { CalendarSubscription } from "@/components/CalendarSubscription";
import { LanguageSwitcher } from "@/components/settings/LanguageSwitcher";
import { AdminErrors } from "@/components/settings/AdminErrors";
import { authErrorCode } from "@/lib/auth-errors";
import { headers } from "next/headers";
import { pageMeta } from "@/lib/page-meta";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMeta("settings");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; welcome?: string }>;
}) {
  const t = await getTranslations("settings");
  const tl = await getTranslations("login");
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
  // Connexions Strava de l'instance (réservé à l'admin pour gérer les 10 sièges).
  const connections =
    user.role === "admin"
      ? await prisma.stravaAccount.findMany({
          select: {
            userId: true,
            lastSyncAt: true,
            user: { select: { firstname: true, lastname: true, role: true } },
          },
          orderBy: { lastSyncAt: "asc" },
        })
      : [];
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

  async function savePrivacy(formData: FormData) {
    "use server";
    const v = Number(formData.get("privacyZoneM"));
    if (![0, 200, 500, 1000].includes(v)) return;
    const owner = await requireUserId();
    await prisma.settings.upsert({
      where: { userId: owner },
      create: { userId: owner, privacyZoneM: v },
      update: { privacyZoneM: v },
    });
    revalidatePath("/", "layout");
  }

  async function freeStravaSeat(formData: FormData) {
    "use server";
    const targetId = formData.get("userId");
    if (typeof targetId !== "string") return;
    const actor = await requireUser();
    if (actor.role !== "admin") return;
    const victim = await prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (!victim || victim.role === "admin") return; // jamais l'admin
    const revoked = await deauthorize(targetId);
    await prisma.stravaAccount.deleteMany({ where: { userId: targetId } });
    if (revoked) {
      await prisma.user.update({
        where: { id: targetId },
        data: { stravaEvictedAt: new Date() },
      });
    }
    revalidatePath("/settings");
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHead
        title={t("title")}
        kicker={t("kick")}
        meta={
          account
            ? t("metaStrava", { name: `${account.firstname ?? ""} ${account.lastname ?? ""}`.trim(), n: activityCount, plans: planCount })
            : t("metaLocal", { n: activityCount })
        }
      />

      {params.error && (
        <div role="alert" className="rounded-card border border-negative/35 bg-negative/8 px-4 py-3.5 text-sm text-rust">
          {/* Code traduit, jamais le texte brut de l'URL (lib/auth-errors.ts). */}
          {tl(`errors.${authErrorCode(params.error) ?? "generic"}` as "errors.generic")}
        </div>
      )}
      {params.welcome && (
        <div className="rounded-card border border-positive/35 bg-positive/8 px-4 py-3.5 text-sm text-sage">
          {account
            ? t("welcomeStrava", { name: displayName(user) })
            : t.rich("welcomeLocal", {
                name: displayName(user),
                link: (chunks) => (
                  <a href="/import" className="underline underline-offset-2">
                    {chunks}
                  </a>
                ),
              })}
        </div>
      )}
      {params.connected && (
        <div className="rounded-card border border-positive/35 bg-positive/8 px-4 py-3.5 text-sm text-sage">
          {t("connected")}
        </div>
      )}
      {user.stravaEvictedAt && !account && (
        <div className="rounded-card border border-caution/30 bg-caution/8 px-4 py-3.5 text-sm text-ochre">
          {t("evicted")}
        </div>
      )}

      {/* -------------------------------------------------- Strava */}
      <Section>
        <SectionHead title={t("stravaTitle")} note={t("stravaNote")} />

        {!configured && (
          <div className="rounded-card border border-caution/30 bg-caution/8 p-4 text-sm">
            <p className="font-medium text-ochre">{tl("notConfigured")}</p>
            <p className="mt-1.5 text-ink2">
              {user.role === "admin" ? t("unconfiguredAdmin") : t("unconfiguredUser")}
            </p>
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
                  {[account.city, account.country].filter(Boolean).join(", ") || t("accountConnected")}
                </div>
              </div>
              <DisconnectButton />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Info label={t("infoActivities")} value={String(activityCount)} />
              <Info label={t("infoRuns")} value={String(runCount)} />
              <Info
                label={t("infoLastSync")}
                value={account.lastSyncAt ? fmtDate(account.lastSyncAt) : t("never")}
              />
              <Info
                label={t("infoStatus")}
                value={
                  lastSync?.status === "success" || lastSync?.status === "error" || lastSync?.status === "running"
                    ? t(`syncStatus.${lastSync.status}`)
                    : "—"
                }
                tone={
                  lastSync?.status === "success"
                    ? "positive"
                    : lastSync?.status === "error"
                      ? "negative"
                      : "default"
                }
              />
            </div>

            {lastSync?.status === "success" && (
              <p className="text-xs text-ink3">{t("syncResult", { imported: lastSync.imported, updated: lastSync.updated })}</p>
            )}

            <div className="flex flex-wrap items-start gap-3 border-t border-hair pt-5">
              <SyncButton />
              <SyncButton full />
            </div>
            <p className="text-micro leading-relaxed text-ink3">{t("syncHelp")}</p>
          </div>
        ) : (
          <a
            href="/api/strava/connect"
            aria-label="Connect with Strava"
            className={`inline-block rounded-[6px] ${configured ? "hover:opacity-90" : "pointer-events-none opacity-40"}`}
          >
            <ConnectWithStrava />
          </a>
        )}
      </Section>

      {/* -------------------------------------------------- Admin : sièges Strava */}
      {user.role === "admin" && (
        <Section>
          <SectionHead
            title={t("seatsTitle")}
            note={t("seatsNote", { n: connections.length })}
          />
          {connections.length === 0 ? (
            <p className="text-sm text-ink3">{t("seatsNone")}</p>
          ) : (
            <ul className="divide-y divide-hair border-y border-hair">
              {connections.map((c) => (
                <li key={c.userId} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {c.user.firstname} {c.user.lastname}
                      {c.userId === user.id && (
                        <span className="ml-2 text-micro text-ink3">{t("you")}</span>
                      )}
                      {c.user.role === "admin" && (
                        <span className="ml-2 text-micro text-clay">admin</span>
                      )}
                    </div>
                    <div className="text-xs text-ink3">
                      {c.lastSyncAt ? t("seatLastSync", { date: fmtDate(c.lastSyncAt) }) : t("seatNeverSynced")}
                    </div>
                  </div>
                  {c.user.role !== "admin" && (
                    <form action={freeStravaSeat}>
                      <input type="hidden" name="userId" value={c.userId} />
                      <button type="submit" className="btn-outline btn-sm">
                        {t("seatFree")}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {user.role === "admin" && <AdminErrors />}

      {/* -------------------------------------------------- Profil */}
      <Section>
        <SectionHead title={t("profileTitle")} note={t("profileNote")} />
        <ProfileGauge
          settings={settings}
          label={(done) => t("profileGauge", { done })}
        />
        <form action={saveSettings} className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            name="maxHr"
            label={t("fMaxHr")}
            defaultValue={settings.maxHr}
            placeholder="auto"
            note={t("fMaxHrNote")}
          />
          <Field
            name="restHr"
            label={t("fRestHr")}
            defaultValue={settings.restHr}
            note={t("fRestHrNote")}
          />
          <Field
            name="birthYear"
            label={t("fBirthYear")}
            defaultValue={settings.birthYear}
            placeholder="1995"
            note={t("fBirthYearNote")}
          />
          <Field
            name="weightKg"
            label={t("fWeight")}
            defaultValue={settings.weightKg}
            step="0.1"
            note={t("fWeightNote")}
          />
          <Field
            name="vmaKmh"
            label={t("fVma")}
            defaultValue={settings.vmaKmh}
            step="0.1"
            placeholder="auto"
            note={t("fVmaNote")}
          />
          <Field
            name="weeklyKmGoal"
            label={t("fWeekly")}
            defaultValue={settings.weeklyKmGoal}
            note={t("fWeeklyNote")}
          />
          <div className="sm:col-span-2 xl:col-span-3">
            <button type="submit" className="btn-solid">
              {t("save")}
            </button>
          </div>
        </form>
      </Section>

      {/* -------------------------------------------------- Confidentialité */}
      <Section>
        <SectionHead title={t("privacyTitle")} note={t("privacyNote")} />
        <form action={savePrivacy} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="privacyZoneM" className="eyebrow">
              {t("privacyLabel")}
            </label>
            <select
              id="privacyZoneM"
              name="privacyZoneM"
              defaultValue={String(settings.privacyZoneM)}
              className="field mt-2 w-auto"
            >
              {[0, 200, 500, 1000].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? t("privacyOff") : t("privacyMeters", { m })}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-outline">
            {t("save")}
          </button>
        </form>
      </Section>

      {/* -------------------------------------------------- Langue */}
      <Section>
        <SectionHead
          title={t("languageTitle")}
          note={t("languageNote")}
        />
        <LanguageSwitcher />
      </Section>

      {/* -------------------------------------------------- Agenda */}
      <Section className="scroll-mt-24" >
        <div id="agenda" className="scroll-mt-24" />
        <SectionHead
          title={t("calTitle")}
          note={t("calNote")}
        />
        <CalendarSubscription initialToken={calendar?.calendarToken ?? null} origin={origin} />
      </Section>

      {/* -------------------------------------------------- Export */}
      <Section>
        <SectionHead
          title={t("exportTitle")}
          note={t("exportNote")}
        />
        <div className="flex flex-wrap gap-3">
          <a href="/api/export" download className="btn-outline">
            {t("exportJson")}
          </a>
          <a href="/api/export?format=csv" download className="btn-outline">
            {t("exportCsv")}
          </a>
        </div>
      </Section>

      {/* -------------------------------------------------- Compte */}
      <Section>
        <SectionHead
          title={t("accountTitle")}
          note={
            user.athleteId
              ? t("accountNoteStrava", { name: displayName(user), id: String(user.athleteId) })
              : t("accountNoteLocal", { name: displayName(user) })
          }
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

/** Jauge de complétude du profil — chaque champ alimente les modèles. */
function ProfileGauge({
  settings,
  label,
}: {
  settings: Awaited<ReturnType<typeof getSettings>>;
  label: (done: number) => string;
}) {
  const fields = [settings.maxHr, settings.birthYear, settings.weightKg, settings.vmaKmh];
  const done = fields.filter((f) => f != null).length;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-4">
      <div className="h-[3px] w-full max-w-[220px] overflow-hidden rounded-full bg-hair">
        <div
          className="h-full rounded-full bg-clay transition-all duration-500"
          style={{ width: `${(done / 4) * 100}%` }}
        />
      </div>
      <span className="text-micro text-ink3">{label(done)}</span>
    </div>
  );
}
