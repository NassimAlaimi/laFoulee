/**
 * Lecture d'archives ZIP (export complet Garmin, lots de fichiers) sans
 * dépendance : répertoire central + inflate de Node (zlib). Les archives
 * imbriquées sont dépliées récursivement (l'export Garmin range les fichiers
 * d'activité dans des zips à l'intérieur du zip).
 *
 * ZIP64 non géré : au-delà de 4 Go, il faut découper l'export.
 */

import { inflateRawSync } from "node:zlib";

export type ZipEntry = { name: string; bytes: Uint8Array };

export class ZipError extends Error {}

export function isZip(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

export function readZip(
  buf: Uint8Array,
  accept: (name: string) => boolean = () => true,
  depth = 0
): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("eocd");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new ZipError("central");
    const method = view.getUint16(p + 10, true);
    const csize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const nested = /\.zip$/i.test(name) && depth < 3;
    if (name.endsWith("/") || (!nested && !accept(name))) continue;
    if (view.getUint32(local, true) !== 0x04034b50) continue;
    const lName = view.getUint16(local + 26, true);
    const lExtra = view.getUint16(local + 28, true);
    const start = local + 30 + lName + lExtra;
    const raw = buf.subarray(start, start + csize);
    let bytes: Uint8Array;
    if (method === 0) bytes = raw;
    else if (method === 8) bytes = new Uint8Array(inflateRawSync(raw));
    else continue;
    if (nested) out.push(...readZip(bytes, accept, depth + 1));
    else out.push({ name, bytes });
  }
  return out;
}
