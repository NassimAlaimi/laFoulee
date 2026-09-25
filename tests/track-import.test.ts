import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bestEffortsOf,
  elevationGain,
  enrich,
  kmSplits,
  parseGpxTrack,
  parseTcx,
  parseTrackFile,
  sameActivity,
  toActivity,
  type TrackPoint,
} from "../src/lib/track-import.ts";
import { decodeStream } from "../src/lib/cardio.ts";
import { decodePolyline } from "../src/lib/polyline.ts";

const T = Date.parse("2026-09-20T07:00:00Z");

/** 5,2 km vers le nord à 3 m/s, un point par seconde, FC 150, une pause de 60 s au km 2. */
function straight(): TrackPoint[] {
  const pts: TrackPoint[] = [];
  let t = T;
  let d = 0;
  while (d < 5200) {
    pts.push({ t, lat: 48.8 + d / 111_195, lon: 2.3, ele: 30 + (d > 3000 ? (d - 3000) / 100 : 0), hr: 150, cad: 172, dist: null, speed: null });
    t += 1000;
    d += 3;
    if (Math.abs(d - 2001) < 1.5) t += 60_000; // pause montre
  }
  return pts;
}

describe("gpx / tcx", () => {
  it("lit un GPX avec extensions FC et cadence", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><name>Sortie &amp; côtes</name><type>running</type><trkseg>
      <trkpt lat="48.80000" lon="2.30000"><ele>30</ele><time>2026-09-20T07:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr><gpxtpx:cad>86</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="48.80010" lon="2.30000"><ele>31</ele><time>2026-09-20T07:00:04Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>142</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    </trkseg></trk></gpx>`;
    const tr = parseGpxTrack(xml);
    assert.equal(tr.name, "Sortie & côtes");
    assert.equal(tr.type, "Run");
    assert.equal(tr.points.length, 2);
    assert.equal(tr.points[0].hr, 140);
    assert.equal(tr.points[0].cad, 172);
    assert.equal(parseTrackFile(new TextEncoder().encode(xml)).format, "gpx");
  });

  it("lit un TCX", () => {
    const xml = `<?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-09-20T07:00:00Z</Id>
      <Lap StartTime="2026-09-20T07:00:00Z"><TotalTimeSeconds>600</TotalTimeSeconds><DistanceMeters>2000</DistanceMeters><Calories>150</Calories><Track>
      <Trackpoint><Time>2026-09-20T07:00:00Z</Time><Position><LatitudeDegrees>48.8</LatitudeDegrees><LongitudeDegrees>2.3</LongitudeDegrees></Position><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>130</Value></HeartRateBpm></Trackpoint>
      <Trackpoint><Time>2026-09-20T07:10:00Z</Time><DistanceMeters>2000</DistanceMeters><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>
      </Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    const tr = parseTcx(xml);
    assert.equal(tr.type, "Run");
    assert.equal(tr.declared.distance, 2000);
    assert.equal(tr.declared.elapsed, 600);
    assert.equal(tr.points[1].hr, 150);
    assert.equal(tr.points[1].dist, 2000);
  });

  it("refuse un format inconnu", () => {
    assert.throws(() => parseTrackFile(new TextEncoder().encode("bonjour")));
  });
});

describe("toActivity", () => {
  const track = { format: "gpx" as const, name: null, type: "Run", points: straight(), declared: {} };
  const a = toActivity(track)!;

  it("distance, temps en mouvement (pause exclue), allure", () => {
    assert.ok(Math.abs(a.distance - 5200) < 20, `d=${a.distance}`);
    assert.ok(Math.abs(a.movingTime - 1733) < 10, `moving=${a.movingTime}`);
    assert.ok(a.elapsedTime >= a.movingTime + 59);
    assert.ok(Math.abs(a.averageSpeed! - 3) < 0.05);
  });

  it("km-splits comme Strava (index à partir de 1)", () => {
    assert.equal(a.splits.length, 6);
    assert.equal(a.splits[0].index, 1);
    assert.ok(Math.abs(a.splits[0].movingTime - 333) < 3);
    assert.equal(a.splits[2].averageHr, 150);
    assert.ok(a.splits[4].elevationDiff > 5);
  });

  it("dénivelé, tracé, courbe, meilleurs efforts", () => {
    assert.ok(a.totalElevation >= 18 && a.totalElevation <= 23, `D+=${a.totalElevation}`);
    const line = decodePolyline(a.polyline!);
    assert.ok(line.length >= 2);
    const s = decodeStream(a.stream!);
    assert.ok(s.hr.length > 1000);
    const k5 = a.bestEfforts.find((e) => e.name === "5K")!;
    assert.ok(Math.abs(k5.movingTime - 1667) < 5, `5k=${k5.movingTime}`);
    assert.equal(a.name, "Course matinale");
  });
});

describe("helpers", () => {
  it("dénivelé avec hystérésis (bruit ignoré)", () => {
    assert.equal(elevationGain([10, 11, 10, 11, 10, 11]), 0);
    assert.equal(elevationGain([10, 15, 12, 20]), 13);
  });
  it("doublons", () => {
    const d = new Date(T);
    assert.equal(sameActivity({ startDate: d, distance: 10000 }, { startDate: new Date(T + 60_000), distance: 10200 }), true);
    assert.equal(sameActivity({ startDate: d, distance: 10000 }, { startDate: new Date(T + 600_000), distance: 10000 }), false);
    assert.equal(sameActivity({ startDate: d, distance: 10000 }, { startDate: d, distance: 12000 }), false);
  });
  it("splits vides pour moins de 2 points", () => {
    assert.deepEqual(kmSplits(enrich([])), []);
    assert.deepEqual(bestEffortsOf(enrich([]), new Date()), []);
  });
});
