# AGENTS.md — consignes pour les agents qui travaillent sur La Foulée

Application d'entraînement course à pied : Next.js 15 (App Router, Turbopack),
Prisma (SQLite en dev, `prisma/dev.db`), synchronisation Strava. Interface
**multilingue** (fr par défaut, en, es — messages dans `messages/*.json`,
parité testée, clés i18n `next-intl` dans le code) ; commentaires et messages
de commit **en français**.

## ⛔ Zones gelées

| Zone | Statut | Depuis |
|---|---|---|
| **Musculation** — `src/app/strength/**`, `src/app/api/strength/**`, `src/components/strength/**`, `src/lib/strength.ts`, `src/lib/strength-store.ts`, `tests/strength.test.ts`, modèles Prisma `StrengthWorkout` / `StrengthSet` | **Gelée jusqu'au 24 sept. 2026, puis levée sur demande explicite** | gel 23 sept. 2026 |

La Muscu a été gelée le 23 sept. 2026 puis **dégelée le 24 sept. 2026** à la demande
explicite de Nassim, pour huit améliorations précises : force relative (1RM/poids),
garde-fou de charge (ACWR muscu), évolution de la chaîne du coureur, objectif de force,
duplication de séance, exercices épinglés, séance planifiée → modèle, RPE × charge.
On reste libre sur ces fichiers, mais on n'étend pas au-delà sans validation.

## Commandes

```bash
pnpm dev                                  # serveur de dev (localhost:3000)
pnpm test                                 # node --test sur tests/*.test.ts
npx tsc --noEmit -p .                     # vérification de types
pnpm build                                # build de prod (à lancer avant de conclure)
pnpm db:push                              # applique prisma/schema.prisma à la base
```

- Après une modification du schéma : `pnpm db:push` puis redémarrer le serveur de dev.
- `pnpm build` écrit dans `.next` : relancer le serveur de dev avec un `.next` propre ensuite.
- Ne jamais lancer `pkill -f "next dev"` dans la même commande shell qu'autre chose :
  le motif correspond au shell lui-même, qui se tue.

## Architecture

```
src/app/            pages (server components par défaut) et routes API
src/components/     composants ; "use client" seulement si nécessaire
src/components/ui/  primitives de mise en page (PageHead, Section, Empty…)
src/lib/            logique métier PURE et testée (aucun accès réseau/DB)
src/lib/*-store.ts, queries.ts, prisma.ts   accès base
tests/              un fichier par module de lib/ (node:test + tsx)
```

## Règles

- **Sécurité** : l'utilisateur vient toujours de la session (`requireUserId()`,
  `requireUser()`, `authed()` côté API), jamais du corps ou des paramètres de la
  requête. Toute requête Prisma filtre par `userId`. Entrées API validées avec zod.
- **Unités SI en base** : mètres, secondes, m/s. Conversion uniquement à l'affichage
  (`lib/format.ts`).
- **Logique dans `lib/`** : tout calcul non trivial est une fonction pure avec ses
  tests dans `tests/`. Les tests doivent tous passer avant un commit.
- **Pas de dépendance nouvelle** sans nécessité forte (les cartes sont en SVG pur,
  sans service de tuiles ; pas de bibliothèque de composants).
- **Strava** : respecter le quota (synchro incrémentale, une seule synchro à la
  fois par compte) ; ne jamais écraser les champs saisis par l'utilisateur
  (`privateNote`, `feeling`, `raceLocked`…).

## Design

Direction éditoriale / data-journalism, qui doit avoir du **relief** :

- Neutres chauds, **un seul accent** (terre cuite `clay`), palette data-viz
  désaturée (`ochre`, `sage`, `slate`, `plum`, `rust`). Jamais de couleurs
  Tailwind brutes (`red-500`, `green-200`…) : utiliser les tokens.
- Hiérarchie par le **contraste de tailles** : un grand chiffre ou une grande
  phrase par écran, puis du texte calme. Filets fins plutôt que cartes partout.
- Chaque page s'ouvre sur un en-tête qui dit quelque chose (état, chiffre clé,
  prochaine échéance), pas seulement un titre.
- Thèmes clair **et** sombre à vérifier tous les deux ; mobile (390 px) aussi.
- Respecter `prefers-reduced-motion` pour toute animation.

## Commits

Style conventionnel, en français : `feat(activités): …`, `fix(strava): …`,
`docs: …`. Un commit par ensemble cohérent. Mettre à jour le README quand une
fonctionnalité visible change.

## Rétrospective — leçons pour l'agent (à relire avant de coder)

Retour d'expérience accumulé sur ce projet, pour ne pas refaire les mêmes erreurs.

### Erreurs déjà commises → à éviter

1. **Se tuer soi-même en arrêtant le serveur.** `pkill -f "next dev"` ou
   `pgrep -f "next dev"` dans la même commande bash matche le *shell lui-même*
   (le motif apparaît dans la ligne de commande) → `exit 143`, la commande meurt.
   → Récupérer les PID dans une commande, les tuer dans une autre, ou utiliser
   `/tmp/restart.sh clean`.

2. **Juger un écran sans le regarder.** Selon l'outillage, les images
   peuvent ou non parvenir au modèle : vérifier d'abord (lire un PNG avec
   l'outil de lecture — une image jointe apparaît, ou rien). Si elles
   arrivent, **regarder vraiment** les captures (`.verify/shot.mts`) : la
   carte de l'atelier était « horrible » (étirée, zone utile minuscule, fond
   gris uniforme) alors que toutes les sondes DOM passaient. Sinon, vérifier
   via le DOM et ne jamais affirmer avoir « vu » un écran.

3. **Fuseaux horaires sur les regroupements.** `toISOString()` (UTC) décale
   d'un jour/mois l'axe des graphiques. Toujours des clés **en heure locale**
   (`localDayKey`, mois local) pour regrouper par jour/semaine/mois.

4. **Importer une constante d'un module client dans une page serveur.**
   Une valeur importée depuis un fichier `"use client"` arrive `undefined` côté
   serveur (légende grise, couleur manquante). Les constantes partagées vont
   dans `lib/`.

5. **Nettoyer après soi.** Les captures créent une session `shot…` en base +
   `/tmp/shots/.token` ; les vérifications insèrent parfois des données
   temporaires (objectif, séances). Tout supprimer avant de conclure.

6. **Pourcentages d'évolution sur un échantillon trop mince.** Ne pas afficher
   « +376 % » quand la période de référence ne compte que 2 sorties. Conditionner
   toute comparaison de tendance sur un minimum de données (ex. ≥ 4 sessions).

### Ce qui marche → à garder

- **Logique pure dans `lib/` + tests** : c'est ce qui a attrapé les régressions
  de dates et de récits avant le commit. Ne pas y déroger.
- **Commits petits et cohérents**, en français, style conventionnel, un seul
  sujet par commit.
- **Vocabulaire design partagé** (`PageHead`, `Section`, `NightBand`, tokens
  `clay`/`sage`/`ochre`…) : la cohérence visuelle vient de ces primitives, pas
  de retouches au cas par cas.
- **Vérifier le comportement en conditions réelles** : insérer une donnée
  temporaire, la contrôler, puis la supprimer — plutôt que « ça devrait marcher ».

### Rituel avant de déclarer « fait »

- [ ] `npx tsc --noEmit -p .` propre
- [ ] `node --import tsx --test tests/*.test.ts` tout vert
- [ ] `pnpm build` OK, puis serveur de dev relancé proprement
- [ ] thème clair **et** sombre, mobile 390 px, `prefers-reduced-motion` respecté
- [ ] données temporaires + sessions de capture supprimées
- [ ] README à jour si un changement visible
