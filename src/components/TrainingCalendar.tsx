import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtDate } from "@/lib/format";
import { addDays, startOfWeek, type ActivityLike } from "@/lib/stats";

/**
 * Calendrier d'entraînement façon heatmap : une colonne par semaine,
 * une case par jour, intensité proportionnelle au volume.
 *
 * Rendu en SVG/HTML statique côté serveur — aucune librairie de graphes.
 */
export async function TrainingCalendar({
  activities,
  weeks = 26,
  now = new Date(),
}: {
  activities: ActivityLike[];
  weeks?: number;
  now?: Date;
}) {
  const t = await getTranslations("training");
  // Agrégation par jour
  const byDay = new Map<string, { km: number; count: number; names: string[]; id: string }>();
  for (const a of activities) {
    const key = dayKey(a.startDate);
    const prev = byDay.get(key);
    if (prev) {
      prev.km += a.distance / 1000;
      prev.count += 1;
      prev.names.push(a.name);
    } else {
      byDay.set(key, {
        km: a.distance / 1000,
        count: 1,
        names: [a.name],
        id: a.id,
      });
    }
  }

  const maxKm = Math.max(1, ...[...byDay.values()].map((d) => d.km));

  // Colonnes : `weeks` semaines se terminant par la semaine courante
  const lastMonday = startOfWeek(now);
  const columns: Date[] = [];
  for (let i = weeks - 1; i >= 0; i--) columns.push(addDays(lastMonday, -7 * i));

  const totalKm = [...byDay.values()].reduce((a, d) => a + d.km, 0);
  const activeDays = byDay.size;
  const streak = currentStreak(byDay, now);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-8">
          <Figure value={Math.round(totalKm)} unit="km" label={t("overWeeks", { n: weeks })} />
          <Figure value={activeDays} label={t("activeDays")} />
          <Figure value={streak} label={streak > 1 ? t("streakWeeks") : t("activeWeek")} />
        </div>
        <Scale maxKm={maxKm} />
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-[3px]">
          {/* Libellés des jours */}
          <div className="mr-1 flex flex-col gap-[3px] pt-[15px]">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <span
                key={i}
                className="h-[13px] text-[9px] leading-[13px] text-ink3"
                style={{ visibility: i % 2 === 0 ? "visible" : "hidden" }}
              >
                {d}
              </span>
            ))}
          </div>

          {columns.map((monday, ci) => {
            const prevMonday = ci > 0 ? columns[ci - 1] : null;
            const showMonth =
              !prevMonday || monday.getMonth() !== prevMonday.getMonth();
            return (
              <div key={ci} className="flex flex-col gap-[3px]">
                <span className="h-3 text-[9px] leading-3 text-ink3">
                  {showMonth
                    ? monday.toLocaleDateString("fr-FR", { month: "short" })
                    : ""}
                </span>
                {Array.from({ length: 7 }, (_, di) => {
                  const day = addDays(monday, di);
                  const future = day > now;
                  const entry = byDay.get(dayKey(day));
                  return (
                    <Cell
                      key={di}
                      day={day}
                      entry={entry}
                      maxKm={maxKm}
                      future={future}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cell({
  day,
  entry,
  maxKm,
  future,
}: {
  day: Date;
  entry?: { km: number; count: number; names: string[]; id: string };
  maxKm: number;
  future: boolean;
}) {
  if (future) {
    return <span className="h-[13px] w-[13px] opacity-0" aria-hidden />;
  }

  if (!entry) {
    return (
      <span
        className="h-[13px] w-[13px] rounded-[2px]"
        style={{ background: "rgb(var(--hair))" }}
        title={`${fmtDate(day)} — repos`}
      />
    );
  }

  // 4 paliers d'intensité plutôt qu'un dégradé continu : plus lisible
  const ratio = entry.km / maxKm;
  const step = ratio > 0.66 ? 1 : ratio > 0.4 ? 0.72 : ratio > 0.18 ? 0.46 : 0.26;

  return (
    <Link
      href={`/activities/${entry.id}`}
      className="h-[13px] w-[13px] rounded-[2px] transition-transform hover:scale-125"
      style={{ background: `rgb(var(--clay) / ${step})` }}
      title={`${fmtDate(day)} — ${entry.km.toFixed(1)} km${
        entry.count > 1 ? ` (${entry.count} séances)` : ""
      }\n${entry.names.join(" · ")}`}
    />
  );
}

function Scale({ maxKm }: { maxKm: number }) {
  return (
    <div className="flex items-center gap-1.5 text-micro text-ink3">
      <span>0</span>
      <span className="h-[11px] w-[11px] rounded-[2px]" style={{ background: "rgb(var(--hair))" }} />
      {[0.26, 0.46, 0.72, 1].map((o) => (
        <span
          key={o}
          className="h-[11px] w-[11px] rounded-[2px]"
          style={{ background: `rgb(var(--clay) / ${o})` }}
        />
      ))}
      <span>{Math.round(maxKm)} km</span>
    </div>
  );
}

function Figure({
  value,
  unit,
  label,
}: {
  value: number | string;
  unit?: string;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="display text-d4">{value}</span>
        {unit && <span className="text-micro text-ink3">{unit}</span>}
      </div>
      <div className="mt-1 text-micro text-ink3">{label}</div>
    </div>
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Nombre de semaines consécutives (en remontant) comportant au moins une sortie. */
function currentStreak(
  byDay: Map<string, unknown>,
  now: Date
): number {
  let streak = 0;
  let monday = startOfWeek(now);
  for (let i = 0; i < 260; i++) {
    let active = false;
    for (let d = 0; d < 7; d++) {
      if (byDay.has(dayKey(addDays(monday, d)))) {
        active = true;
        break;
      }
    }
    if (!active) break;
    streak++;
    monday = addDays(monday, -7);
  }
  return streak;
}
