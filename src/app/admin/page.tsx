import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/page-meta";
import { PageHead, Section } from "@/components/ui/Layout";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMeta("admin");
}

/** Pôle admin : qui est inscrit, qui est connecté, quand. */
export default async function AdminPage() {
  const t = await getTranslations("admin");
  const locale = await getLocale();
  const me = await requireUser();
  if (me.role !== "admin") notFound();

  const now = new Date();
  const [users, sessions, activityCount] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        role: true,
        language: true,
        createdAt: true,
        lastSeenAt: true,
        _count: { select: { activities: true, sessions: true } },
        stravaAccount: { select: { id: true, lastSyncAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.session.findMany({
      where: { expiresAt: { gt: now } },
      select: {
        id: true,
        lastUsed: true,
        expiresAt: true,
        userAgent: true,
        user: { select: { firstname: true, lastname: true, email: true } },
      },
      orderBy: { lastUsed: "desc" },
      take: 100,
    }),
    prisma.activity.count(),
  ]);

  const name = (u: { firstname: string | null; lastname: string | null; email: string | null }) =>
    [u.firstname, u.lastname].filter(Boolean).join(" ") || u.email || "—";

  const rel = (d: Date) => {
    const diff = d.getTime() - now.getTime();
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["minute", 60_000],
      ["hour", 3_600_000],
      ["day", 86_400_000],
    ];
    for (const [unit, ms] of units) {
      if (Math.abs(diff) < ms * (unit === "minute" ? 60 : unit === "hour" ? 24 : 7)) {
        return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(diff / ms), unit);
      }
    }
    return fmtDate(d, locale);
  };

  return (
    <div className="space-y-12">
      <PageHead kicker={t("kicker")} title={t("title")} meta={t("meta")} />

      {/* Vue d'ensemble */}
      <Section title={t("overview")}>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-hair bg-hair sm:grid-cols-4">
          <Stat label={t("users")} value={users.length} />
          <Stat label={t("activities")} value={activityCount} />
          <Stat label={t("activeSessions")} value={sessions.length} />
          <Stat label={t("stravaLinked")} value={users.filter((u) => u.stravaAccount).length} />
        </div>
      </Section>

      {/* Utilisateurs */}
      <Section title={t("usersTitle")} note={t("usersNote")}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("name")}</th>
                <th>{t("email")}</th>
                <th>{t("role")}</th>
                <th>{t("language")}</th>
                <th className="text-right">{t("activities")}</th>
                <th>{t("strava")}</th>
                <th>{t("created")}</th>
                <th>{t("lastSeen")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{name(u)}</td>
                  <td className="text-ink2">{u.email ?? "—"}</td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "border-clay/40 text-clay" : ""}`}>{t(`role_${u.role}`)}</span>
                  </td>
                  <td className="text-ink2">{u.language}</td>
                  <td className="num text-right">{u._count.activities}</td>
                  <td className="text-ink2">
                    {u.stravaAccount ? (
                      <span className="text-sage">{t("yes")}{u.stravaAccount.lastSyncAt ? ` · ${rel(u.stravaAccount.lastSyncAt)}` : ""}</span>
                    ) : (
                      <span className="text-ink3">{t("no")}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-ink2">{fmtDate(u.createdAt, locale)}</td>
                  <td className="whitespace-nowrap text-ink2">{u.lastSeenAt ? rel(u.lastSeenAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Sessions actives */}
      <Section title={t("sessionsTitle")} note={t("sessionsNote")}>
        {sessions.length === 0 ? (
          <p className="text-[0.8125rem] text-ink3">{t("noSessions")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("who")}</th>
                  <th>{t("lastUsed")}</th>
                  <th>{t("expires")}</th>
                  <th>{t("agent")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{name(s.user)}</td>
                    <td className="whitespace-nowrap text-ink2">{rel(s.lastUsed)}</td>
                    <td className="whitespace-nowrap text-ink2">{rel(s.expiresAt)}</td>
                    <td className="max-w-[280px] truncate text-ink3" title={s.userAgent ?? ""}>{s.userAgent ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-panel px-5 py-4">
      <div className="display text-d3">{value}</div>
      <div className="mt-1 text-micro text-ink3">{label}</div>
    </div>
  );
}
