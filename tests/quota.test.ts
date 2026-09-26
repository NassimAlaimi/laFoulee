import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activitiesRoom,
  clientIp,
  importAllowed,
  MAX_ACTIVITIES_PER_USER,
  MAX_IMPORTS_PER_HOUR,
} from "../src/lib/quota.ts";

const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });

describe("quotas d'import", () => {
  it("accepte un usage normal", () => {
    assert.equal(importAllowed({ activityCount: 800, importsLastHour: 2 }), null);
  });
  it("refuse au plafond d'activités, puis au rythme d'imports", () => {
    assert.equal(importAllowed({ activityCount: MAX_ACTIVITIES_PER_USER, importsLastHour: 0 }), "quota");
    assert.equal(importAllowed({ activityCount: 0, importsLastHour: MAX_IMPORTS_PER_HOUR }), "rate");
  });
  it("place restante jamais négative", () => {
    assert.equal(activitiesRoom(MAX_ACTIVITIES_PER_USER + 5), 0);
    assert.equal(activitiesRoom(MAX_ACTIVITIES_PER_USER - 3), 3);
  });
});

describe("IP du client", () => {
  it("première valeur de X-Forwarded-For", () => {
    assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })), "203.0.113.9");
  });
  it("repli sur X-Real-IP puis « unknown »", () => {
    assert.equal(clientIp(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
    assert.equal(clientIp(h({})), "unknown");
  });
});
