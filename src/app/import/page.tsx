import { getLocale, getTranslations } from "next-intl/server";
import { pageMeta } from "@/lib/page-meta";
import { PageHead, Section } from "@/components/ui/Layout";
import { ImportDrop } from "@/components/import/ImportDrop";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMeta("import");
}

/**
 * Import de fichiers : montres sans Strava, export complet Garmin, archives.
 * L'en-tête dit où en est l'historique (combien de sorties viennent de
 * fichiers, dernier import) ; puis la zone de dépôt ; puis le mode d'emploi
 * par marque.
 */
export default async function ImportPage() {
  const t = await getTranslations("import");
  const locale = await getLocale();
  const userId = await requireUserId();
  const [bySource, batches, withStream, total] = await Promise.all([
    prisma.activity.groupBy({ by: ["source"], where: { userId }, _count: { _all: true } }),
    prisma.importBatch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.hrStream.count({ where: { activity: { userId } } }),
    prisma.activity.count({ where: { userId } }),
  ]);
  const fromFiles = bySource.filter((s) => ["fit", "gpx", "tcx"].includes(s.source)).reduce((a, s) => a + s._count._all, 0);
  const streamPct = total ? Math.round((withStream / total) * 100) : 0;

  return (
    <div className="space-y-14">
      <PageHead
        kicker={t("kicker")}
        title={t("title")}
        meta={
          fromFiles
            ? t("metaSome", { n: fromFiles, pct: streamPct })
            : t("metaNone", { pct: streamPct })
        }
      />

      <Section title={t("dropTitle")} note={t("dropNote")}>
        <ImportDrop />
      </Section>

      {batches.length > 0 && (
        <Section title={t("history")}>
          <ul className="divide-y divide-hair border-y border-hair">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-[0.8125rem]">
                <span className="min-w-0 truncate text-ink2">
                  <span className="mr-3 text-ink">{fmtDate(b.createdAt, locale)}</span>
                  {b.files}
                </span>
                <span className="font-mono text-micro tabular-nums text-ink3">
                  {t("batchLine", { created: b.created, merged: b.merged, wellness: b.wellness, failed: b.failed })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("howTitle")} note={t("howNote")}>
        <div className="grid gap-8 md:grid-cols-2">
          {(["garmin", "garminOne", "coros", "suunto", "polar", "apple"] as const).map((k) => (
            <div key={k} className="border-t border-hair pt-3">
              <h3 className="text-[0.9375rem] font-semibold">{t(`how.${k}.title`)}</h3>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink2">{t(`how.${k}.body`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-2xl text-micro leading-relaxed text-ink3">{t("privacy")}</p>
      </Section>
    </div>
  );
}
