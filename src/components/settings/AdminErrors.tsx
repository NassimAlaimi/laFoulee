import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { Section, SectionHead } from "@/components/ui/Layout";

/**
 * Journal des erreurs serveur — réservé à l'admin (le composant ne se rend
 * que pour lui, et l'action vérifie de nouveau le rôle).
 */
export async function AdminErrors() {
  const t = await getTranslations("admin");
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [errors, weekCount] = await Promise.all([
    prisma.errorLog.findMany({ orderBy: { lastAt: "desc" }, take: 15 }),
    prisma.errorLog.aggregate({ where: { lastAt: { gte: since } }, _sum: { count: true } }),
  ]);

  async function clearErrors() {
    "use server";
    const actor = await requireUser();
    if (actor.role !== "admin") return;
    await prisma.errorLog.deleteMany({});
    revalidatePath("/settings");
  }

  const n = weekCount._sum.count ?? 0;
  return (
    <Section>
      <SectionHead title={t("errorsTitle")} note={t("errorsNote", { n })} />
      {errors.length === 0 ? (
        <p className="text-sm text-ink3">{t("errorsNone")}</p>
      ) : (
        <>
          <ul className="divide-y divide-hair border-y border-hair">
            {errors.map((e) => (
              <li key={e.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none items-baseline gap-3">
                    <span className="num w-10 shrink-0 text-right font-medium text-rust">×{e.count}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{e.message}</span>
                      <span className="block truncate font-mono text-micro text-ink3">
                        {e.source} · {fmtDate(e.lastAt)}
                      </span>
                    </span>
                  </summary>
                  {e.stack && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-card bg-sunken p-3 font-mono text-micro leading-relaxed text-ink2">
                      {e.stack}
                    </pre>
                  )}
                </details>
              </li>
            ))}
          </ul>
          <form action={clearErrors} className="mt-3">
            <button type="submit" className="btn-quiet">
              {t("errorsClear")}
            </button>
          </form>
        </>
      )}
    </Section>
  );
}
