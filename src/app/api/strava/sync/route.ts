import { sameActivity } from "@/lib/track-import";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import {
  fetchActivities,
  fetchActivityDetail,
  fetchActivityStreams,
  fetchGear,
  getValidAccessToken,
  RUN_TYPES,
  type StravaSummaryActivity,
} from "@/lib/strava";
import { encodeStream } from "@/lib/cardio";
import { UpstreamError, UserFacingError, errorCode, toSafeMessage } from "@/lib/http-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Durée du bail de synchro : au-delà de maxDuration, un verrou orphelin
 *  (processus tué en pleine synchro) se libère de lui-même. */
const SYNC_LEASE_MS = 6 * 60_000;

/**
 * POST /api/strava/sync
 * body: { full?: boolean, detailLimit?: number }
 *
 * - incrémental par défaut (depuis le dernier sync)
 * - `full: true` → réimporte tout l'historique
 * - enrichit les N dernières courses avec best efforts + splits
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Une synchro déjà en cours pour ce compte (autre onglet, synchro auto) :
  // on n'en lance pas une seconde. Le verrou est pris par un seul UPDATE
  // conditionnel — atomique : deux requêtes simultanées ne peuvent pas toutes
  // deux le prendre (l'ancien « lire puis écrire » laissait passer les deux,
  // qui rafraîchissaient alors le jeton Strava en même temps et le cassaient).
  const now = new Date();
  const claimed = await prisma.stravaAccount.updateMany({
    where: {
      userId,
      OR: [{ syncingSince: null }, { syncingSince: { lt: new Date(now.getTime() - SYNC_LEASE_MS) } }],
    },
    data: { syncingSince: now },
  });
  if (claimed.count === 0) {
    const hasAccount = await prisma.stravaAccount.count({ where: { userId } });
    if (!hasAccount) return NextResponse.json({ ok: false, error: "no-account" }, { status: 400 });
    return NextResponse.json({ ok: false, busy: true, error: "busy" }, { status: 409 });
  }

  const log = await prisma.syncLog.create({ data: { userId } });

  try {
    const body = await req.json().catch(() => ({}));
    const full = Boolean(body.full);
    const detailLimit = Number(body.detailLimit ?? 30);

    const account = await prisma.stravaAccount.findUnique({ where: { userId } });
    if (!account) {
      throw new UserFacingError("Aucun compte Strava connecté.", "no-account");
    }

    const token = await getValidAccessToken(userId);

    // Point de reprise : dernière activité connue moins 1 jour (sécurité)
    let after: number | undefined;
    if (!full) {
      const last = await prisma.activity.findFirst({
        where: { userId },
        orderBy: { startDate: "desc" },
        select: { startDate: true },
      });
      if (last) {
        after = Math.floor(last.startDate.getTime() / 1000) - 86400;
      }
    }

    const summaries = await fetchActivities(token, {
      after,
      maxPages: full ? 50 : 5,
    });

    let imported = 0;
    let updated = 0;

    for (const s of summaries) {
      // L'unicité est (utilisateur, activité Strava) : une sortie de groupe
      // importée par deux coureurs donne bien deux lignes, une par compte.
      const existing = await prisma.activity.findUnique({
        where: { userId_stravaId: { userId, stravaId: BigInt(s.id) } },
        select: { id: true, raceLocked: true },
      });

      const data = mapSummary(s);

      if (existing) {
        // Un drapeau « course » posé à la main l'emporte sur le workout_type Strava
        const { isRace, ...rest } = data;
        await prisma.activity.update({
          where: { id: existing.id },
          data: existing.raceLocked ? rest : { ...rest, isRace },
        });
        updated++;
      } else {
        // Même sortie déjà importée depuis un fichier (FIT/GPX/TCX) ? On lui
        // rattache l'identifiant Strava au lieu de créer un doublon. Les
        // détails issus du fichier (courbe, splits) sont conservés ; le tracé
        // fin du fichier l'emporte sur le tracé résumé de Strava.
        const around = await prisma.activity.findMany({
          where: {
            userId,
            stravaId: null,
            startDate: {
              gte: new Date(data.startDate.getTime() - 180_000),
              lte: new Date(data.startDate.getTime() + 180_000),
            },
          },
          select: { id: true, startDate: true, distance: true, polyline: true, raceLocked: true },
        });
        const twin = around.find((x) => sameActivity(x, data));
        if (twin) {
          const { isRace, polyline, ...rest } = data;
          await prisma.activity.update({
            where: { id: twin.id },
            data: {
              ...rest,
              stravaId: BigInt(s.id),
              ...(twin.polyline ? {} : { polyline }),
              ...(twin.raceLocked ? {} : { isRace }),
            },
          });
          updated++;
        } else {
          await prisma.activity.create({
            data: { ...data, userId, stravaId: BigInt(s.id) },
          });
          imported++;
        }
      }
    }

    // Enrichissement : best efforts + splits sur les courses récentes
    const runsToDetail = await prisma.activity.findMany({
      where: {
        userId,
        type: { in: [...RUN_TYPES] },
        stravaId: { not: null },
        bestEfforts: { none: {} },
      },
      orderBy: { startDate: "desc" },
      take: detailLimit,
      select: { id: true, stravaId: true },
    });

    for (const run of runsToDetail) {
      if (!run.stravaId) continue;
      try {
        const detail = await fetchActivityDetail(token, run.stravaId);

        if (detail.best_efforts?.length) {
          await prisma.bestEffort.deleteMany({ where: { activityId: run.id } });
          await prisma.bestEffort.createMany({
            data: detail.best_efforts.map((e) => ({
              activityId: run.id,
              name: e.name,
              distance: e.distance,
              movingTime: e.moving_time,
              elapsedTime: e.elapsed_time,
              startDate: new Date(e.start_date),
              prRank: e.pr_rank,
            })),
          });
        }

        if (detail.splits_metric?.length) {
          await prisma.split.deleteMany({ where: { activityId: run.id } });
          await prisma.split.createMany({
            data: detail.splits_metric.map((sp) => ({
              activityId: run.id,
              index: sp.split,
              distance: sp.distance,
              movingTime: sp.moving_time,
              elapsedTime: sp.elapsed_time,
              elevationDiff: sp.elevation_difference ?? 0,
              averageSpeed: sp.average_speed ?? null,
              averageHr: sp.average_heartrate ?? null,
            })),
          });
        }

        if (detail.calories) {
          await prisma.activity.update({
            where: { id: run.id },
            data: { calories: detail.calories, notes: detail.description ?? null },
          });
        }
      } catch (e) {
        // Rate limit ou activité inaccessible → on arrête l'enrichissement
        if (e instanceof UpstreamError && e.status === 429) break;
      }
    }

    // Équipements : une requête par matériel inconnu, jamais en boucle sur
    // les activités (on tomberait immédiatement sur la limite d'API).
    const gearIds = await prisma.activity.findMany({
      where: { userId, gearId: { not: null } },
      distinct: ["gearId"],
      select: { gearId: true },
    });
    const knownGear = new Set(
      (
        await prisma.gear.findMany({ where: { userId }, select: { stravaGearId: true } })
      ).map((g) => g.stravaGearId)
    );

    for (const { gearId } of gearIds) {
      if (!gearId || knownGear.has(gearId)) continue;
      try {
        const g = await fetchGear(token, gearId);
        await prisma.gear.upsert({
          where: { userId_stravaGearId: { userId, stravaGearId: g.id } },
          create: {
            userId,
            stravaGearId: g.id,
            name: g.name,
            brand: g.brand_name ?? null,
            model: g.model_name ?? null,
            stravaDistance: g.distance ?? 0,
            retired: Boolean(g.retired),
            primary: Boolean(g.primary),
          },
          update: {
            name: g.name,
            brand: g.brand_name ?? null,
            model: g.model_name ?? null,
            stravaDistance: g.distance ?? 0,
            retired: Boolean(g.retired),
          },
        });
      } catch (e) {
        if (e instanceof UpstreamError && e.status === 429) break;
      }
    }

    // Courbes FC/vitesse : une requête par course récente avec cardio, une
    // seule fois. Borné à 12 par synchro pour préserver le quota ; une ligne
    // HrStream (même vide) marque la tentative, on ne réessaie plus.
    const runsToStream = await prisma.activity.findMany({
      where: {
        userId,
        type: { in: [...RUN_TYPES] },
        stravaId: { not: null },
        hasHeartrate: true,
        hrStream: { is: null },
        startDate: { gte: new Date(Date.now() - 90 * 86400000) },
      },
      orderBy: { startDate: "desc" },
      take: 12,
      select: { id: true, stravaId: true, averageSpeed: true },
    });

    let streamed = 0;
    for (const run of runsToStream) {
      if (!run.stravaId) continue;
      try {
        const streams = await fetchActivityStreams(token, run.stravaId);
        const hrData = streams.heartrate?.data;
        if (!hrData?.length) {
          // Pas de cardio dans les streams : on marque pour ne plus réessayer.
          await prisma.hrStream.create({ data: { activityId: run.id, series: "" } });
          continue;
        }
        const n = hrData.length;
        const speedData = streams.velocity_smooth?.data;
        const fallbackSpeed = run.averageSpeed ?? 0;
        const series = encodeStream({
          time:
            streams.time?.data ?? Array.from({ length: n }, (_, i) => i),
          hr: hrData,
          speed: Array.from({ length: n }, (_, i) =>
            speedData && speedData[i] != null ? speedData[i] : fallbackSpeed
          ),
        });
        await prisma.hrStream.create({ data: { activityId: run.id, series } });
        streamed++;
      } catch (e) {
        // 404 = pas de streams pour cette activité : marquée vide, on passe.
        if (e instanceof UpstreamError && e.status === 404) {
          await prisma.hrStream
            .create({ data: { activityId: run.id, series: "" } })
            .catch(() => undefined);
          continue;
        }
        if (e instanceof UpstreamError && e.status === 429) break;
      }
    }

    await prisma.stravaAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    });

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        finishedAt: new Date(),
        status: "success",
        imported,
        updated,
        message: `${imported} nouvelles, ${updated} mises à jour, ${runsToDetail.length} enrichies, ${streamed} courbes cardio`,
      },
    });

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      detailed: runsToDetail.length,
      streamed,
    });
  } catch (e) {
    // La cause réelle part dans les logs serveur (toSafeMessage) ; on ne
    // stocke et on ne renvoie que le message sûr.
    const message = toSafeMessage(e, "POST /api/strava/sync");
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: "error", message },
    });
    // Un code, traduit par l'interface (syncErrors.*), jamais la cause réelle.
    return NextResponse.json({ ok: false, error: errorCode(e) }, { status: 500 });
  } finally {
    // Levée du verrou (seulement le nôtre : `syncingSince` inchangé).
    await prisma.stravaAccount
      .updateMany({ where: { userId, syncingSince: now }, data: { syncingSince: null } })
      .catch(() => undefined);
  }
}

function mapSummary(s: StravaSummaryActivity) {
  return {
    source: "strava",
    name: s.name,
    type: s.type,
    sportType: s.sport_type ?? null,
    startDate: new Date(s.start_date),
    timezone: s.timezone ?? null,
    distance: s.distance ?? 0,
    movingTime: s.moving_time ?? 0,
    elapsedTime: s.elapsed_time ?? 0,
    totalElevation: s.total_elevation_gain ?? 0,
    averageSpeed: s.average_speed ?? null,
    maxSpeed: s.max_speed ?? null,
    averageHr: s.average_heartrate ?? null,
    maxHr: s.max_heartrate ?? null,
    hasHeartrate: Boolean(s.has_heartrate),
    sufferScore: s.suffer_score ?? null,
    averageCadence: s.average_cadence ? s.average_cadence * 2 : null, // Strava donne 1 jambe
    isRace: s.workout_type === 1 || s.workout_type === 11,
    isCommute: Boolean(s.commute),
    isTrainer: Boolean(s.trainer),
    gearId: s.gear_id ?? null,
    polyline: s.map?.summary_polyline ?? null,
  };
}
