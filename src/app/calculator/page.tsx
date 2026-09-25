import { PageHead } from "@/components/ui/Layout";
import { getTranslations } from "next-intl/server";
import { getBestEfforts, getRuns } from "@/lib/queries";
import { fitnessProfile, personalRecords } from "@/lib/records";
import { CalculatorClient } from "./CalculatorClient";
import { BackyardCalc } from "@/components/calculator/BackyardCalc";
import { Section } from "@/components/ui/Layout";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const t = await getTranslations("calculator");
  const [runs, efforts] = await Promise.all([getRuns(), getBestEfforts()]);
  const records = personalRecords(efforts, runs);
  const profile = fitnessProfile(records, 365);

  // Pré-rempli avec ta meilleure performance réelle, sinon un 5 km générique
  const source = profile.source;
  const initialDistance = source?.meters ?? 5000;
  const initialSeconds = source?.seconds ?? 25 * 60;

  return (
    <>
      <PageHead
        title={t("title")}
        kicker={t("kicker")}
        meta={
          source
            ? t("prefilled", { name: source.name })
            : t("empty")
        }
      />
      <CalculatorClient
        initialDistance={initialDistance}
        initialSeconds={initialSeconds}
      />
      <div className="mt-16">
        <Section title={t("backyardTitle")} note={t("backyardNote")}>
          <BackyardCalc />
        </Section>
      </div>
    </>
  );
}
