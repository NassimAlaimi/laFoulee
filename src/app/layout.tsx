import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { TopNav } from "@/components/Nav";
import { CommandPalette } from "@/components/CommandPalette";
import { themeScript } from "@/components/Theme";
import { currentUser, displayName } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Foulée — analyse d'entraînement",
  description: "Suivi et analyse de course à pied et de musculation",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0D0E" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // La nav n'est pas rendue tant qu'il n'y a pas de session : la page de
  // connexion n'a aucune raison d'afficher des onglets inaccessibles.
  const user = await currentUser();
  const account = user
    ? {
        name: displayName(user),
        avatarUrl: user.avatarUrl,
        initials: initials(displayName(user)),
        athleteId: String(user.athleteId),
        admin: user.role === "admin",
      }
    : null;

  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {account && <TopNav user={account} />}
        {account && <CommandPalette />}
        <main className="mx-auto max-w-[1240px] px-gutter pb-28 pt-8 md:pb-24">
          {children}
        </main>
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
