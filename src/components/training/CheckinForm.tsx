"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Adaptation = {
  headline: string;
  reasons: string[];
  tone: string;
  volumeFactor: number;
};

const TONE_CLASS: Record<string, string> = {
  push: "text-sage",
  normal: "text-ink2",
  ease: "text-ochre",
  hold: "text-slate",
  stop: "text-rust",
};

/**
 * Point hebdomadaire.
 *
 * Quatre curseurs, trente secondes. C'est ce qui permet au plan de suivre la
 * réalité plutôt que l'inverse : la réponse du moteur s'affiche immédiatement,
 * avec le chiffre de l'ajustement appliqué.
 */
export function CheckinForm({
  planId,
  existing,
}: {
  planId: string;
  existing?: Adaptation | null;
}) {
  const t = useTranslations("training");
  const router = useRouter();
  const [pain, setPain] = useState(0);
  const [area, setArea] = useState("");
  const [fatigue, setFatigue] = useState(3);
  const [motivation, setMotivation] = useState(3);
  const [sleep, setSleep] = useState(3);
  const [days, setDays] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Adaptation | null>(existing ?? null);

  async function submit() {
    setBusy(true);
    const res = await fetch("/api/training/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId,
        painLevel: pain,
        painArea: area || null,
        fatigue,
        motivation,
        sleep,
        availableDays: days === "" ? null : days,
      }),
    });
    const json = await res.json();
    setResult(json.adaptation ?? null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="field-label">{t("painWeek")}</span>
          <div className="flex gap-1.5">
            {PAIN.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPain(i)}
                className={`flex-1 rounded-[7px] border px-2 py-1.5 text-micro transition-colors ${
                  pain === i
                    ? "border-clay bg-clay/10 text-clay"
                    : "border-hair text-ink3 hover:text-ink"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {pain > 0 && (
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder={t("checkWhere")}
              className="field mt-2"
            />
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="days">
            {t("daysNextWeek")}
          </label>
          <select
            id="days"
            value={days}
            onChange={(e) => setDays(e.target.value === "" ? "" : Number(e.target.value))}
            className="field"
          >
            <option value="">{t("asPlanned")}</option>
            {[2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {t("daysN", { n: d })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label={t("checkFatigue")} value={fatigue} onChange={setFatigue} lo={t("checkFresh")} hi={t("checkEmpty")} />
        <Slider label={t("checkMotivation")} value={motivation} onChange={setMotivation} lo={t("flat")} hi={t("full")} />
        <Slider label={t("checkSleep")} value={sleep} onChange={setSleep} lo={t("checkBad")} hi={t("checkGreat")} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={submit} disabled={busy} className="btn-solid">
          {busy ? t("adapting") : t("adapt")}
        </button>
        <span className="text-micro text-ink3">
          {t("recalcNote")}
        </span>
      </div>

      {result && (
        <div className="border-t border-hair pt-4">
          <div className={`text-sm font-medium ${TONE_CLASS[result.tone] ?? "text-ink"}`}>
            {result.headline}
          </div>
          {result.reasons.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.reasons.map((r, i) => (
                <li key={i} className="text-[0.8125rem] leading-relaxed text-ink2">
                  · {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const PAIN = ["Aucune", "Gêne", "Gêne la course", "Empêche de courir"];

function Slider({
  label,
  value,
  onChange,
  lo,
  hi,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  lo: string;
  hi: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-micro font-medium uppercase tracking-[0.08em] text-ink3">
          {label}
        </span>
        <span className="font-mono text-micro tabular-nums text-ink2">{value}/5</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-clay"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-ink3">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}
