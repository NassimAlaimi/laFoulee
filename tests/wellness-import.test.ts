import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractWellness } from "../src/lib/wellness-import.ts";
import { readZip, isZip, ZipError } from "../src/lib/zip.ts";
import { deflateRawSync } from "node:zlib";

describe("extractWellness", () => {
  it("sommeil, FC de repos et VFC, de façon tolérante", () => {
    const sleep = [{ calendarDate: "2026-09-01", deepSleepSeconds: 5400, lightSleepSeconds: 14400, remSleepSeconds: 7200 }];
    const uds = [{ calendarDate: "2026-09-01", restingHeartRate: 48 }, { calendarDate: "2026-09-02", restingHeartRate: 250 }];
    const hrv = { data: [{ calendarDate: "2026-09-01", hrvSummary: { lastNightAvg: 62 } }] };
    const days = extractWellness([sleep, uds, hrv]);
    assert.equal(days.length, 1);
    assert.deepEqual(days[0], { date: "2026-09-01", sleepHours: 7.5, restHr: 48, hrv: 62 });
  });
});

/** Zip minimal (une entrée « deflate ») fabriqué à la main. */
function makeZip(name: string, content: Uint8Array): Uint8Array {
  const data = deflateRawSync(content);
  const nb = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + nb.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, content.length, true);
  lv.setUint16(26, nb.length, true);
  local.set(nb, 30);
  local.set(data, 30 + nb.length);
  const central = new Uint8Array(46 + nb.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, content.length, true);
  cv.setUint16(28, nb.length, true);
  cv.setUint32(42, 0, true);
  central.set(nb, 46);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + eocd.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(eocd, local.length + central.length);
  return out;
}

describe("readZip", () => {
  it("lit une entrée et déplie un zip imbriqué", () => {
    const inner = makeZip("run.gpx", new TextEncoder().encode("<gpx>ok</gpx>"));
    const outer = makeZip("UploadedFiles_1.zip", inner);
    assert.ok(isZip(outer));
    const entries = readZip(outer, (n) => /\.(gpx|fit|tcx)$/i.test(n));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "run.gpx");
    assert.equal(new TextDecoder().decode(entries[0].bytes), "<gpx>ok</gpx>");
  });

  it("refuse une bombe de décompression (budget dépassé, imbrication comprise)", () => {
    const big = new Uint8Array(4096); // se compresse en quelques octets
    const outer = makeZip("UploadedFiles_1.zip", makeZip("run.gpx", big));
    assert.throws(() => readZip(outer, () => true, 0, { left: 1000 }), ZipError);
    // Budget suffisant : lecture normale.
    assert.equal(readZip(outer, () => true, 0, { left: 1 << 20 }).length, 1);
  });
});
