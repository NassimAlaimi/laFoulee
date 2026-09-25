import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitGradeFactor, gradeSamples, pearson, personalGradeFactor } from "../src/lib/ml.ts";

function synthetic(n: number, slope: number, noise: number, seed = 7): Array<{ distance: number; movingTime: number; elevationDiff: number; averageSpeed: number }> {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
  // baseline : 5:00/km sur le plat (200 s/km → 5 m/s)
  const one = (grade: number): { distance: number; movingTime: number; elevationDiff: number; averageSpeed: number } => {
    const factor = 1 + (slope * grade) / 100;
    const pace = 200 * factor * (1 + rnd() * noise);
    return { distance: 1000, movingTime: pace, elevationDiff: grade * 10, averageSpeed: 1000 / pace };
  };
  const out: Array<{ distance: number; movingTime: number; elevationDiff: number; averageSpeed: number }> = [];
  // assez de plats pour la baseline
  for (let i = 0; i < 30; i++) out.push(one(0));
  // puis des pentes -10..+10
  for (let i = 0; i < n - 30; i++) out.push(one(-10 + (i % 21)));
  return out;
}

describe("gradeSamples & fitGradeFactor", () => {
  it("retrouve la pente personnelle sur des données propres", () => {
    const samples = gradeSamples(synthetic(84, 5, 0.01));
    assert.ok(samples.length >= 60);
    const fit = fitGradeFactor(samples)!;
    assert.ok(fit, "fit trouvé");
    // slope est la pente par % → ~5 % d'allure par % de pente
    assert.ok(Math.abs(fit.slope * 100 - 5) < 1.5, `slope=${fit.slope}`);
    assert.ok(fit.r2 > 0.8);
  });
  it("refuse sous le seuil ou sur du bruit", () => {
    assert.equal(fitGradeFactor(gradeSamples(synthetic(20, 5, 0.01))), null);
    // bruit pur : l'allure ne dépend pas de la pente
    const noise = Array.from({ length: 80 }, (_, i) => {
      const g = -8 + (i % 17);
      const pace = 200 * (1 + ((i * 37) % 13) / 13 - 0.5);
      return { distance: 1000, movingTime: pace, elevationDiff: g * 10, averageSpeed: 1000 / pace };
    });
    assert.equal(fitGradeFactor(gradeSamples(noise)), null);
  });
  it("facteur borné et cohérent", () => {
    const fit = { slope: 0.05, intercept: 1, r2: 0.9, n: 100 };
    assert.ok(personalGradeFactor(fit, 8)! > 1.3);
    assert.ok(personalGradeFactor(fit, -8)! < 1);
    assert.equal(personalGradeFactor(null, 5), null);
  });
});

describe("pearson", () => {
  it("corrélation nette, significative", () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    const ys = xs.map((x) => 2 * x + 1);
    const p = pearson(xs, ys)!;
    assert.equal(p.r, 1);
    assert.equal(p.significant, true);
  });
  it("aucune corrélation, non significative", () => {
    let s1 = 3, s2 = 99;
    const rnd = (k: number) => {
      const s = k === 1 ? (s1 = (s1 * 1103515245 + 12345) % 2147483648) : (s2 = (s2 * 1103515245 + 12345) % 2147483648);
      return s / 2147483648;
    };
    const xs = Array.from({ length: 30 }, () => rnd(1));
    const ys = Array.from({ length: 30 }, () => rnd(2));
    const p = pearson(xs, ys)!;
    assert.ok(Math.abs(p.r) < 0.5, `r=${p.r}`);
    assert.equal(p.significant, false);
  });
  it("trop peu de points", () => {
    assert.equal(pearson([1, 2, 3], [1, 2, 3]), null);
  });
});
