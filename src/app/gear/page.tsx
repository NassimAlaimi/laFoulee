import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Empty, PageHead, Section } from "@/components/ui/Layout";
import { Bar } from "@/components/ui/Metric";
import { MiniBars } from "@/components/ui/Spark";
import { fmtDate, fmtDuration, pacePerKm } from "@/lib/format";
import { fmtPace } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { RUN_TYPES } from "@/lib/strava";
import { daysBetween, round } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function GearPage() {
  const t = await getTranslations("gear");
  const userId = await requireUserId();
  const [gear, activities] = await Promise.all([
    prisma.gear.findMany({
      where: { userId },
      orderBy: [{ retired: "asc" }, { name: "asc" }],
    }),
    prisma.activity.findMany({
      where: { userId, gearId: { not: null }, type: { in: [...RUN_TYPES] } },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        gearId: true,
        distance: true,
        movingTime: true,
        startDate: true,
        name: true,
      },
    }),
  ]);

  async function updateThreshold(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const km = Number(formData.get("retireAtKm"));
    if (!id || !Number.isFinite(km) || km <= 0) return;
    // updateMany + userId : on ne peut pas régler le seuil d'un autre.
    await prisma.gear.updateMany({
      where: { id, userId: await requireUserId() },
      data: { retireAtKm: km },
    });
    revalidatePath("/gear");
  }

  if (gear.length === 0) {
    return (
      <>
        <PageHead title={t("title")} />
        <Empty
          title={t("empty")}
          body={t("emptyBody")}
        />
      </>
    );
  }

  const now = new Date();

  const rows = gear.map((g) => {
    // `Activity.gearId` reste l'identifiant Strava ; `Gear.id` est propre à
    // l'app depuis le passage en multi-utilisateur.
    const acts = activities.filter((a) => a.gearId === g.stravaGearId);
    const meters = acts.reduce((a, x) => a + x.distance, 0);
    const time = acts.reduce((a, x) => a + x.movingTime, 0);
    const km = round(meters / 1000, 1);

    // Strava connaît aussi le kilométrage d'avant l'import : on garde le plus élevé
    const stravaKm = round(g.stravaDistance / 1000, 1);
    const totalKm = Math.max(km, stravaKm);

    const first = acts.at(-1)?.startDate ?? null;
    const last = acts[0]?.startDate ?? null;
    const days = first ? Math.max(1, daysBetween(first, now)) : 0;
    const kmPerWeek = days ? round((totalKm / days) * 7, 1) : 0;
    const remaining = Math.max(0, g.retireAtKm - totalKm);
    const weeksLeft = kmPerWeek > 0 ? Math.round(remaining / kmPerWeek) : null;
    const wear = Math.min(100, (totalKm / g.retireAtKm) * 100);

    // 10 derniers mois de volume pour la micro-visualisation
    const monthly: number[] = [];
    for (let i = 9; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59);
      monthly.push(
        round(
          acts
            .filter((a) => a.startDate >= start && a.startDate <= end)
            .reduce((s, a) => s + a.distance, 0) / 1000,
          1
        )
      );
    }

    return {
      g,
      acts,
      totalKm,
      sessions: acts.length,
      time,
      avgPace: meters > 0 ? pacePerKm(meters, time) : 0,
      first,
      last,
      kmPerWeek,
      remaining: round(remaining, 0),
      weeksLeft,
      wear,
      monthly,
    };
  });

  const active = rows.filter((r) => !r.g.retired);
  const retired = rows.filter((r) => r.g.retired);

  const rotationKm = round(active.reduce((a, r) => a + r.totalKm, 0), 0);
  const rotationSessions = active.reduce((a, r) => a + r.sessions, 0);
  const next = [...active].sort((a, b) => b.wear - a.wear)[0] ?? null;

  return (
    <>
      <PageHead
        title={t("title")}
        kicker={t("kicker")}
        meta={t("meta", { pairs: active.length, km: rotationKm, sessions: rotationSessions })}
      />

      {next && (
        <section className="rise grid gap-8 border-y border-hair py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="eyebrow">{t("nextReplace")}</div>
            <h2 className="mt-3 text-[clamp(1.8rem,4vw,2.9rem)] font-semibold leading-none tracking-[-0.03em]">
              {next.g.name}
            </h2>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="display text-[clamp(3.5rem,8vw,6rem)] leading-[0.85]">{next.totalKm}</span>
              <span className="text-xl text-ink3">km</span>
            </div>
            <p className="mt-4 text-[0.9375rem] text-ink2">
              {next.wear >= 100
                ? t("thresholdCrossed")
                : next.weeksLeft !== null
                  ? t("remainingWeeks", { km: next.remaining, weeks: next.weeksLeft, perWeek: next.kmPerWeek })
                  : t("remaining", { km: next.remaining })}
            </p>
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-baseline justify-between text-micro text-ink3">
              <span>{t("wear")}</span>
              <span className="font-mono">{t("wearOf", { pct: Math.round(next.wear), km: next.g.retireAtKm })}</span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-hair">
              <span
                className="block h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, next.wear)}%`,
                  background: next.wear >= 100 ? "rgb(var(--rust))" : next.wear >= 80 ? "rgb(var(--ochre))" : "rgb(var(--sage))",
                }}
              />
            </div>
            <div className="mt-8 flex gap-10">
              <OdoFig label={t("sessions")} value={String(next.sessions)} />
              <OdoFig label={t("kmWeek")} value={String(next.kmPerWeek)} />
              <OdoFig label={t("avgPace")} value={next.avgPace > 0 ? fmtPace(next.avgPace) : "—"} />
            </div>
          </div>
        </section>
      )}

      <div className="space-y-10">
        <Section
          title={t("inService")}
          note={t("thresholdNote")}
        >
          <div className="space-y-px">
            {active.map((r) => (
              <GearRow t={t} key={r.g.id} row={r} onSubmit={updateThreshold} />
            ))}
          </div>
        </Section>

        {retired.length > 0 && (
          <Section title={t("retired")}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("model")}</th>
                  <th className="text-right">{t("mileage")}</th>
                  <th className="text-right">{t("sessions")}</th>
                  <th className="text-right">{t("lastRun")}</th>
                </tr>
              </thead>
              <tbody>
                {retired.map((r) => (
                  <tr key={r.g.id} className="text-ink2">
                    <td>{r.g.name}</td>
                    <td className="num text-right">{r.totalKm} km</td>
                    <td className="num text-right">{r.sessions}</td>
                    <td className="num text-right">
                      {r.last ? fmtDate(r.last) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
    </>
  );
}

type Row = {
  g: {
    id: string;
    name: string;
    brand: string | null;
    model: string | null;
    retireAtKm: number;
    primary: boolean;
  };
  totalKm: number;
  sessions: number;
  time: number;
  avgPace: number;
  first: Date | null;
  last: Date | null;
  kmPerWeek: number;
  remaining: number;
  weeksLeft: number | null;
  wear: number;
  monthly: number[];
};

function GearRow({
  row,
  onSubmit,
  t,
}: {
  row: Row;
  onSubmit: (fd: FormData) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const { g, wear } = row;
  const state =
    wear >= 100
      ? { label: t("replaceNow"), tone: "text-rust", bar: "rgb(var(--rust))" }
      : wear >= 80
        ? { label: t("endOfLife"), tone: "text-ochre", bar: "rgb(var(--ochre))" }
        : { label: t("goodShape"), tone: "text-sage", bar: "rgb(var(--sage))" };

  return (
    <div className="border-t border-hair py-6 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[1.0625rem] font-medium tracking-tight">{g.name}</h3>
            {g.primary && <span className="tag">{t("default")}</span>}
            <span className={`text-micro font-medium ${state.tone}`}>
              {state.label}
            </span>
          </div>
          {(g.brand || g.model) && (
            <p className="mt-1 text-[0.8125rem] text-ink2">
              {[g.brand, g.model].filter(Boolean).join(" ")}
            </p>
          )}
        </div>

        <div className="flex items-end gap-7">
          <Fig value={row.totalKm} unit="km" label={t("travelled")} />
          <Fig value={row.sessions} label={t("sessions")} />
          <Fig
            value={row.remaining}
            unit="km"
            label={
              row.weeksLeft !== null
                ? `${t("remainingLabel")} · ~${row.weeksLeft} ${t("weeksShort")}`
                : t("remainingLabel")
            }
          />
          <div className="hidden pb-1 sm:block">
            <MiniBars data={row.monthly} width={96} height={28} />
            <div className="mt-1 text-micro text-ink3">{t("last10months")}</div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Bar value={Math.min(100, wear)} tone={state.bar} height={4} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-micro text-ink3">
          <span>
            {t("wearLine", { pct: Math.round(wear), km: row.kmPerWeek })}
            {row.avgPace > 0 && ` · ${t("avgPaceLine", { pace: fmtPace(row.avgPace) })}`}
            {row.time > 0 && ` · ${t("totalTime", { time: fmtDuration(row.time) })}`}
          </span>
          <form action={onSubmit} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={g.id} />
            <label htmlFor={`t-${g.id}`} className="text-micro text-ink3">
              Seuil
            </label>
            <input
              id={`t-${g.id}`}
              name="retireAtKm"
              type="number"
              min="100"
              step="50"
              defaultValue={g.retireAtKm}
              className="field w-20 py-1 text-center font-mono text-micro"
            />
            <span className="text-micro text-ink3">km</span>
            <button type="submit" className="btn-quiet">
              OK
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Fig({
  value,
  unit,
  label,
}: {
  value: number;
  unit?: string;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="display text-d4">{value}</span>
        {unit && <span className="text-micro text-ink3">{unit}</span>}
      </div>
      <div className="mt-1 whitespace-nowrap text-micro text-ink3">{label}</div>
    </div>
  );
}

function OdoFig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="display text-d3">{value}</div>
      <div className="mt-1 text-micro text-ink3">{label}</div>
    </div>
  );
}
