/**
 * Chiffrement des secrets au repos (tokens Strava, et tout ce qui mérite de ne
 * pas traîner en clair dans SQLite). AES-256-GCM, IV aléatoire par valeur.
 *
 * Fonctions pures (la clé est passée en argument) pour être testables ; le
 * chargement de la clé depuis l'environnement est isolé dans `secretKeyFromEnv`.
 *
 * Une valeur chiffrée porte le préfixe `enc:v1:` — c'est ce qui permet de
 * distinguer un token récent chiffré d'un token **hérité** stocké en clair
 * avant l'introduction du chiffrement (migration paresseuse : on continue de
 * lire l'ancien format, on réécrit chiffré à la prochaine occasion).
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "enc:v1:";

/**
 * Clé de 32 octets depuis `SECRET_KEY`. Accepte 64 caractères hex (usage
 * recommandé : `openssl rand -hex 32`), sinon dérive via SHA-256 (toujours
 * 32 octets, quel que soit l'input).
 *
 * Lève si la variable est absente : sans clé, on ne chiffre rien, et on refuse
 * explicitement plutôt que de retomber en clair silencieusement.
 */
export function secretKeyFromEnv(
  env: Record<string, string | undefined> = process.env
): Buffer {
  const raw = (env.TOKEN_SECRET ?? "").trim();
  if (!raw) {
    throw new Error(
      "TOKEN_SECRET manquant. Génère-le avec `openssl rand -hex 32` et ajoute-le à .env."
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${enc.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  const body = payload.startsWith(PREFIX) ? payload.slice(PREFIX.length) : payload;
  const [ivB64, encB64, tagB64] = body.split(".");
  if (!ivB64 || !encB64 || !tagB64) {
    throw new Error("Secret chiffré illisible (format attendu enc:v1:iv.data.tag)");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64url")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Déchiffre si nécessaire ; renvoie la valeur telle quelle si elle est en clair. */
export function decryptIfNeeded(value: string, key: Buffer): string {
  return isEncrypted(value) ? decryptSecret(value, key) : value;
}
