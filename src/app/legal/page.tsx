import { getLocale } from "next-intl/server";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/content/legal";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: `${(LEGAL[locale] ?? LEGAL.fr).legal.title} — Foulée` };
}

export default function Page() {
  return <LegalPage page="legal" />;
}
