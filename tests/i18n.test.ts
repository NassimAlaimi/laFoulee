import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Les trois dictionnaires doivent rester en parité exacte : une clé
 *  française sans traduction anglaise ou espagnole casse le rendu. */
function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
}

const LOCALES = ["fr", "en", "es"] as const;

function flatten(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key));
    else throw new Error(`Clé non-chaîne dans messages : ${key}`);
  }
  return out;
}

test("les trois dictionnaires ont exactement les mêmes clés", () => {
  const [fr, en, es] = LOCALES.map((l) => flatten(load(l)));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort(), "clés en ≠ fr");
  assert.deepEqual(Object.keys(es).sort(), Object.keys(fr).sort(), "clés es ≠ fr");
});

test("aucune traduction vide", () => {
  for (const l of LOCALES) {
    for (const [k, v] of Object.entries(flatten(load(l)))) {
      assert.ok(v.trim().length > 0, `traduction vide : ${l}.${k}`);
    }
  }
});

test("les trois locales déclarées dans routing.ts sont bien couvertes", () => {
  for (const l of LOCALES) {
    assert.ok(load(l), `messages/${l}.json`);
  }
});
