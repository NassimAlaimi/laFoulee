/**
 * Effacement des données Strava d'un utilisateur (politique API Strava §7.4 :
 * à la révocation, supprimer toutes ses données Strava et celles qui en
 * dérivent).
 *
 * Ce qui part : tokens, activités venues de Strava (courbes, km par km,
 * records par cascade), équipement (issu de Strava), photo de profil Strava,
 * cache du réseau de parcours (construit depuis les tracés).
 * Ce qui reste : ce que l'utilisateur a saisi ou importé lui-même (fichiers
 * de montre — simplement détachés de leur jumeau Strava —, carnet, objectifs,
 * plans, parcours dessinés, muscu).
 */
import { prisma } from "./prisma";

export type PurgeReport = { activities: number; unlinked: number; gear: number };

export async function purgeStravaData(userId: string): Promise<PurgeReport> {
  const [, activities, unlinked, gear] = await prisma.$transaction([
    prisma.stravaAccount.deleteMany({ where: { userId } }),
    prisma.activity.deleteMany({ where: { userId, source: "strava" } }),
    prisma.activity.updateMany({ where: { userId, stravaId: { not: null } }, data: { stravaId: null } }),
    prisma.gear.deleteMany({ where: { userId } }),
    prisma.routeGraph.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } }),
  ]);
  return { activities: activities.count, unlinked: unlinked.count, gear: gear.count };
}

/** Une activité supprimée sur Strava (§6.3, 48 h). Un jumeau importé depuis un
 *  fichier de montre appartient à l'utilisateur : il est seulement détaché. */
export async function forgetStravaActivity(userId: string, stravaId: bigint): Promise<void> {
  await prisma.activity.deleteMany({ where: { userId, stravaId, source: "strava" } });
  await prisma.activity.updateMany({ where: { userId, stravaId }, data: { stravaId: null } });
}
