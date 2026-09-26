/**
 * Freinage des tentatives de connexion par mot de passe.
 *
 * En mémoire (une instance = un processus) : suffisant pour décourager le
 * bourrage d'identifiants sans table ni dépendance. Le temps est injecté
 * pour les tests.
 */
export type ThrottleOptions = { maxFailures: number; windowMs: number };

export const DEFAULT_THROTTLE: ThrottleOptions = { maxFailures: 5, windowMs: 15 * 60_000 };

export class LoginThrottle {
  private failures = new Map<string, number[]>();

  constructor(private opts: ThrottleOptions = DEFAULT_THROTTLE) {}

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.opts.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Bloqué ? (trop d'échecs récents pour cette clé) */
  blocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.opts.maxFailures;
  }

  fail(key: string, now = Date.now()): void {
    this.failures.set(key, [...this.recent(key, now), now]);
    // Garde-fou mémoire : on ne garde jamais plus de 10 000 clés.
    if (this.failures.size > 10_000) {
      const first = this.failures.keys().next().value;
      if (first !== undefined) this.failures.delete(first);
    }
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }
}
