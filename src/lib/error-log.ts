/**
 * Journal des erreurs serveur, consultable par l'admin (Réglages).
 *
 * Sans lui, une panne en production ne se voit que dans `journalctl` — donc
 * jamais. Chaque erreur inattendue (route, page, action serveur) est
 * enregistrée, regroupée par empreinte, et purgée au bout de 30 jours.
 * Ne lève jamais : journaliser ne doit pas créer une seconde panne.
 */
import { prisma } from "./prisma";
import { errorFingerprint } from "./error-fingerprint";

const RETENTION_MS = 30 * 86_400_000;
let lastPrune = 0;

export async function recordError(source: string, err: unknown): Promise<void> {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const message = `${e.name}: ${e.message}`.slice(0, 2000);
    const stack = e.stack?.slice(0, 4000) ?? null;
    const fingerprint = errorFingerprint(source, message);
    const now = new Date();
    await prisma.errorLog.upsert({
      where: { fingerprint },
      create: { fingerprint, source: source.slice(0, 200), message, stack },
      update: { count: { increment: 1 }, lastAt: now, message, stack },
    });
    if (now.getTime() - lastPrune > 3_600_000) {
      lastPrune = now.getTime();
      await prisma.errorLog.deleteMany({ where: { lastAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
    }
  } catch (e) {
    console.error("[error-log] impossible d'enregistrer l'erreur", e);
  }
}
