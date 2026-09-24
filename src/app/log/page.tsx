import { PageHead, Section } from "@/components/ui/Layout";
import { getTranslations } from "next-intl/server";
import { LogForm } from "@/components/log/LogForm";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { athleteContext } from "@/lib/plan-store";
import { formSeries } from "@/lib/fitness-model";
import { fmtDateShort } from "@/lib/format";
import { localDayKey } from "@/lib/stats";
import {
  averageSleep,
  correlation,
  READINESS_COLOR,
  READINESS_LABEL,
  readinessScore,
  readinessSeries,
  type ReadinessPoint,
} from "@/lib/readiness";

export const dynamic = "force-dynamic";

/**
 * Carnet quotidien — sommeil, récupération, ressenti, douleurs.
 * Le score de préparation du jour est la grande figure de la page ;
 * la corrélation avec la charge (ATL) dit si la forme du matin répond
 * à l'entraînement des jours précédents.
 */
export default async function LogPage() {
  const t = await getTranslations("logPage");
  const tc = await getTranslations("common");
  const now = new Date();
  const userId = await requireUserId();
  const since = new Date(now.getTime() - 20 * 86400000);

  const [logs, ctx] = await Promise.all([
    prisma.dailyLog.findMany({ where: { userId, date: { gte: since } }, orderBy: { date: "desc" } }),
    athleteContext(now, userId),
  ]);

  const todayKey = localDayKey(now);
  const today = logs.find((l) => localDayKey(l.date) === todayKey) ?? null;
  const readiness = readinessScore(today ?? {});

  const series = readinessSeries(logs, 14);
  const sleepAvg = averageSleep(logs, 7);

  // Corrélation charge (ATL) ↔ score du matin, jour par jour.
  const atlByDay = new Map<string, number>();
  for (const p of formSeries({ activities: ctx.runs, days: 30, now })) {
    atlByDay.set(localDayKey(p.date), p.atl);
  }
  const paired = series.filter((pt) => atlByDay.has(localDayKey(pt.date)));
  const r =
    paired.length >= 4
      ? correlation(
          paired.map((p) => p.score),
          paired.map((p) => atlByDay.get(localDayKey(p.date))!)
        )
      : null;

  return (
    <div className="space-y-12">
      <PageHead
        title={t("title")}
        kicker={t("kicker")}
        meta="Sommeil, récupération, ressenti — ton état jour après jour, en regard de la charge"
      />

      {/* ------------------------------------------------ Le score du jour */}
      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              Aujourd'hui · {fmtDateShort(now)}
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="display text-d4" style={{ color: READINESS_COLOR[readiness.zone] }}>
                {today ? readiness.score : "—"}
              </span>
              <span className="text-sm text-ink3">
                {today ? (
                  <>
                    {t(READINESS_LABEL[readiness.zone])}
                    {readiness.breakdown.length > 0 && (
                      <span className="text-ink2"> · {readiness.breakdown.join(", ")}</span>
                    )}
                  </>
                ) : (
                  "Remplis le carnet pour obtenir ton score de préparation"
                )}
              </span>
            </div>
          </div>
          <dl className="flex gap-8">
            <Figure label={t("sleep7")} value={sleepAvg !== null ? `${sleepAvg} h` : "—"} />
            <Figure label={t("daysFilled")} value={String(logs.length)} note={t("of20")} />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ Formulaire + tendance */}
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Section title={t("howFeel")} note={t("howFeelNote")}>
          <LogForm existing={today} today={todayKey} />
        </Section>

        <Section title={t("last14")} note={t("last14Note")}>
          {series.length >= 2 ? (
            <ReadinessChart points={series} />
          ) : (
            <p className="py-6 text-sm text-ink3">
              {series.length === 1
                ? "Un seul jour renseigné — la tendance apparaîtra dès demain."
                : t("firstDay")}
            </p>
          )}

          {r !== null && (
            <p className="mt-4 border-t border-hair pt-4 text-sm text-ink2">
              Charge (ATL) ↔ forme du matin :{" "}
              <span className="font-mono font-medium tabular-nums">{r > 0 ? "+" : ""}{r}</span>
              {" — "}
              {r < -0.3
                ? "ta forme du matin est sensible à la charge récente : surveille le sommeil après les grosses semaines."
                : r > 0.3
                  ? "contre-intuitif : ta forme du matin ne suit pas la charge — regarde plutôt le contexte de vie."
                  : "pas de lien net entre la charge et ton score du matin."}
            </p>
          )}
        </Section>
      </div>

      {/* ------------------------------------------------ Historique */}
      <Section title={t("history")} note={t("historyNote")}>
        {logs.length === 0 ? (
          <p className="py-6 text-sm text-ink3">Aucune entrée pour l'instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("day")}</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">Sommeil</th>
                  <th className="text-right">Fatigue</th>
                  <th className="text-right">Moral</th>
                  <th className="text-right">Douleur</th>
                  <th>{t("note")}</th>
                </tr>
              </thead>
              <tbody>
                {[...logs]
                  .sort((a, b) => b.date.getTime() - a.date.getTime())
                  .slice(0, 20)
                  .map((l) => {
                    const s = readinessScore(l);
                    return (
                      <tr key={l.id}>
                        <td className={localDayKey(l.date) === todayKey ? "font-medium text-clay" : "text-ink3"}>
                          {fmtDateShort(l.date)}
                        </td>
                        <td className="text-right font-mono" style={{ color: READINESS_COLOR[s.zone] }}>
                          {s.score}
                        </td>
                        <td className="text-right font-mono">{l.sleepHours != null ? `${l.sleepHours} h` : "—"}</td>
                        <td className="text-right font-mono">{l.fatigue ?? "—"}</td>
                        <td className="text-right font-mono">{l.mood ?? "—"}</td>
                        <td className="text-right font-mono">{l.painLevel > 0 ? `${l.painLevel} · ${l.painArea ?? ""}` : "—"}</td>
                        <td className="max-w-[32ch] truncate text-ink2">{l.note ?? ""}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-micro text-ink3">{label}{note ? ` ${note}` : ""}</div>
    </div>
  );
}

/**
 * Tendance 14 jours : polyline du score colorée par zone, barres de sommeil.
 * SVG statique côté serveur, aucune bibliothèque.
 */
function ReadinessChart({ points }: { points: ReadinessPoint[] }) {
  const W = 620;
  const H = 180;
  const PAD = 10;
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (score: number) => H - PAD - (score / 100) * (H - 2 * PAD - 28);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tendance du score de préparation sur 14 jours">
      {[100, 75, 50, 25].map((v) => (
        <g key={v}>
          <line x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="rgb(var(--hair))" strokeWidth="1" />
          <text x={W - PAD + 4} y={y(v) + 3} fontSize="9" fill="rgb(var(--ink-3))">{v}</text>
        </g>
      ))}

      {/* Barres de sommeil (échelle : 10 h = 32 px) */}
      {points.map((p, i) =>
        p.sleepHours != null ? (
          <rect
            key={`s${i}`}
            x={x(i) - 4}
            y={H - PAD - Math.min(32, p.sleepHours * 3.2)}
            width="8"
            height={Math.min(32, p.sleepHours * 3.2)}
            rx="2"
            fill="rgb(var(--hair-strong))"
          />
        ) : null
      )}

      <path d={line} fill="none" stroke="rgb(var(--clay))" strokeWidth="1.8" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.score)} r="3" fill={READINESS_COLOR[p.zone]} />
      ))}
    </svg>
  );
}
