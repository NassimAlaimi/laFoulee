import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeFit, encodeFit, fitCrc, fitSportType, FIT_EPOCH, FitError, type EncMessage } from "../src/lib/fit.ts";

const T0 = Math.floor(new Date("2026-09-20T07:30:00Z").getTime() / 1000) - FIT_EPOCH;
const deg = (d: number) => Math.round((d / 180) * 2 ** 31);

function sample(): Uint8Array {
  const msgs: EncMessage[] = [
    { global: 0, fields: [{ num: 0, base: 0x00, size: 1, value: 4 }, { num: 4, base: 0x86, size: 4, value: T0 }] },
  ];
  for (let i = 0; i < 5; i++) {
    msgs.push({
      global: 20,
      fields: [
        { num: 253, base: 0x86, size: 4, value: T0 + i },
        { num: 0, base: 0x85, size: 4, value: deg(48.85 + i * 0.0001) },
        { num: 1, base: 0x85, size: 4, value: deg(2.35) },
        { num: 3, base: 0x02, size: 1, value: 140 + i },
        { num: 5, base: 0x86, size: 4, value: i * 300 },
        { num: 73, base: 0x86, size: 4, value: 3000 },
        { num: 78, base: 0x86, size: 4, value: (35 + 500) * 5 },
        { num: 4, base: 0x02, size: 1, value: i === 2 ? null : 85 },
      ],
    });
  }
  msgs.push({
    global: 19,
    fields: [
      { num: 253, base: 0x86, size: 4, value: T0 + 4 },
      { num: 2, base: 0x86, size: 4, value: T0 },
      { num: 7, base: 0x86, size: 4, value: 4000 },
      { num: 8, base: 0x86, size: 4, value: 4000 },
      { num: 9, base: 0x86, size: 4, value: 1200 },
      { num: 15, base: 0x02, size: 1, value: 142 },
    ],
  });
  msgs.push({
    global: 18,
    fields: [
      { num: 253, base: 0x86, size: 4, value: T0 + 4 },
      { num: 2, base: 0x86, size: 4, value: T0 },
      { num: 5, base: 0x00, size: 1, value: 1 },
      { num: 6, base: 0x00, size: 1, value: 3 },
      { num: 7, base: 0x86, size: 4, value: 4000 },
      { num: 8, base: 0x86, size: 4, value: 4000 },
      { num: 9, base: 0x86, size: 4, value: 1200 },
      { num: 16, base: 0x02, size: 1, value: 142 },
      { num: 17, base: 0x02, size: 1, value: 150 },
      { num: 22, base: 0x84, size: 2, value: 12 },
      { num: 124, base: 0x86, size: 4, value: 3000 },
    ],
  });
  return encodeFit(msgs);
}

describe("decodeFit", () => {
  it("lit session, tours et points", () => {
    const fit = decodeFit(sample());
    assert.equal(fit.fileType, 4);
    assert.equal(fit.records.length, 5);
    const r = fit.records[1];
    assert.equal(r.time.toISOString(), "2026-09-20T07:30:01.000Z");
    assert.ok(Math.abs(r.lat! - 48.8501) < 1e-6);
    assert.equal(r.hr, 141);
    assert.equal(r.distance, 3);
    assert.equal(r.speed, 3);
    assert.equal(r.altitude, 35);
    assert.equal(r.cadence, 170);
    assert.equal(fit.records[2].cadence, null); // valeur invalide
    assert.equal(fit.laps[0].distance, 12);
    const s = fit.sessions[0];
    assert.equal(s.sport, 1);
    assert.equal(fitSportType(s.sport, s.subSport), "TrailRun");
    assert.equal(s.elapsed, 4);
    assert.equal(s.ascent, 12);
    assert.equal(s.avgSpeed, 3);
  });

  it("horodatage compressé et définition gros-boutiste", () => {
    // en-tête 12 octets, puis : définition BE de record (timestamp + hr), un
    // message normal, puis un message à horodatage compressé (+3 s).
    const body = [
      0x40, 0, 1, 0x00, 20, 2, 253, 4, 0x86, 3, 1, 0x02,
      0x00, (T0 >>> 24) & 0xff, (T0 >>> 16) & 0xff, (T0 >>> 8) & 0xff, T0 & 0xff, 150,
    ];
    // Définition BE pour un type local 1 contenant seulement hr
    body.push(0x41, 0, 1, 0x00, 20, 1, 3, 1, 0x02);
    const off = ((T0 & 0x1f) + 3) & 0x1f;
    body.push(0x80 | (1 << 5) | off, 155);
    const bytes = new Uint8Array(12 + body.length);
    bytes[0] = 12;
    new DataView(bytes.buffer).setUint32(4, body.length, true);
    bytes.set([0x2e, 0x46, 0x49, 0x54], 8);
    bytes.set(body, 12);
    const fit = decodeFit(bytes);
    assert.equal(fit.records.length, 2);
    assert.equal(fit.records[1].hr, 155);
    assert.equal(fit.records[1].time.getTime() - fit.records[0].time.getTime(), 3000);
  });

  it("refuse un fichier qui n'est pas du FIT", () => {
    assert.throws(() => decodeFit(new TextEncoder().encode("<gpx></gpx> pas du tout du FIT")), FitError);
  });

  it("CRC de l'encodeur valide", () => {
    const b = sample();
    const dv = new DataView(b.buffer);
    assert.equal(dv.getUint16(b.length - 2, true), fitCrc(b, 0, b.length - 2));
  });
});
