import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  decryptIfNeeded,
  secretKeyFromEnv,
} from "../src/lib/crypto.ts";

const key = randomBytes(32);

describe("encryptSecret / decryptSecret", () => {
  it("fait l'aller-retour", () => {
    const enc = encryptSecret("hello token", key);
    assert.ok(isEncrypted(enc));
    assert.equal(decryptSecret(enc, key), "hello token");
  });
  it("produit un IV aléatoire : deux chiffrements diffèrent", () => {
    assert.notEqual(encryptSecret("x", key), encryptSecret("x", key));
  });
  it("rejette un mauvais tag (falsification)", () => {
    const enc = encryptSecret("secret", key);
    const tampered = enc.slice(0, -2) + "AA";
    assert.throws(() => decryptSecret(tampered, key));
  });
});

describe("decryptIfNeeded", () => {
  it("déchiffre le format chiffré", () => {
    assert.equal(decryptIfNeeded(encryptSecret("abc", key), key), "abc");
  });
  it("laisse passer l'héritage en clair", () => {
    assert.equal(decryptIfNeeded("plain-legacy-token", key), "plain-legacy-token");
  });
});

describe("secretKeyFromEnv", () => {
  it("accepte 64 hex et lève si absent", () => {
    const hex = "ab".repeat(32);
    assert.equal(secretKeyFromEnv({ TOKEN_SECRET: hex } as Record<string, string | undefined>).length, 32);
    assert.throws(() => secretKeyFromEnv({} as Record<string, string | undefined>), /TOKEN_SECRET/);
  });
  it("dérive un secret court en 32 octets", () => {
    assert.equal(secretKeyFromEnv({ TOKEN_SECRET: "court" } as Record<string, string | undefined>).length, 32);
  });
});
