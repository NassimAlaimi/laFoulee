import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordIssue,
  verifyPassword,
} from "../src/lib/password.ts";
import { LoginThrottle } from "../src/lib/login-throttle.ts";

describe("mot de passe", () => {
  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const h = await hashPassword("cheval-batterie-agrafe");
    assert.match(h, /^scrypt\$16384\$8\$1\$/);
    assert.equal(await verifyPassword("cheval-batterie-agrafe", h), true);
    assert.equal(await verifyPassword("cheval-batterie-agrafE", h), false);
  });

  it("deux hachages du même mot de passe diffèrent (sel)", async () => {
    assert.notEqual(await hashPassword("abcdefghijk"), await hashPassword("abcdefghijk"));
  });

  it("refuse un hachage mal formé sans lever", async () => {
    for (const bad of ["", "plain", "scrypt$1$2$3", "bcrypt$a$b$c$d$e", "scrypt$x$8$1$aa$bb"]) {
      assert.equal(await verifyPassword("x", bad), false);
    }
  });

  it("normalise Unicode (NFKC) avant hachage", async () => {
    const h = await hashPassword("ﬁnale-course");
    assert.equal(await verifyPassword("finale-course", h), true);
  });

  it("longueur minimale et maximale", () => {
    assert.equal(passwordIssue("court"), "too-short");
    assert.equal(passwordIssue("x".repeat(10)), null);
    assert.equal(passwordIssue("x".repeat(201)), "too-long");
  });
});

describe("email", () => {
  it("normalise casse et espaces", () => {
    assert.equal(normalizeEmail("  Nassim@Exemple.FR "), "nassim@exemple.fr");
  });
  it("valide la forme minimale", () => {
    assert.equal(isValidEmail("a@b.fr"), true);
    assert.equal(isValidEmail("a@b"), false);
    assert.equal(isValidEmail("a b@c.fr"), false);
    assert.equal(isValidEmail(""), false);
  });
});

describe("freinage des connexions", () => {
  const opts = { maxFailures: 3, windowMs: 1000 };
  it("bloque après N échecs dans la fenêtre", () => {
    const t = new LoginThrottle(opts);
    t.fail("k", 0);
    t.fail("k", 10);
    assert.equal(t.blocked("k", 20), false);
    t.fail("k", 20);
    assert.equal(t.blocked("k", 30), true);
    assert.equal(t.blocked("autre", 30), false);
  });
  it("oublie les échecs hors fenêtre", () => {
    const t = new LoginThrottle(opts);
    for (const at of [0, 1, 2]) t.fail("k", at);
    assert.equal(t.blocked("k", 1500), false);
  });
  it("une réussite remet le compteur à zéro", () => {
    const t = new LoginThrottle(opts);
    t.fail("k", 0);
    t.fail("k", 1);
    t.succeed("k");
    t.fail("k", 2);
    assert.equal(t.blocked("k", 3), false);
  });
});
