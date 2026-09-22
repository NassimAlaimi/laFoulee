import { NextResponse } from "next/server";
import { currentUserId } from "./auth";

/**
 * Garde commune aux routes API.
 *
 * Renvoie soit l'identifiant de l'utilisateur, soit la réponse 401 à retourner
 * telle quelle. Le middleware bloque déjà les requêtes sans cookie ; cette
 * vérification-ci est celle qui compte, car elle valide la session en base.
 */
export async function authed(): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const userId = await currentUserId();
  if (!userId) {
    return {
      userId: null,
      error: NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 }),
    };
  }
  return { userId, error: null };
}

/** Ressource inexistante *ou* appartenant à quelqu'un d'autre : même réponse. */
export function notFound(message = "Introuvable") {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}
