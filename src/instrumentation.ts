/**
 * Démarrage du serveur : branche le journal des erreurs (lib/error-log.ts).
 *
 * - `onRequestError` (Next 15) reçoit toute erreur non rattrapée d'une page,
 *   d'une route ou d'une action serveur ;
 * - `setErrorReporter` couvre les erreurs rattrapées par `toSafeMessage`
 *   (celles que l'utilisateur voit sous forme de message générique).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ setErrorReporter }, { recordError }] = await Promise.all([
    import("./lib/http-error"),
    import("./lib/error-log"),
  ]);
  setErrorReporter((source, err) => void recordError(source, err));
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("./lib/error-log");
  // routePath (« /activities/[id] ») plutôt que path : pas d'identifiant ni de
  // paramètre de requête dans le journal, et les occurrences se regroupent.
  const where = context.routePath ?? request.path.split("?")[0];
  await recordError(`${request.method} ${where} (${context.routeType ?? "?"})`, err);
}
