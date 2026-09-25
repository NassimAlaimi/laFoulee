# La Foulée — feuille de route (réflexion, sept. 2026)

> Document de conception, **rien n'est codé**. Chaque chantier donne : le
> diagnostic (ancré dans le code actuel), le contenu proposé, le modèle de
> données, la logique pure à écrire dans `lib/` (+ tests), l'UI, les risques et
> une taille (S ≈ une session, M ≈ 2-3, L ≈ 4+).

---

## Décisions de Nassim (25 sept. 2026)

| Question | Décision | Effet sur le plan |
|---|---|---|
| Agent | **LLM distant dans un premier temps** | E1 : fournisseur distant via `fetch`, local (Ollama) plus tard. Minimisation des données envoyées (voir E1). |
| Garmin | **Import de fichiers suffisant** | D : pas d'API Garmin ; FIT/GPX/TCX + zip d'export. |
| Parcours | **Dessiner des parcours d'entraînement** | C1 réécrit : « Atelier de parcours ». La reconnaissance du parcours de course reste dans C2. |
| Dashboard | **« Brainstorme quelque chose de cool »** | F1 réécrit : « La Une » contextuelle + rubriques + widgets demandés en langage naturel. |
| Pôle « Courses » | **Oui** | A4 : réorganisation de la navigation validée. |
| Muscu (gelée) | **Lecture seule autorisée** pour widgets et conseils | Aucune modification des fichiers gelés : on *importe* `lib/strength.ts` ou on lit `StrengthWorkout`, rien de plus. |

---

## 0. Vue d'ensemble et ordre conseillé

Les 15 demandes se regroupent en 6 familles. Plusieurs partagent des
**fondations** : si on les construit d'abord, le reste devient beaucoup plus simple.

| Famille | Demandes | Fondation commune |
|---|---|---|
| A. Corrections & lisibilité | Répartition/comparatif, calendrier écrasé, graphe efficience, sous-pages invisibles | `lib/zones.ts` (source unique des zones) |
| B. Entraînement | Entraînement + Conseils, multi-objectifs, backyard, séances perso | **format de séance structurée** (`WorkoutStep[]`) + moteur de saison |
| C. Parcours & jour de course | Atelier de parcours d'entraînement, plan de course, nutrition | graphe du réseau perso (`lib/route-graph.ts`) + `RacePlan` enrichi |
| D. Données | Import Garmin et autres | parseur FIT/GPX/TCX + déduplication |
| E. Intelligence | Agent, machine learning | outils en lecture seule + `lib/ml/` |
| F. Interface | Dashboard custom (« La Une »), plus de relief | rubriques + éditions + `lib/metrics.ts` |

**Ordre proposé**

1. **Phase 0 — corriger ce qui est faux** (A) : on ne construit pas sur des zones
   fausses. Petit, visible, rassurant.
2. **Phase 1 — fondations** : `lib/zones.ts`, format de séance structurée +
   séances personnalisées, import FIT (apporte les *streams* dont tout le reste profite).
3. **Phase 2 — pôle « Courses » et atelier de parcours** : plan de course →
   nutrition (du GPX de course à la ligne d'arrivée), puis atelier de parcours
   d'entraînement (graphe perso → boucles → export GPX).
4. **Phase 3 — saison multi-objectifs**, puis backyard comme cas particulier du
   moteur de saison (volume en heures).
5. **Phase 4 — Conseils, ML, agent** : ils exploitent tout ce qui précède.
6. **Phase 5 — « La Une »** (éditions, rubriques, puis « Pose ta question » qui
   s'appuie sur le LLM de la phase 4). Le relief, lui, s'ajoute à chaque phase.

```
zones ─┬─> répartition / efficience / conseils
       └─> séances perso ─┬─> export montre (Garmin) ─> agent (génère des séances)
import FIT ─> streams ────┼─> ML (allure à FC fixe, facteur pente perso)
atelier de parcours (réseau perso) ─> séances sur parcours / export GPX montre
GPX de course ─> plan de course ─> nutrition
saison multi-objectifs ─> backyard
```

---

## A. Corrections et lisibilité (phase 0)

### A1. « Répartition et comparatif » affiche n'importe quoi — **S/M**

**Diagnostic** (`src/lib/stats.ts` → `hrZones`, `src/app/page.tsx` → `Compare`) :

1. **Toute la séance est imputée à la zone de sa FC moyenne.** Un 10 × 400 m
   (échauffement Z1, fractions Z5, récup Z2) atterrit en bloc en « Z3 ». Une
   sortie longue qui dérive finit en Z3 alors qu'elle était en Z2 pendant 80 %
   du temps. Résultat : la zone grise est gonflée, les extrêmes vides.
2. **Deux systèmes de zones contradictoires.** L'accueil utilise des % de FC max
   génériques (50/60/70/80/90) ; `lib/thresholds.ts` calcule des zones
   **personnelles** LT1/LT2 ; le lexique parle de 80/20. Même séance, trois
   verdicts selon la page.
3. **La grille %FCmax est mal calée pour la course** : Z1 = 50-60 % n'est quasi
   jamais atteint en courant → Z1 toujours vide, et la « Z3 Tempo » (70-80 %)
   contient en fait la plupart des footings.
4. **FC max estimée sur le max observé** : un pic d'artefact du capteur optique
   (cadence captée comme FC, 205 bpm) décale toutes les bornes vers le haut.
5. Tu parles de **zones d'allure** : il n'y en a aucune, seulement des zones
   cardiaques. Les sorties sans cardio sont ignorées sans le dire.
6. Détails : noms de zones codés en dur en français (« Z1 · Récup » s'affiche
   aussi en EN/ES), couleurs Tailwind brutes (`#22c55e`, `#ef4444`), interdites
   par la charte.
7. **Comparatif 28 j** : pas de delta ni de sens (« 42 km → 51 km », c'est bien
   ou non ?), l'allure moyenne mélange trail, fractionné et footing (elle baisse
   dès qu'on fait plus de trail), et aucune garde sur l'échantillon (leçon n° 6
   d'AGENTS.md).

**Proposition**

- **`lib/zones.ts` = source unique**, avec une cascade explicite et affichée :
  1. seuils personnels (`estimateThresholds`) si fiables ;
  2. sinon zones d'allure VDOT (Daniels E/M/T/I/R) depuis `lib/vdot.ts` ;
  3. sinon FC de réserve (Karvonen, avec `restHr`) plutôt que %FCmax.
  L'UI dit toujours laquelle : « Zones personnelles · calées sur 214 km-splits ».
- **Temps passé dans la zone, pas la moyenne** : utiliser `HrStream` (déjà en base,
  FC + vitesse à la seconde). Repli sur les splits kilométriques (bien mieux que
  la moyenne de séance), puis sur la moyenne en dernier recours, en l'indiquant.
- **Deux lectures côte à côte** : *cardio* (effort interne) et *allure* (effort
  externe). Leur désaccord est en soi une info (chaleur, fatigue, côtes).
- **Vue polarisée en 3 zones** (sous LT1 / entre / au-dessus de LT2) avec la cible
  80/20 en filet : c'est la question que se pose vraiment le coureur. Les 5 zones
  restent en détail.
- **Sur 8 semaines, une barre empilée par semaine**, plutôt qu'un instantané de
  28 jours : on voit la tendance.
- **Couverture** : « 11 séances sur 14 ont du cardio ; 3 sans cardio comptées à
  l'allure ».
- **FC max robuste** : 2ᵉ plus haute valeur soutenue ≥ 30 s dans les *streams*,
  pas le pic isolé ; bandeau « FC max estimée — renseigne-la » si pas saisie.
- **Comparatif refait** : delta signé et coloré selon le sens souhaité (plus de
  volume = sage, sauf si ACWR > 1,5 → ochre), allure **par type** (footings
  seulement), et rien n'est affiché sous 4 séances par période.

**Tests** : fractionné réparti sur 3 zones, dérive cardiaque, pic d'artefact
écarté, repli sans stream, parité des bornes avec `thresholds.ts`, garde ≥ 4.

### A2. Calendrier d'entraînement écrasé à gauche — **S**

**Diagnostic** (`src/components/TrainingCalendar.tsx`) : cases fixes de 13 px,
26 colonnes dans un `flex min-w-max` → environ 420 px de large dans un conteneur
de 1240 px ; tout se tasse à gauche, le reste est vide. Sur mobile c'est
l'inverse : ça déborde et le défilement démarre **à gauche**, donc sur les
semaines les plus anciennes : aujourd'hui n'est pas visible. Au passage, les mois
sont en `toLocaleDateString("fr-FR")` codé en dur (bug i18n).

**Proposition**

- Grille CSS fluide : `grid-template-columns: auto repeat(N, minmax(10px, 1fr))`,
  cases `aspect-square`, taille plafonnée (~22 px) pour ne pas devenir énorme.
- **N adaptatif** : 52 semaines sur desktop (une vraie année, qui remplit la
  largeur), 26 sur tablette, 15 sur mobile. Ou bien défilement ancré à droite
  (aujourd'hui toujours visible).
- **Plus de contenu dans le même espace** :
  - une ligne de totaux hebdo en micro-barres sous la grille ;
  - courses marquées d'un point `clay`, sorties longues cerclées ;
  - **le futur** : séances planifiées en contour pointillé (le plan devient
    visible sur l'accueil), objectif en drapeau ;
  - aujourd'hui entouré ;
  - teinte selon l'intensité (zones A1) en option, au lieu du seul volume.
- Libellés de mois via la locale `next-intl`.

### A3. Le graphe « efficience » est dur à comprendre — **S/M**

**Diagnostic** : nuage allure × FC sur 28 jours, tous types mélangés (fractionné,
trail, chaleur), avec une consigne « bas à gauche = mieux » à décoder, et un
indice EF (m/min par battement) calculé mais jamais expliqué.

**Proposition : remplacer le nuage par une phrase et une ligne.**

- **Métrique compréhensible : « l'allure à FC fixe ».** « À 145 bpm, tu cours
  aujourd'hui à **5:22/km**, contre 5:41 il y a trois mois. » Calcul :
  régression allure ↔ FC sur les splits d'une fenêtre glissante (le code de
  `thresholds.ts` sait déjà le faire), lue à une FC de référence (≈ LT1).
- **Courbe 6-12 mois** de cette allure, médiane glissante, avec bande de confiance
  et marques (courses, blessures, coupures) — composant `FormChart` comme modèle.
- **Filtrer les sorties comparables** : footings et sorties longues, pente
  moyenne faible, 25-120 min, pas de fractionné (détecté par `intervals.ts`).
- **Découplage aérobie** (Pa:HR) des sorties longues à côté : « tes sorties longues
  dérivent de 3,1 % (< 5 % = endurance solide) ».
- Un repli « Comment lire ce graphe » replié par défaut, lié au lexique.
- Le nuage peut survivre dans Analyse › Modèles pour les curieux, avec des points
  colorés par type de séance et une droite de tendance.

### A4. Les sous-pages sont invisibles, on oublie des fonctionnalités — **M**

**Diagnostic** (`src/components/Nav.tsx`) : 6 pôles en barre, mais 15+ pages
intérieures (séances, objectifs, plan de course, records, calculateur,
modèles, séances passées, muscu, matériel, rétro, lexique, carnet…) ne sont
accessibles que depuis les pages hubs ou ⌘K. Le plan de course, par exemple,
est caché trois niveaux sous une fiche objectif.

**Proposition, en couches**

1. **Sous-barre de pôle** (`PoleTabs`) : seconde rangée d'onglets fine sous la
   barre principale, collante, qui liste les pages du pôle actif. Coût faible,
   gain immédiat. Sur mobile : rangée défilante.
2. **Réorganiser les pôles** pour les fonctionnalités à venir :
   - *Aujourd'hui* · *Activités* · **Entraînement** (plan, saison, séances,
     bibliothèque perso, conseils) · **Courses** (objectifs, parcours, plan de
     course, nutrition, prédictions, records) · *Analyse* · *Corps* · *Plus*.
   Un pôle « Courses » évite d'enterrer parcours/plan/nutrition sous Objectifs.
3. **Méga-menu au survol** (desktop) : chaque pôle ouvre un panneau éditorial
   (titre + une ligne de description + un chiffre vivant par page, ex.
   « Records — 5 km en 21:43 »). La découverte passe par le contenu.
4. **Rappels contextuels** : règles pures (`lib/nudges.ts`) qui suggèrent la
   fonctionnalité au bon moment, dans le `TodayHero` :
   - course dans ≤ 8 semaines sans plan de course → « Prépare ton plan de course » ;
   - course > 2 h sans plan nutrition → « Calcule ton ravitaillement » ;
   - 3 sorties sans ressenti → « Note tes sensations » ;
   - chaussure > 600 km → matériel ;
   - fin de mois → rétrospective.
   Une suggestion à la fois, qu'on peut ignorer (mémorisé).
5. **Carte « Découvrir »** dans *Plus* : fonctionnalités jamais ouvertes (visites
   notées en localStorage, pas besoin de base), avec une ligne de promesse chacune.
6. Fil d'Ariane sur les pages profondes (`Objectifs › Marathon de Paris › Plan de course`).

---

## B. Entraînement

### B1. Améliorer la section Entraînement — **M**

L'existant est solide (plan séance par séance, faisabilité, check-in hebdo,
réadaptation auto, conformité). Ce qui manque, c'est surtout **le pourquoi** et
**la souplesse au quotidien**.

- **« Pourquoi cette séance ? »** sur chaque séance : objectif physiologique
  (« développer le seuil : repousser le moment où tu t'asphyxies »), place dans la
  semaine (« après la sortie longue, donc courte »), ce qui arrive si on la saute.
  Texte généré par règles depuis `kind` + `phase` + contexte : pur, testable, traduit.
- **Échanger une séance** : « je n'ai que 40 min », « j'ai mal aux jambes »,
  « je suis sur tapis », « il fait 32 °C » → propose 2-3 équivalents du même
  objectif (bibliothèque + séances perso), le plan se rééquilibre sur la semaine.
- **Glisser-déposer** les séances dans la semaine (le champ `locked` existe déjà),
  avec contrôle : deux séances dures d'affilée → avertissement.
- **Semaine type** : définir ses contraintes récurrentes (club le mardi soir,
  pas de course le jeudi, sortie longue en groupe le dimanche) que le générateur
  respecte.
- **Projection de charge** : la courbe CTL/TSB projetée (déjà sur l'accueil)
  directement dans la page plan, avec la cible de fraîcheur au jour J.
- **Compte-rendu de séance** : pour un fractionné, comparer répétition par
  répétition le prévu et le réalisé (`intervals.ts` détecte déjà les
  fractions) → « 8 × 400 : 6 dans la cible, les 2 dernières trop vite ».
- **Bilan de bloc** toutes les 4 semaines : ce qui a progressé, ce qui a coincé,
  recalage des allures cibles si le VDOT a bougé.

### B2. Section « Conseils » — **M**

Les *insights* actuels sont des **constats** ; les conseils seraient des
**actions**, avec leur justification.

**Trois étages**

1. **Le conseil du jour** (en tête) : un seul, choisi par un moteur de règles
   (`lib/advice.ts`) qui croise forme (TSB), ACWR, readiness du carnet, phase du
   plan, prochaine course, météo saisie. Ex. : « Readiness basse et TSB à −25 :
   remplace le seuil de demain par 40 min faciles, garde la sortie longue. »
   Chaque conseil a une **raison chiffrée**, un **lien d'action** (« échanger la
   séance ») et un **niveau de preuve** (consensus / probable / discuté).
2. **Conseils de période** : rythmés par le calendrier du plan. Semaine
   d'affûtage (« garde l'intensité, coupe le volume de 40-60 % »), veille de course,
   récupération post-course (jours sans intensité selon la distance), reprise
   après blessure, chaleur, altitude, décalage horaire.
3. **Fiches** (bibliothèque éditoriale, fr/en/es) : allure facile, seuil,
   VMA, côtes, sortie longue, affûtage, sommeil, prévention des blessures
   (périostite, TFL, Achille, fasciite), renforcement du coureur, chaussures,
   trail (descente, bâtons), nutrition, chaleur. Format court : l'idée en une
   phrase, pourquoi, comment, erreurs fréquentes, « dans tes données » (un chiffre
   personnel injecté, ex. « 72 % de ton volume est sous LT1 »).

**Contenu en fichiers** : `content/advice/{fr,en,es}/*.md` avec front-matter
(id, tags, conditions d'affichage) plutôt que dans `messages/*.json` (trop long).
Test de parité des fiches comme pour i18n.

**Garde-fous** : pas de conseil médical (douleur de niveau ≥ 2 pendant 3 jours
→ « consulte », pas de diagnostic) ; pas deux conseils contradictoires (le moteur
les priorise et les déduplique).

### B3. Saison multi-objectifs (3-4 courses dans l'année) — **L**

**Constat** : `TrainingPlan` n'a qu'un seul `raceGoalId`. Mais `RaceGoal.priority`
(A/B/C) existe déjà, ainsi que la frise (`Frieze.tsx`) et la projection de forme :
le terrain est prêt.

**Principes de périodisation (à coder)**

- **Courses A** (2-3 par an) : bloc complet — base → développement → spécifique →
  affûtage (durée selon la distance : 7-10 j pour un 10 km, 2-3 sem. pour
  marathon/ultra) → récupération post-course.
- **Courses B** : mini-affûtage de 3-5 jours, pas de rupture du bloc.
- **Courses C** : courses d'entraînement, remplacent la séance de qualité de la
  semaine ; aucun affûtage.
- **Entre deux A** :
  - < 4 sem. : récupération puis maintien, pas de nouveau pic ;
  - 4-8 sem. : récupération → mini-bloc spécifique → affûtage ;
  - > 12 sem. : cycle complet avec retour à la base.
- **Récupération post-course** : jours sans intensité ≈ selon la distance et
  l'effort (≈ 3-5 j pour 10 km, 2-3 sem. pour marathon/ultra), avant de
  remonter.
- **Spécificité qui glisse** : une saison 10 km (avril) → marathon (octobre) garde
  de la VMA au printemps puis bascule vers l'allure marathon ; le mélange de
  séances est interpolé selon la distance de la prochaine course A.
- **Contrôles de faisabilité** : deux A à moins de 6 semaines, marathon trop tôt
  après un ultra, pic de volume inatteignable → message et proposition
  (« passe le semi de juin en B »).

**Modèle de données**

```prisma
model Season {
  id, userId, name, startDate, endDate
  plans   TrainingPlan[]   // un plan = un segment de saison
  goals   SeasonGoal[]     // courses rattachées, avec leur rôle A/B/C
}
TrainingPlan.mode = "season"   // + seasonId
PlannedSession.raceGoalId?     // quelle course la séance prépare
```

**Logique pure** : `lib/season.ts` → `seasonBlueprint(goals, fitness,
constraints)` découpe l'année en segments, puis réutilise `weeklyVolumes` et
`composeWeek` par segment. Régénération incrémentale : une course annulée ou
déplacée ne recalcule que les segments touchés, les séances `locked` sont
préservées.

**UI** : **frise de saison** pleine largeur en `NightBand` : phases colorées,
drapeaux A/B/C, courbe CTL projetée avec la fraîcheur visée le jour de chaque
course. C'est une page à caractère, la « couverture » du pôle Entraînement.

**Tests** : A+A à 10 sem., A+B à 3 sem., C en plein développement, course
supprimée, saison qui chevauche un plan existant.

### B4. Entraînement backyard ultra — **M/L**

Format : une boucle de **6,706 km toutes les heures**, départ à l'heure pile,
dernier debout. 24 boucles = 160,9 km. La difficulté n'est pas la vitesse mais
la **répétabilité, le sommeil, la digestion et la routine**.

**Ce que l'app peut apporter**

1. **Type d'objectif `backyard`** : cible en boucles (ex. 24, 36), plus une date.
2. **Calculateur de boucle** : allure de boucle → temps de repos par tour ;
   mélange course/marche (« 5 min course / 1 min marche à 6:30 et 11:00 →
   boucle en 48 min, 12 min de repos ») ; tableau cumulé heure par heure
   (distance, calories, sommeil perdu). Pur, testé, très parlant.
3. **Plan en heures, pas en km** : volume hebdo en heures sur pieds, sortie longue
   en heures, **week-ends enchaînés** (samedi long + dimanche long), sorties
   de nuit, entraînement à la marche rapide.
4. **Séances spécifiques** (bibliothèque) :
   - *mini-backyard* : 3 → 8 boucles sur le format réel, départ à heure fixe ;
   - *discipline de l'heure* : boucle à allure imposée ± 30 s, pas plus vite ;
   - *routine du corral* : s'entraîner à manger/se changer en 8 min ;
   - *boucle de nuit*, *boucle après repas* (entraîner l'estomac).
5. **Plan de course backyard** : routine boucle par boucle (manger aux boucles
   paires, changer de chaussettes à la 12ᵉ, caféine à partir de minuit, micro-sieste
   de 5 min à la 30ᵉ si besoin), liste du matériel du corral, plan de l'assistance.
6. **Mode « jour J »** (pour l'assistance) : un bouton à chaque fin de boucle →
   temps de boucle, repos restant, tendance (« tes boucles ralentissent de 20 s/h
   depuis 3 h : la marge fond »), rappel de la routine de la boucle suivante.
7. **Analyse après course** : découpage de l'activité en boucles horaires,
   courbe temps de boucle / FC / repos.

**Réutilisation** : le moteur de saison (B3) avec une « unité de volume » =
heures ; nutrition (C3) en g/h sur une durée ouverte.

### B5. Séances personnalisées — **M** (fondation)

**Constat** : `lib/workout-library.ts` est statique, et `PlannedSession.structure`
stocke déjà des étapes en JSON. Il faut en faire un **format de première classe**.

**Format de séance structurée** (partagé par la bibliothèque, les séances perso,
le plan, l'export montre, l'agent) :

```ts
type WorkoutStep =
  | { type: "step"; role: "warmup"|"work"|"recovery"|"cooldown";
      duration: { kind: "time"|"distance"|"open"; value?: number };
      target?: { kind: "pace"|"hr"|"rpe"|"zone"; low?: number; high?: number;
                 relativeTo?: "threshold"|"vma"|"marathon" } ; note?: string }
  | { type: "repeat"; times: number; steps: WorkoutStep[] };
```

**Cibles relatives** (« 95-100 % de l'allure seuil ») : la séance suit la forme
de l'utilisateur au lieu de figer des allures.

**Création**

- **Constructeur visuel** : blocs empilables (échauffement, répétition,
  récupération…), aperçu en direct du profil d'intensité (barres SVG), durée et
  distance totales, charge estimée (`plannedLoad`).
- **Saisie rapide en texte** (le plus agréable pour un coureur) :
  `20' EF + 3×(6×400 @VMA r=1'30) R=3' + 10' RC` → parseur pur dans
  `lib/workout-dsl.ts`, très testable, avec erreurs lisibles.
- Duplication depuis la bibliothèque ou depuis une activité réalisée
  (« refaire cette séance »).

**Usage**

- Insérer dans le plan (remplace une séance du même type), ou marquer comme
  « préférée » : le générateur de plan puise d'abord dans les séances de
  l'utilisateur.
- Export : fichier FIT *workout* pour la montre (voir D), description dans l'ICS.
- Suivi : historique des fois où la séance a été faite, avec la progression
  (« 6 × 1000 : 3:58 de moyenne en mars → 3:49 aujourd'hui »).

```prisma
model CustomWorkout {
  id, userId, name, kind, tags, notes, favorite
  structure String   // JSON WorkoutStep[] validé par zod
  dsl       String?  // source texte si saisie rapide
}
```

---

## C. Jour de course

État actuel : `RacePlan` = GPX + profil par tranches + stratégie
(even/negative/positive) + ravitaillement « tous les X km » + sections veille/jour J.

### C1. Atelier de parcours (dessiner ses parcours d'entraînement) — **L**

**Décision** : on dessine des parcours d'**entraînement**. La reconnaissance du
parcours d'une course (découpage en montées, ravitos, « parcours jumeaux ») est
rattachée au plan de course (C2).

**La contrainte qui devient l'idée** : pas de service de tuiles (AGENTS.md). Donc
pas de fond de carte de rues… mais on a mieux : **tous les tracés déjà courus**.
L'atelier dessine sur **ton propre atlas**, ta carte de chaleur transformée en
réseau de chemins. Visuellement très fort (réseau lumineux sur fond `NightBand`),
et cohérent avec la charte « SVG pur ».

#### Le moteur : ton réseau personnel (`lib/route-graph.ts`, pur, testé)

1. Décoder toutes les polylines (`decodePolyline`, déjà là), rééchantillonner
   tous les ~15 m.
2. **Aimanter** les points sur une grille (~15-20 m) : deux passages dans la même
   rue tombent sur les mêmes cellules.
3. Construire un **graphe** : nœuds = cellules d'intersection ou d'extrémité,
   arêtes = tronçons entre deux nœuds, avec longueur, **nombre de passages**,
   date du dernier passage, allure habituelle, et **pente** quand l'altitude est
   connue.
4. Mettre en cache le graphe (`RouteGraph { userId, data, builtAt }`),
   reconstruit après une synchro qui ajoute des tracés.

Limites à assumer : les `summary_polyline` Strava sont simplifiées (précision de
quelques dizaines de mètres, suffisante pour un réseau de course) ; l'altitude
n'est connue que pour les sorties dont on a les *streams*. Ajouter `altitude`
à la requête de streams existante (`lib/strava.ts`) ne coûte **aucun appel de
quota en plus** ; l'import FIT (D) l'apporte aussi.

#### Quatre façons de créer un parcours

1. **« Une boucle de 14 km »** — génération automatique depuis un départ (par
   défaut : ton départ le plus fréquent, via `clusterByStart`). Recherche de
   boucles de distance cible ± 5 % sur le graphe, notées sur :
   - distance et D+ visés ;
   - **peu d'allers-retours** (pénalité si une arête est reprise) ;
   - un curseur **Habitude ↔ Découverte** : privilégier les tronçons très
     courus (sûrs, connus) ou ceux courus une seule fois il y a longtemps ;
   - un curseur **Plat ↔ Vallonné**.
   Trois propositions, chacune avec sa miniature (`RouteGlyph` existe), son profil
   et une phrase (« la boucle des étangs par le haut, 180 m D+, 70 % de tronçons
   connus »).
2. **Dessin guidé** — on clique des points de passage ; le tracé **s'aimante au
   réseau** (plus court chemin entre deux clics). Distance et D+ en direct.
   Hors du réseau connu, le segment est tracé en ligne droite pointillée
   (« terrain inconnu ») : on peut dessiner vers l'inconnu, l'app le dit.
3. **Parcours pour une séance** — l'app cherche dans le réseau ce dont la
   séance a besoin :
   - fractionné : ligne droite plate de 400-1000 m, sans intersection fréquente ;
   - côtes : montées de 200-600 m à 5-8 % (depuis les altitudes) ;
   - seuil : boucle plate de 2-3 km, à répéter ;
   - sortie longue : grande boucle qui repasse près d'un **point d'eau**.
   Chaque séance du plan (et chaque séance perso, B5) peut ainsi recevoir un
   parcours suggéré : « Côtes du mardi → côte de la rue X, 380 m à 6 % ».
4. **Aller-retour / point à point** — distance cible, demi-tour calculé
   (« fais demi-tour au pont, km 7 »).

#### Points d'intérêt personnels

Fontaines, toilettes, voiture, boulangerie, zone éclairée la nuit, portion
dangereuse, piste d'athlétisme : posés à la main sur la carte (`RoutePoi`).
Utilisés par le générateur (sortie longue qui passe par une fontaine toutes les
~5 km) et affichés sur le parcours.

#### Ce qu'on fait d'un parcours

- **Bibliothèque de parcours** (`/routes`, pôle Activités ou Entraînement) :
  nom, miniature, distance, D+, étiquettes (plat, nuit, trail, ombragé…).
- **Export GPX** → à charger sur la montre en navigation (bon complément de la
  décision « import de fichiers » côté Garmin : on sort aussi des fichiers).
- **Historique automatique** : chaque activité est rapprochée des parcours
  enregistrés (`sameRoute`/`routeSignature` existent déjà) → nombre de passages,
  meilleur temps, progression de l'allure (réutilise `favorite-route.ts`).
- **Rattachement au plan** : la sortie longue de dimanche porte son parcours ;
  l'ICS peut inclure le lien.
- **Mode « nouveau quartier »** : en vacances, on part de zéro… le réseau est vide.
  L'app propose alors un aller-retour simple et marque les rues découvertes : au
  retour, le réseau s'est agrandi. (Option ultérieure : fond de rues
  OpenStreetMap via l'API Overpass, qui serait un **service réseau externe** et
  demanderait donc ta validation.)

#### Petits bonus qui rendent l'atelier attachant

- **« Rues jamais courues »** à moins de 3 km de chez toi (bords du réseau) :
  défi d'exploration, pourcentage du quartier couvert.
- **Carte « territoire »** : ton réseau coloré par ancienneté du dernier passage
  (les rues oubliées pâlissent).
- **Parcours du mois** dans la rétrospective.

#### Données et sécurité

```prisma
model Route    { id, userId, name, polyline, distance, elevationGain?, tags, startLat, startLng, createdAt }
model RoutePoi { id, userId, kind, lat, lng, note? }
model RouteGraph { userId @id, data String, builtAt DateTime }
```

- Tout est filtré par `userId` ; les parcours contiennent le domicile → **jamais
  envoyés au LLM** (voir E1) ni exposés dans l'ICS public sans consentement.
- Tests : aimantation de deux passages décalés de 8 m, fusion de tronçons,
  boucle générée à ± 5 %, pénalité d'aller-retour, plus court chemin, graphe vide.

**Découpage en livraisons** : (1) graphe + carte du réseau ; (2) générateur de
boucles ; (3) dessin guidé + export GPX ; (4) parcours pour séance + POI ;
(5) exploration/territoire.

### C2. Plan de course — **M**

- **Reconnaissance du parcours de course** (déplacé depuis l'ancien C1) :
  - découpage automatique en montées, descentes et plats (segments à pente
    homogène, pas des tranches fixes) : longueur, D+, pente moyenne et max ;
  - points clés : ravitos officiels, barrières horaires, points d'assistance,
    sections techniques, posés sur le profil ;
  - carte SVG et profil synchronisés (survol de l'un → curseur sur l'autre) ;
  - **« parcours jumeaux »** : grâce au graphe de l'atelier (C1), retrouver dans
    ton réseau les montées qui ressemblent à celles de la course (« la côte du
    km 28 ressemble à ta côte de Meudon : 1,2 km à 6 % ») et y planifier des
    séances ;
  - temps de passage avec le facteur pente **personnel** (E2).
- **Stratégie par l'effort, pas par l'allure** : allure cible ajustée à la pente
  (GAP), plafond cardio par segment, « ne pas dépasser Z3 avant le km 30 ».
- **Scénarios A/B/C** : objectif, réaliste, sauvetage, avec les temps de passage
  de chacun et **les signaux de bascule** (« au 21 km, si tu as > 45 s de retard
  et FC > 170 → scénario B »).
- **Correction météo** : chaleur (pénalité d'allure selon température et point de
  rosée), vent. Saisie manuelle de la météo prévue, pas de service externe.
- **Bracelet d'allure** imprimable (le bouton d'impression existe déjà) :
  temps de passage aux km clés + ravitos, lisible au poignet.
- **Plan d'assistance** : où voir le coureur, heures estimées de passage (fourchette
  selon le scénario), que lui tendre à chaque point.
- **Check-list J-7 → J** : affûtage, sommeil, matériel, dossard, transport,
  échauffement (durée selon la distance).
- **Débrief** : l'activité rattachée à l'objectif est découpée selon les segments
  du plan → prévu vs réalisé, où le temps a été perdu, avec des leçons pour la
  prochaine (« tu pars trop vite dans les descentes : +12 s/km aux km 3-5 »).

### C3. Nutrition de course — **M**

**Calculs (lib pure `lib/nutrition.ts`)**, avec des repères issus du consensus
de la nutrition sportive (à sourcer dans la fiche conseil) :

- **Glucides / heure** selon la durée prévue : aucun besoin sous ~1 h ;
  30-60 g/h entre 1 et 2 h 30 ; 60-90 g/h au-delà (jusqu'à 90+ si l'intestin
  est entraîné, avec un mélange glucose/fructose).
- **Hydratation** selon le **taux de sudation** mesuré : calculateur
  (poids avant/après + boisson bue, sur la durée) → L/h ; on vise à compenser
  en partie, sans boire au-delà de la perte (**risque d'hyponatrémie**, à
  signaler clairement).
- **Sodium** : fourchette par heure, ajustée si l'utilisateur se sait « salé ».
- **Caféine** : dose et timing indicatifs (selon le poids), option désactivable.
- **Recharge glucidique** 36-48 h avant les longues courses (g/kg/j depuis le
  poids du carnet), petit-déjeuner d'avant-course (délai et quantité).

**Plan concret**

- **Bibliothèque de produits** personnelle (gel 25 g, boisson 40 g/500 ml,
  barre, compote, aliments « vrais » pour l'ultra) avec glucides, sodium, caféine.
- **Calendrier de prise** calé sur le **temps** estimé par segment (pas sur les
  km) et sur les ravitos officiels : « km 14 (1 h 05) : gel + 150 ml ».
  Éviter de prendre un gel en pleine montée raide.
- **Ce qu'il faut porter** entre deux ravitos (nombre de gels, volume d'eau,
  poids).
- **Entraîner l'intestin** : les sorties longues du plan reçoivent une consigne
  de glucides progressive (40 → 60 → 80 g/h), et un **journal de tolérance**
  (produit, quantité, troubles 0-3) sur l'activité. L'app apprend ce qui passe.

```prisma
model NutritionProduct { id, userId, name, carbsG, sodiumMg, caffeineMg, fluidMl?, weightG? }
model FuelLog { id, activityId, productId?, grams, minute, giIssue Int @default(0) }
RacePlan.nutrition String?   // JSON du calendrier de prise
RacePlan.checkpoints String? // ravitos, barrières horaires, points d'assistance
```

Avertissement visible : repères généraux, pas un avis médical ou diététique.

---

## D. Import Garmin et autres — **M/L**

**Réalité des API** (à garder en tête) :

- **Garmin Connect** : l'API officielle (Health/Activity API) est réservée aux
  partenaires approuvés ; les bibliothèques non officielles violent les
  conditions d'utilisation et cassent souvent → **à éviter**.
- **Polar AccessLink** : API ouverte aux particuliers → faisable.
- **Suunto, Coros** : programmes partenaires, sur dossier.
- **Apple Santé** : pas d'API web, mais un export `export.zip` (XML) importable.
- Beaucoup d'utilisateurs Garmin synchronisent déjà vers Strava : l'apport réel
  de Garmin, ce sont les **données que Strava ne transmet pas** (VFC, sommeil,
  FC de repos, dynamique de course, tours exacts).

**Proposition en 3 étapes** — *décision : l'import de fichiers suffit, pas d'API Garmin.*

1. **Import de fichiers** (sans partenariat) : glisser-déposer de `.fit`, `.gpx`,
   `.tcx`, ou du **zip d'export complet Garmin** (« Exporter vos données »). Un
   décodeur FIT maison (protocole binaire documenté ; messages *record*, *lap*,
   *session*, *hrv*) écrit en TS pur et testé sur des fichiers d'exemple, pour
   éviter une dépendance. Remplit `Activity`, `Split`, `HrStream` (étendu :
   altitude, cadence, puissance).
2. **Données de bien-être** : sommeil, VFC, FC de repos depuis l'export Garmin →
   `DailyLog` (champs déjà prévus !) → la readiness devient automatique.
3. **Connecteurs API** là où c'est ouvert (Polar), plus tard.

**Déduplication** (indispensable avec Strava) : même activité si départ à ±2 min
et distance à ±3 % → fusion, avec une **priorité des sources par champ** (FIT
pour les streams et les tours, Strava pour le nom et la description), et sans
jamais écraser les saisies de l'utilisateur (`privateNote`, `feeling`…).

```prisma
Activity.source   // strava | manual | fit | garmin | polar | apple
model ExternalRef { activityId, provider, externalId }   // une activité, plusieurs sources
model ImportBatch { id, userId, provider, fileName, status, counts, errors, createdAt }
```

**Dans l'autre sens** : export des séances structurées (B5) en fichier FIT
*workout* à copier sur la montre (USB). C'est ce qui ferme la boucle
plan → montre → import → analyse.

---

## E. Intelligence

### E1. Un agent qui « prépare des choses » — **L**

**Idée** : un assistant qui ne remplace pas le moteur de règles mais **prépare
des documents et des propositions**, que l'utilisateur valide.

**Ce qu'il prépare**

- **Brief du dimanche soir** : bilan de la semaine en trois phrases, semaine
  à venir, point d'attention (« 2 nuits < 6 h et ACWR 1,4 : le seuil de mardi
  est déplaçable »).
- **Dossier de course** à J-10 : plan de course, nutrition, bracelet, check-list,
  plan d'assistance, pré-remplis à partir du GPX et de la forme actuelle.
- **Débrief post-course** et **bilan de bloc**.
- **Séances à la demande** : « fais-moi 50 min de seuil en côte, j'ai une côte
  de 400 m » → séance structurée (format B5) validée par zod, enregistrée si
  acceptée.
- **Questions libres** sur ses données : « puis-je viser 1 h 45 au semi ? »,
  « pourquoi mes footings sont plus lents ce mois-ci ? ».
- **Réajustements proposés** après une blessure ou un imprévu (« 10 jours sans
  courir ») : un diff du plan à accepter/refuser, jamais appliqué seul.

**Architecture**

- **Décision : LLM distant dans un premier temps.** Appel en `fetch` (pas de SDK,
  donc pas de nouvelle dépendance), derrière une interface `LlmProvider` d'une
  vingtaine de lignes (`complete(messages, tools)`) pour pouvoir brancher un
  modèle local (Ollama) plus tard sans rien réécrire. Clé et modèle en variables
  d'environnement (`LLM_API_KEY`, `LLM_MODEL`), jamais en base ni côté client.
- **Minimisation des données envoyées** (le fournisseur est un tiers) :
  - **jamais de tracé GPS ni de coordonnées** (les polylines révèlent le
    domicile) ; ni nom, ni e-mail, ni notes privées, sauf demande explicite ;
  - les outils renvoient des **agrégats** (km/semaine, allures, forme, records)
    plutôt que des activités brutes ;
  - un écran « Ce que l'agent peut voir » liste précisément les champs partagés,
    avec un interrupteur par catégorie (carnet de santé, douleurs, notes).
- **Coût maîtrisé** : quota mensuel par utilisateur, réponses mises en cache
  (même brief = pas de nouvel appel), modèle rapide et bon marché pour les
  tâches simples (traduire une question en `MetricSpec`, F1), modèle plus
  capable pour les briefs et dossiers de course.
- **Outils en lecture seule** exposés à l'agent, tous filtrés par `userId` de
  session : `getActivities(range)`, `getForm()`, `getPlan()`, `getGoal(id)`,
  `getRecords()`, `getDailyLogs(range)`, `predictRace(distance)`…
  Les calculs restent dans `lib/` : **l'agent explique et assemble, il ne calcule
  pas** (pas de chiffre inventé).
- **Écriture uniquement par propositions** (`AgentProposal` : type, payload JSON,
  statut pending/accepted/rejected), appliquées par les routes API existantes
  après clic.
- **Préparations planifiées** (dimanche soir, J-10) via une route déclenchée à la
  connexion ou par cron ; résultats stockés (`AgentBrief`) et affichés dans le
  TodayHero.
- Garde-fous : opt-in explicite, quota, journal des appels, aucune donnée
  envoyée sans consentement, réponses traduites dans la langue de l'utilisateur.

### E2. Machine learning réaliste — **M/L**

Avec les données d'un seul coureur (quelques centaines de sorties), il faut des
**modèles petits, interprétables, en TS pur** (`lib/ml/`), qui **refusent de
conclure** sous un seuil de données, comme le fait déjà `thresholds.ts`.

| Modèle | Ce que ça apporte | Technique |
|---|---|---|
| **Allure à FC fixe** (A3) | Forme aérobie mesurée à *chaque* sortie, sans course | Régression FC ~ vitesse + pente + durée (+ température si saisie) |
| **Facteur pente personnel** | Temps de passage plus justes en trail (C1/C2) | Régression allure/pente sur ses propres splits/streams |
| **Banister personnalisé** | Prédire la performance le jour J, **durée d'affûtage optimale personnelle** | Ajustement des paramètres k1, k2, τ1, τ2 (Nelder-Mead) sur les performances |
| **Prédiction de course hybride** | Mieux que VDOT seul : combine VDOT, Riegel perso, volume, sortie longue | Régression régularisée, validation sur ses courses passées |
| **Classification auto des séances** | Footing / seuil / fractionné / longue / course, sans saisie | Règles + k-plus-proches voisins sur les signatures de streams |
| **Nettoyage des données** | Pics d'artefact FC, GPS aberrant → zones et records plus justes | Détection d'anomalies (écart robuste, MAD) |
| **Risque de surcharge** | Alerte précoce, *indicative* | Régression logistique sur ACWR, monotonie, douleurs du carnet |
| **Ce qui te réussit** | « Tes meilleures séances suivent une nuit > 7 h » | Corrélations (la fonction `correlation` existe) avec seuil de significativité |

**Règles** : backtest systématique (entraîner sur le passé, tester sur les
courses suivantes), afficher l'intervalle d'incertitude, montrer « sur quoi c'est
fondé », mettre en cache les ajustements (`ModelFit { userId, model, params,
fittedAt, quality }`) et recalculer après chaque synchro.

---

## F. Interface

### F1. Dashboard : « La Une » — **L** (en 3 livraisons)

**Le problème des dashboards classiques** : une grille de cartes qu'on range une
fois puis qu'on ne regarde plus. Et c'est l'inverse de la charte (cartes partout,
pas de hiérarchie, aucun « grand chiffre »). Idée : **ne pas faire un dashboard,
faire un journal**. L'accueil devient **la Une du jour de ton journal de coureur** :
elle se compose seule selon le moment, et tu la personnalises comme on choisit
ses rubriques, pas en déplaçant des cartes.

#### Brainstorm : les pistes envisagées

| Piste | Idée | Verdict |
|---|---|---|
| Grille de widgets à glisser | Le classique | ❌ plat, contraire à la charte |
| **La Une contextuelle** | La page change d'**édition** selon ta situation | ✅ cœur du concept |
| **Rubriques** | Épingler, masquer, réordonner des rubriques | ✅ la personnalisation |
| **« Pose ta question »** | Un widget créé en langage naturel par le LLM | ✅ l'effet waouh |
| Mode cockpit plein écran (TV, tapis de course) | Grands chiffres, rafraîchissement live | 💡 bonus |
| Carte postale partageable | Une rubrique exportée en image | 💡 bonus |

#### 1. La Une contextuelle — des « éditions »

Un moteur pur (`lib/edition.ts`) choisit l'édition du jour à partir de l'état :
plan, prochaine course, forme, carnet, douleurs, saison.

| Édition | Quand | Ce qui fait la Une |
|---|---|---|
| **Quotidienne** | par défaut | séance du jour, forme, semaine en cours |
| **Veille de course** | J-1 | compte à rebours géant, bracelet d'allure, check-list, météo saisie, plan nutrition |
| **Jour de course** | J | temps de passage, rappel stratégie, « bonne course » |
| **Lendemain de course** | J+1 → J+3 | le résultat en très grand, débrief prévu vs réalisé, récupération conseillée |
| **Affûtage** | semaines de taper | fraîcheur qui monte (TSB) vers la cible, « ne rien ajouter » |
| **Bloc dur** | ACWR haut / pic | charge, sommeil, alerte douce |
| **Convalescence** | douleur ≥ 2 au carnet | reprise progressive, pas de volume en Une, renfo (lecture muscu autorisée) |
| **Hors saison** | pas d'objectif ni de plan | rétro de l'année, exploration (rues jamais courues, C1), idées d'objectifs |
| **Dimanche soir** | fin de semaine | le **brief de l'agent** (E1) fait la Une |

Chaque édition a une **manchette** (grande phrase générée, comme le
`formHeadline` actuel), une **photo** (visualisation signature pleine largeur en
`NightBand` : profil de course, frise, carte du réseau…) et des **rubriques**
en dessous. Même structure qu'une Une de journal : un titre qui dit quelque chose,
une image forte, puis des colonnes calmes séparées par des filets.

Détail qui fait plaisir : un **« ours »** en bas (date, numéro d'édition = n° de
jour d'entraînement de l'année, météo saisie, « édition du matin/soir »).

#### 2. Les rubriques — la personnalisation

- Une **rubrique** = un bloc éditorial (≈ widget) : « Forme », « Semaine »,
  « Records », « Prochaine course », « Carnet », « Matériel », « Renfo »
  (lecture muscu), « Parcours du jour », « Conseil », « Mes questions »…
- Pour chaque rubrique : **épingler** (toujours présente, quelle que soit
  l'édition), **masquer** (jamais), ou laisser l'édition décider. Réordonner
  par glisser (HTML5 natif) **et** boutons ↑/↓ (accessibilité).
- Trois largeurs de colonne seulement (étroite, large, pleine) : la mise en page
  reste typographique.
- La **manchette et la photo ne sont pas masquables** : c'est ce qui garantit le
  relief, même sur une Une très personnalisée.
- Stockage : `Settings.frontPage` (JSON : épingles, masquées, ordre, largeurs).
- Performance : les rubriques partagent leurs lectures via `cache()` de React.

#### 3. « Pose ta question » — widgets créés en langage naturel

L'utilisateur tape : *« Est-ce que je cours plus vite le matin ? »*,
*« Mes km en côte par mois cette année »*, *« Combien de sorties sous la pluie ? »*
(si saisi), *« Ma meilleure semaine avant chaque marathon »*.

1. Le LLM (décision : distant) traduit la question en **spécification de
   métrique** — jamais en code ni en SQL :
   ```ts
   type MetricSpec = {
     measure: "distance" | "duration" | "pace" | "hr" | "elevation" | "count" | "load" | …;
     aggregate: "sum" | "avg" | "median" | "max" | "count";
     filter?: { type?: string[]; hourRange?: [number, number]; minKm?: number; tag?: string };
     groupBy: "week" | "month" | "hourOfDay" | "weekday" | "type" | "none";
     period: { last: number; unit: "week" | "month" | "year" } | "all";
     chart: "bars" | "line" | "number" | "table";
   };
   ```
   validée par **zod** (liste fermée de mesures et de regroupements).
2. **`lib/metrics.ts`** (pur, testé) exécute la spec sur les activités de
   l'utilisateur, **côté serveur**. Le LLM ne voit ni les données ni la réponse.
   Il n'a vu que la question.
3. Le résultat s'affiche avec une **phrase-réponse** (« Oui : 5:21/km le matin
   contre 5:34 le soir, sur 48 et 31 sorties »), en respectant la garde des
   échantillons minces (≥ 4 séances).
4. **« Garder à la Une »** transforme la question en rubrique permanente, mise à
   jour à chaque synchro.
5. Hors LLM : un éditeur de spec à menus déroulants fait la même chose. La
   fonctionnalité marche donc sans clé d'API, et le LLM n'est qu'un raccourci.

Ce design est aussi **le plus sûr pour la vie privée** : aucune activité ne part
au fournisseur LLM pour cette fonctionnalité.

#### Bonus

- **Mode cockpit** (`/une?cockpit`) : plein écran, 3 chiffres géants, pour une
  tablette posée sur le tapis ou un écran de salle : séance du jour, allure
  cible de la répétition, chrono.
- **Carte postale** : exporter une rubrique ou la manchette en image SVG → PNG
  (rendu côté client, sans dépendance) pour partager une fin de bloc.

#### Livraisons

1. Éditions + manchette + rubriques figées (l'accueil actuel découpé en rubriques).
2. Personnalisation (épingler/masquer/ordre/largeur).
3. « Pose ta question » (`lib/metrics.ts` + éditeur à menus, puis le LLM).

### F2. Plus de relief — continu, **S** par lot

Pistes cohérentes avec la direction éditoriale / data-journalism :

- **Une page = une couverture** : chaque pôle ouvre sur une visualisation
  signature en `NightBand` (Entraînement : frise de saison ; Courses : profil du
  prochain parcours en grand ; Analyse : allure à FC fixe sur un an ; Corps :
  readiness sur 90 jours).
- **Texture personnelle** : courbes de niveau (topographiques) générées à partir
  du **dénivelé de l'utilisateur** en fond discret des en-têtes : unique à
  chacun, et sans image.
- **Chiffres qui débordent** : très grands chiffres qui chevauchent les filets,
  annotations dans la marge des graphes (à la NYT), étiquettes directes plutôt
  que des légendes.
- **Couche d'annotations commune** à tous les graphes temporels : courses, records,
  blessures, changements de plan, avec la même marque partout.
- **Curseur synchronisé** entre graphes d'une même page.
- **Mouvement discret** : chiffres qui s'incrémentent, lignes qui se tracent à
  l'apparition, **désactivés** avec `prefers-reduced-motion`.
- **États vides illustrés** (SVG au trait, dans la palette) au lieu d'un texte gris.
- **Rétrospective en scrollytelling** (le récap mensuel/annuel raconté en défilant).
- **Audit page par page** : une grille (en-tête qui dit quelque chose ? un seul
  grand chiffre ? cartes superflues ? sombre OK ? 390 px OK ?) pour traiter les
  pages les plus plates en priorité.

---

## Décisions complémentaires (25 sept. 2026, soir)

- **Backyard** : pas prioritaire, mais à faire (phase 3, après la saison multi-objectifs).
- **Fournisseur LLM** : **DeepSeek** pour l'instant (API compatible OpenAI :
  `https://api.deepseek.com/chat/completions`, modèle `deepseek-chat`), derrière
  l'interface `LlmProvider`. Variables : `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.
- **Atelier de parcours** : fond de rues OpenStreetMap (Overpass) **accepté plus
  tard**, en option explicite.
- **La Une remplace l'accueil** : l'accueil actuel devient l'édition « Quotidienne ».
- Nassim laisse l'agent avancer seul sur la feuille de route, phase par phase.
