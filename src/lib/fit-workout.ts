/**
 * Export d'une séance structurée vers la montre : fichier FIT « workout »
 * (type 5), à copier dans le dossier GARMIN/NewFiles (USB) ou à importer
 * dans Garmin Connect. Ferme la boucle plan → montre → import → analyse.
 *
 * Les montres n'acceptent qu'un niveau de répétition : les séries
 * imbriquées (3×(6×400)) sont dépliées au niveau supérieur.
 *
 * Fonctions pures, testées dans tests/fit-workout.test.ts.
 */

import { encodeFit, FIT_EPOCH, type EncField, type EncMessage } from "./fit";
import { targetPace, type WorkoutStep } from "./workout-dsl";
import type { PaceSet } from "./workouts";

type Flat =
  | { type: "step"; step: Extract<WorkoutStep, { type: "step" }> }
  | { type: "repeat"; times: number; steps: Array<Extract<WorkoutStep, { type: "step" }>> };

/** Un seul niveau de répétition : l'extérieur est déplié. */
export function flattenForWatch(steps: WorkoutStep[]): Flat[] {
  const out: Flat[] = [];
  const leaf = (list: WorkoutStep[]): Array<Extract<WorkoutStep, { type: "step" }>> | null =>
    list.every((s) => s.type === "step") ? (list as Array<Extract<WorkoutStep, { type: "step" }>>) : null;
  const walk = (list: WorkoutStep[]) => {
    for (const s of list) {
      if (s.type === "step") out.push({ type: "step", step: s });
      else {
        const l = leaf(s.steps);
        if (l) out.push({ type: "repeat", times: s.times, steps: l });
        else
          for (let i = 0; i < s.times; i++) {
            const last = i === s.times - 1;
            const body = s.steps.slice();
            const tail = body[body.length - 1];
            if (last && tail.type === "step" && tail.role === "recovery") body.pop();
            walk(body);
          }
      }
    }
  };
  walk(steps);
  return out;
}

const INTENSITY = { work: 0, recovery: 1, warmup: 2, cooldown: 3 } as const;

export function workoutToFit(name: string, steps: WorkoutStep[], paces: PaceSet, now = new Date()): Uint8Array {
  const flat = flattenForWatch(steps);
  const stepMsgs: EncMessage[] = [];
  let index = 0;
  const pushStep = (s: Extract<WorkoutStep, { type: "step" }>) => {
    const d = s.duration;
    const durationType = d.kind === "time" ? 0 : d.kind === "distance" ? 1 : 5;
    const durationValue = d.kind === "time" ? d.seconds * 1000 : d.kind === "distance" ? d.meters * 100 : null;
    let targetType = 2; // open
    let low: number | null = null;
    let high: number | null = null;
    if (s.target?.kind === "hr") {
      targetType = 1;
      low = s.target.bpm - 5 + 100;
      high = s.target.bpm + 5 + 100;
    } else if (s.target || s.role === "work") {
      const pace = targetPace(s.target, paces, s.role);
      if (pace > 0 && s.role !== "recovery") {
        targetType = 0;
        // ± 3 % autour de l'allure cible, en mm/s.
        low = Math.round((1000 / (pace * 1.03)) * 1000);
        high = Math.round((1000 / (pace * 0.97)) * 1000);
      }
    }
    const fields: EncField[] = [
      { num: 254, base: 0x84, size: 2, value: index++ },
      { num: 0, base: 0x07, size: 16, value: (s.note ?? "").slice(0, 15) },
      { num: 1, base: 0x00, size: 1, value: durationType },
      { num: 2, base: 0x86, size: 4, value: durationValue },
      { num: 3, base: 0x00, size: 1, value: targetType },
      { num: 4, base: 0x86, size: 4, value: 0 },
      { num: 5, base: 0x86, size: 4, value: low },
      { num: 6, base: 0x86, size: 4, value: high },
      { num: 7, base: 0x00, size: 1, value: INTENSITY[s.role] },
    ];
    stepMsgs.push({ global: 27, fields });
  };
  for (const f of flat) {
    if (f.type === "step") pushStep(f.step);
    else {
      const first = index;
      for (const s of f.steps) pushStep(s);
      stepMsgs.push({
        global: 27,
        fields: [
          { num: 254, base: 0x84, size: 2, value: index++ },
          { num: 0, base: 0x07, size: 16, value: "" },
          { num: 1, base: 0x00, size: 1, value: 6 }, // repeat_until_steps_cmplt
          { num: 2, base: 0x86, size: 4, value: first },
          { num: 3, base: 0x00, size: 1, value: 2 },
          { num: 4, base: 0x86, size: 4, value: f.times },
          { num: 5, base: 0x86, size: 4, value: null },
          { num: 6, base: 0x86, size: 4, value: null },
          { num: 7, base: 0x00, size: 1, value: 0 },
        ],
      });
    }
  }
  const created = Math.floor(now.getTime() / 1000) - FIT_EPOCH;
  return encodeFit([
    {
      global: 0,
      fields: [
        { num: 0, base: 0x00, size: 1, value: 5 }, // type = workout
        { num: 1, base: 0x84, size: 2, value: 255 }, // manufacturer = development
        { num: 2, base: 0x84, size: 2, value: 0 },
        { num: 3, base: 0x8c, size: 4, value: 12345 },
        { num: 4, base: 0x86, size: 4, value: created },
      ],
    },
    {
      global: 26,
      fields: [
        { num: 4, base: 0x00, size: 1, value: 1 }, // sport = running
        { num: 6, base: 0x84, size: 2, value: index },
        { num: 8, base: 0x07, size: 24, value: name.slice(0, 23) },
      ],
    },
    ...stepMsgs,
  ]);
}
