import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { CommandPalette } from "@/components/CommandPalette";
import { AutoSync } from "@/components/AutoSync";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { TourLauncher } from "@/components/tour/TourLauncher";
import { prisma } from "@/lib/prisma";
import { themeScript } from "@/components/Theme";
import { currentUser, displayName } from "@/lib/auth";
import { locales } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  const locale = await getLocale();
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return {
    metadataBase: base,
    title: { default: t("appTitle"), template: `%s · Foulée` },
    description: t("appDescription"),
    openGraph: {
      title: t("appTitle"),
      description: t("appDescription"),
      type: "website",
      locale,
      siteName: "Foulée",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0D0E" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const t = await getTranslations("common");

  // La langue vit sur le profil (persistante entre appareils) et dans le
  // cookie NEXT_LOCALE (consommé à chaque requête). Le profil fait foi :
  // cookie absent ou divergent → une redirection via /api/lang-sync pose le
  // cookie (le layout ne peut pas en écrire), puis la page se re-rend.
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get("NEXT_LOCALE")?.value;
  const user = await currentUser();
  const profileLang =
    user && (locales as readonly string[]).includes(user.language)
      ? user.language
      : null;
  if (profileLang && cookieLang !== profileLang && profileLang !== locale) {
    const path = (await headers()).get("x-invoke-path") ?? "/";
    redirect(`/api/lang-sync?lang=${profileLang}&next=${encodeURIComponent(path)}`);
  }

  // La nav n'est pas rendue tant qu'il n'y a pas de session : la page de
  // connexion n'a aucune raison d'afficher des onglets inaccessibles.
  const strava = user
    ? await prisma.stravaAccount.findUnique({ where: { userId: user.id }, select: { lastSyncAt: true } })
    : null;
  const account = user
    ? {
        name: displayName(user),
        avatarUrl: user.avatarUrl,
        initials: initials(displayName(user)),
        athleteId: user.athleteId === null ? null : String(user.athleteId),
        admin: user.role === "admin",
      }
    : null;
  const messages = await getMessages();
  // Nonce de la CSP (posé par le middleware) : sans lui, le script de thème
  // serait bloqué comme n'importe quel script injecté.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a href="#contenu" className="skip-link">
            {t("skipToContent")}
          </a>
          {account && <TopNav user={account} />}
          {account && <CommandPalette />}
          {account && (
            <AutoSync connected={Boolean(strava)} lastSyncAt={strava?.lastSyncAt?.toISOString() ?? null} />
          )}
          {account && (
            <>
              <GuidedTour />
              <TourLauncher />
            </>
          )}
          <main id="contenu" className="mx-auto max-w-[1240px] px-gutter pb-12 pt-8 md:pb-16">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
