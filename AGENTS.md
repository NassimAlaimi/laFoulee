# AGENTS.md — consignes pour les agents qui travaillent sur La Foulée

Application d'entraînement course à pied : Next.js 15 (App Router, Turbopack),
Prisma (SQLite en dev, `prisma/dev.db`), synchronisation Strava. Interface,
commentaires et messages de commit **en français**.

## ⛔ Zones gelées

| Zone | Statut | Depuis |
|---|---|---|
| **Musculation** — `src/app/strength/**`, `src/app/api/strength/**`, `src/components/strength/**`, `src/lib/strength.ts`, `src/lib/strength-store.ts`, `tests/strength.test.ts`, modèles Prisma `StrengthWorkout` / `StrengthSet` | **Gelée : ne pas modifier** | 23 sept. 2026 |

Tant qu'une zone est gelée : pas de nouvelle fonctionnalité, pas de refonte, pas
de retouche visuelle, pas de renommage. Seule exception : un changement ailleurs
qui casserait la compilation ou les tests de la zone (adapter le strict minimum
et le signaler). Les autres pages peuvent continuer à *lire* ses données (ex. la
rétrospective affiche le nombre de séances de renfo). Le gel ne se lève que sur
demande explicite du propriétaire.

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
