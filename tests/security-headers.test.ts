import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, makeNonce, staticSecurityHeaders } from "../src/lib/security-headers.ts";

describe("CSP", () => {
  it("n'autorise que les scripts à nonce en production", () => {
    const csp = buildCsp("abc", { dev: false, https: true });
    assert.match(csp, /script-src 'self' 'nonce-abc' 'strict-dynamic'(;|$)/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /form-action 'self' https:\/\/www\.strava\.com/);
    assert.match(csp, /upgrade-insecure-requests/);
    assert.doesNotMatch(buildCsp("abc", { dev: false, https: false }), /upgrade-insecure-requests/);
  });
  it("assouplie pour le serveur de développement", () => {
    const csp = buildCsp("abc", { dev: true });
    assert.match(csp, /'unsafe-eval'/);
    assert.match(csp, /connect-src 'self' ws: wss:/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  });
});

describe("en-têtes fixes", () => {
  it("HSTS seulement en HTTPS", () => {
    const keys = (https: boolean) => staticSecurityHeaders({ https }).map((h) => h.key);
    assert.ok(keys(true).includes("Strict-Transport-Security"));
    assert.ok(!keys(false).includes("Strict-Transport-Security"));
    assert.ok(keys(false).includes("X-Content-Type-Options"));
  });
  it("nonce aléatoire de 128 bits", () => {
    const a = makeNonce();
    assert.equal(Buffer.from(a, "base64").length, 16);
    assert.notEqual(a, makeNonce());
  });
});
