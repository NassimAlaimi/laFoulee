import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NightBand } from "@/components/ui/Layout";
import { fmtClock, fmtDuration } from "@/lib/format";
import { editionHeadline, type EditionKey } from "@/lib/edition";

/**
 * La Une d'une édition de course : un très grand chiffre (compte à rebours,
 * distance ou résultat) et une phrase, à la place du conseil du jour. Le
 * reste de l'accueil (calendrier, forme, zones…) continue en dessous.
 */
export async function RaceEdition({
  edition,
  nextRace,
  lastRace,
  hasPlan,
}: {
  edition: EditionKey;
  nextRace: { id: string; name: string; days: number; distanceKm: number; hasRacePlan: boolean; targetSeconds: number | null } | null;
  lastRace: { name: string; days: number; distanceKm: number } | null;
  hasPlan: boolean;
}) {
  const t = await getTranslations("edition");
  const h = editionHeadline(edition, { name: nextRace?.name, days: nextRace?.days });

  let big: string;
  let unit: string | null = null;
  if (edition === "raceDay" && nextRace) {
    big = fmtClock(nextRace.targetSeconds ?? 0);
    unit = t("target");
  } else if (edition === "raceEve" && nextRace) {
    big = String(nextRace.days);
    unit = nextRace.days > 1 ? t("days") : t("day");
  } else if (edition === "raceAfter" && lastRace) {
    big = lastRace.distanceKm.toFixed(1);
    unit = "km";
  } else {
    return null;
  }

  const cta =
    edition === "raceDay" || edition === "raceEve"
      ? nextRace?.hasRacePlan
        ? { href: `/goals/${nextRace.id}/race-plan`, label: t("openPlan") }
        : { href: `/goals/${nextRace?.id}`, label: t("makePlan") }
      : { href: "/recap", label: t("debrief") };

  return (
    <NightBand className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div>
          <div className="eyebrow">{t("kicker")}</div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="num text-[clamp(3.5rem,10vw,7rem)] font-semibold leading-none tracking-[-0.05em]">{big}</span>
            {unit && <span className="text-[0.9375rem] text-ink2">{unit}</span>}
          </div>
          <p className="mt-4 max-w-xl text-[clamp(1.05rem,2vw,1.4rem)] font-medium leading-snug tracking-[-0.01em]">
            {t(`manchette.${h.key}`, h.params)}
          </p>
          <p className="mt-3 max-w-xl text-[0.9375rem] text-ink2">
            {edition === "raceDay" && nextRace ? t("raceDayBody", { km: nextRace.distanceKm }) : edition === "raceEve" && nextRace ? t("raceEveBody", { km: nextRace.distanceKm }) : t("raceAfterBody")}
          </p>
        </div>
        {cta && (
          <Link href={cta.href} className="btn-solid">
            {cta.label}
          </Link>
        )}
      </div>
    </NightBand>
  );
}
