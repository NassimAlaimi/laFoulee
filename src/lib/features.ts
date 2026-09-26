/**
 * Interrupteurs de fonctionnalités.
 *
 * Brief de l'agent (LLM) : **désactivé** avant l'ouverture publique. La
 * politique API de Strava (§5.3) interdit de faire passer des données Strava
 * — même agrégées — dans une application d'IA, et l'appel au LLM n'est pas
 * plafonné. Le code reste en place pour être retravaillé ; `FEATURE_AGENT_BRIEF=1`
 * le rallume en développement.
 */
export function agentBriefEnabled(): boolean {
  return process.env.FEATURE_AGENT_BRIEF === "1";
}
