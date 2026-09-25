/**
 * Décodeur FIT minimal (Garmin, Coros, Suunto, Wahoo…) — TypeScript pur,
 * sans dépendance.
 *
 * Le protocole FIT est un flux binaire de messages « définition » (le schéma
 * d'un type local : numéro global, champs, tailles, types de base) suivis de
 * messages « données » qui s'y réfèrent. On ne lit que ce qui sert à l'app :
 *
 * - `file_id` (0)  : type de fichier (4 = activité, 5 = séance d'entraînement) ;
 * - `session` (18) : totaux de la sortie (sport, durée, distance, FC, D+…) ;
 * - `lap` (19)     : tours ;
 * - `record` (20)  : points à la seconde (position, altitude, FC, vitesse,
 *   cadence, distance cumulée).
 *
 * Tout le reste (champs développeur, messages inconnus) est sauté proprement.
 * Référence : FIT SDK, « Flexible and Interoperable Data Transfer Protocol ».
 *
 * Testé dans tests/fit.test.ts, avec des fichiers fabriqués par `encodeFit`
 * (l'encodeur sert aussi à exporter des séances vers la montre).
 */

/** Secondes entre l'époque Unix et l'époque FIT (31/12/1989 00:00 UTC). */
export const FIT_EPOCH = 631065600;
const SEMI_TO_DEG = 180 / 2 ** 31;

export type FitRecord = {
  time: Date;
  lat: number | null;
  lon: number | null;
  /** m */
  altitude: number | null;
  hr: number | null;
  /** pas/min (deux jambes) */
  cadence: number | null;
  /** m cumulés */
  distance: number | null;
  /** m/s */
  speed: number | null;
};

export type FitLap = {
  start: Date;
  elapsed: number;
  timer: number;
  distance: number;
  avgHr: number | null;
  avgSpeed: number | null;
  ascent: number | null;
  descent: number | null;
};

export type FitSession = {
  start: Date;
  sport: number | null;
  subSport: number | null;
  elapsed: number | null;
  timer: number | null;
  distance: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  ascent: number | null;
  calories: number | null;
  /** pas/min (deux jambes) */
  avgCadence: number | null;
};

export type FitActivity = {
  fileType: number | null;
  sessions: FitSession[];
  laps: FitLap[];
  records: FitRecord[];
};

// ---------------------------------------------------------------- Types de base

type BaseType = { size: number; read: (v: DataView, o: number, le: boolean) => number | bigint | null };

function num(invalid: number, fn: (v: DataView, o: number, le: boolean) => number): BaseType["read"] {
  return (v, o, le) => {
    const x = fn(v, o, le);
    return x === invalid ? null : x;
  };
}

const BASE: Record<number, BaseType> = {
  0x00: { size: 1, read: num(0xff, (v, o) => v.getUint8(o)) }, // enum
  0x01: { size: 1, read: num(0x7f, (v, o) => v.getInt8(o)) },
  0x02: { size: 1, read: num(0xff, (v, o) => v.getUint8(o)) },
  0x83: { size: 2, read: num(0x7fff, (v, o, le) => v.getInt16(o, le)) },
  0x84: { size: 2, read: num(0xffff, (v, o, le) => v.getUint16(o, le)) },
  0x85: { size: 4, read: num(0x7fffffff, (v, o, le) => v.getInt32(o, le)) },
  0x86: { size: 4, read: num(0xffffffff, (v, o, le) => v.getUint32(o, le)) },
  0x88: { size: 4, read: (v, o, le) => {
    const x = v.getFloat32(o, le);
    return Number.isFinite(x) ? x : null;
  } },
  0x89: { size: 8, read: (v, o, le) => {
    const x = v.getFloat64(o, le);
    return Number.isFinite(x) ? x : null;
  } },
  0x0a: { size: 1, read: num(0, (v, o) => v.getUint8(o)) },
  0x8b: { size: 2, read: num(0, (v, o, le) => v.getUint16(o, le)) },
  0x8c: { size: 4, read: num(0, (v, o, le) => v.getUint32(o, le)) },
};

type FieldDef = { num: number; size: number; base: number };
type Definition = { global: number; le: boolean; fields: FieldDef[]; devSize: number };

function readField(view: DataView, offset: number, f: FieldDef, le: boolean): number | null {
  const bt = BASE[f.base];
  // Tableau ou type inconnu : on ne lit que le premier élément s'il est numérique.
  if (!bt || f.size < bt.size) return null;
  const v = bt.read(view, offset, le);
  return typeof v === "bigint" ? Number(v) : v;
}

export class FitError extends Error {}

/** Décode un fichier FIT. Lève FitError si l'en-tête est invalide. */
export function decodeFit(bytes: Uint8Array): FitActivity {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) throw new FitError("short");
  const headerSize = bytes[0];
  if (headerSize !== 12 && headerSize !== 14) throw new FitError("header");
  const sig = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (sig !== ".FIT") throw new FitError("signature");
  const dataSize = view.getUint32(4, true);
  const end = Math.min(bytes.length, headerSize + dataSize);

  const defs = new Map<number, Definition>();
  const out: FitActivity = { fileType: null, sessions: [], laps: [], records: [] };
  let lastTimestamp = 0;
  let p = headerSize;

  while (p < end) {
    const h = bytes[p++];
    let local: number;
    let compressedTs: number | null = null;
    if (h & 0x80) {
      // En-tête d'horodatage compressé : données, type local sur 2 bits.
      local = (h >> 5) & 0x03;
      const offset = h & 0x1f;
      let ts = (lastTimestamp & ~0x1f) + offset;
      if (offset < (lastTimestamp & 0x1f)) ts += 0x20;
      compressedTs = ts;
      lastTimestamp = ts;
    } else if (h & 0x40) {
      // Message de définition
      local = h & 0x0f;
      const dev = Boolean(h & 0x20);
      if (p + 5 > end) break;
      const le = bytes[p + 1] === 0;
      const global = le ? view.getUint16(p + 2, true) : view.getUint16(p + 2, false);
      const n = bytes[p + 4];
      p += 5;
      const fields: FieldDef[] = [];
      for (let i = 0; i < n; i++) {
        fields.push({ num: bytes[p], size: bytes[p + 1], base: bytes[p + 2] });
        p += 3;
      }
      let devSize = 0;
      if (dev) {
        const nd = bytes[p++];
        for (let i = 0; i < nd; i++) {
          devSize += bytes[p + 1];
          p += 3;
        }
      }
      defs.set(local, { global, le, fields, devSize });
      continue;
    } else {
      local = h & 0x0f;
    }

    const def = defs.get(local);
    if (!def) throw new FitError("undefined-local");
    const values = new Map<number, number | null>();
    for (const f of def.fields) {
      if (p + f.size > end) break;
      values.set(f.num, readField(view, p, f, def.le));
      p += f.size;
    }
    p += def.devSize;
    const ts = values.get(253);
    if (ts != null) lastTimestamp = ts;
    const tsVal = ts ?? compressedTs;
    handle(def.global, values, tsVal, out);
  }
  return out;
}

const date = (fitSeconds: number | null | undefined) =>
  fitSeconds == null ? null : new Date((fitSeconds + FIT_EPOCH) * 1000);
const scaled = (v: number | null | undefined, scale: number, offset = 0) => (v == null ? null : v / scale - offset);

function handle(global: number, v: Map<number, number | null>, ts: number | null, out: FitActivity) {
  switch (global) {
    case 0:
      out.fileType = v.get(0) ?? null;
      return;
    case 20: {
      const time = date(ts);
      if (!time) return;
      const lat = v.get(0);
      const lon = v.get(1);
      const cad = v.get(4);
      const frac = v.get(53);
      out.records.push({
        time,
        lat: lat != null ? lat * SEMI_TO_DEG : null,
        lon: lon != null ? lon * SEMI_TO_DEG : null,
        altitude: scaled(v.get(78), 5, 500) ?? scaled(v.get(2), 5, 500),
        hr: v.get(3) ?? null,
        cadence: cad != null ? Math.round((cad + (frac != null ? frac / 128 : 0)) * 2) : null,
        distance: scaled(v.get(5), 100),
        speed: scaled(v.get(73), 1000) ?? scaled(v.get(6), 1000),
      });
      return;
    }
    case 19: {
      const start = date(v.get(2)) ?? date(ts);
      if (!start) return;
      out.laps.push({
        start,
        elapsed: scaled(v.get(7), 1000) ?? 0,
        timer: scaled(v.get(8), 1000) ?? 0,
        distance: scaled(v.get(9), 100) ?? 0,
        avgHr: v.get(15) ?? null,
        avgSpeed: scaled(v.get(110), 1000) ?? scaled(v.get(13), 1000),
        ascent: v.get(21) ?? null,
        descent: v.get(22) ?? null,
      });
      return;
    }
    case 18: {
      const start = date(v.get(2)) ?? date(ts);
      if (!start) return;
      const cad = v.get(18);
      out.sessions.push({
        start,
        sport: v.get(5) ?? null,
        subSport: v.get(6) ?? null,
        elapsed: scaled(v.get(7), 1000),
        timer: scaled(v.get(8), 1000),
        distance: scaled(v.get(9), 100),
        avgHr: v.get(16) ?? null,
        maxHr: v.get(17) ?? null,
        avgSpeed: scaled(v.get(124), 1000) ?? scaled(v.get(14), 1000),
        maxSpeed: scaled(v.get(125), 1000) ?? scaled(v.get(15), 1000),
        ascent: v.get(22) ?? null,
        calories: v.get(11) ?? null,
        avgCadence: cad != null ? cad * 2 : null,
      });
      return;
    }
  }
}

/** Type d'activité de l'app (vocabulaire Strava) depuis sport / sous-sport FIT. */
export function fitSportType(sport: number | null, subSport: number | null): string {
  switch (sport) {
    case 1:
      return subSport === 3 ? "TrailRun" : subSport === 1 ? "VirtualRun" : "Run";
    case 2:
      return "Ride";
    case 5:
      return "Swim";
    case 11:
      return "Walk";
    case 17:
      return "Hike";
    case 10:
    case 4:
      return "Workout";
    default:
      return "Workout";
  }
}

// ---------------------------------------------------------------- Encodeur

/**
 * CRC FIT (polynôme 0x8408 table 16 entrées) — utilisé par l'encodeur, et
 * pour vérifier les fichiers si besoin.
 */
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

export type EncField = { num: number; base: number; size: number; value: number | string | null };
export type EncMessage = { global: number; fields: EncField[] };

/**
 * Encodeur FIT générique (petit-boutiste, une définition par message).
 * Suffisant pour produire un fichier « séance d'entraînement » (workout)
 * que les montres Garmin acceptent en copie USB (dossier NewFiles).
 */
export function encodeFit(messages: EncMessage[]): Uint8Array {
  const chunks: number[] = [];
  const push16 = (x: number) => chunks.push(x & 0xff, (x >> 8) & 0xff);
  const push32 = (x: number) => chunks.push(x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff);
  const INVALID: Record<number, number> = { 0x00: 0xff, 0x02: 0xff, 0x84: 0xffff, 0x86: 0xffffffff, 0x0a: 0, 0x8b: 0, 0x8c: 0, 0x01: 0x7f, 0x83: 0x7fff, 0x85: 0x7fffffff };
  let lastSig = "";
  for (const m of messages) {
    const sig = `${m.global}:${m.fields.map((f) => `${f.num}.${f.size}.${f.base}`).join(",")}`;
    if (sig !== lastSig) {
      chunks.push(0x40, 0, 0);
      push16(m.global);
      chunks.push(m.fields.length);
      for (const f of m.fields) chunks.push(f.num, f.size, f.base);
      lastSig = sig;
    }
    chunks.push(0x00);
    for (const f of m.fields) {
      if (f.base === 0x07) {
        const s = new TextEncoder().encode(String(f.value ?? ""));
        for (let i = 0; i < f.size; i++) chunks.push(i < s.length && i < f.size - 1 ? s[i] : 0);
        continue;
      }
      const v = f.value == null ? INVALID[f.base] ?? 0 : Number(f.value);
      if (f.size === 1) chunks.push(v & 0xff);
      else if (f.size === 2) push16(v);
      else push32(v);
    }
  }
  const data = Uint8Array.from(chunks);
  const out = new Uint8Array(14 + data.length + 2);
  const dv = new DataView(out.buffer);
  out[0] = 14;
  out[1] = 0x10;
  dv.setUint16(2, 2132, true);
  dv.setUint32(4, data.length, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8);
  dv.setUint16(12, fitCrc(out, 0, 12), true);
  out.set(data, 14);
  dv.setUint16(14 + data.length, fitCrc(out, 0, 14 + data.length), true);
  return out;
}
