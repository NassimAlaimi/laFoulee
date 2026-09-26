import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUTH_ERROR_CODES, authErrorCode } from "../src/lib/auth-errors.ts";

it("un code inconnu (texte libre dans l'URL) devient générique", () => {
  assert.equal(authErrorCode("credentials"), "credentials");
  assert.equal(authErrorCode("Ton compte est suspendu, appelle le 0800…"), "generic");
  assert.equal(authErrorCode(null), null);
});

it("chaque code a sa traduction dans les trois langues", () => {
  for (const l of ["fr", "en", "es"]) {
    const errors = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).login.errors;
    for (const c of [...AUTH_ERROR_CODES, "generic"]) assert.ok(errors[c], `${l}: login.errors.${c}`);
  }
});
