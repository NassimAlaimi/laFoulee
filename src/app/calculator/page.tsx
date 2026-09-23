import { PageHead } from "@/components/ui/Layout";
import { getBestEfforts, getRuns } from "@/lib/queries";
import { fitnessProfile, personalRecords } from "@/lib/records";
import { CalculatorClient } from "./CalculatorClient";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
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
        title="Calculateur"
        kicker="Calculateur express"
        meta={
          source
            ? `Pré-rempli avec ta meilleure performance : ${source.name}`
            : "Saisis une performance pour estimer ton niveau et tes allures"
        }
      />
      <CalculatorClient
        initialDistance={initialDistance}
        initialSeconds={initialSeconds}
      />
    </>
  );
}
