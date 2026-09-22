# Foulée

Application d'analyse d'entraînement **multi-utilisateur**. Import automatique depuis Strava,
statistiques de course à pied, **plan d'entraînement séance par séance** qui se
recale chaque semaine sur ce que tu as réellement couru, et une **section analyse**
qui applique aux données les modèles utilisés en sport de haut niveau (PMC de
Banister, vitesse critique, exposant d'endurance personnel). Musculation à venir.

Interface éditoriale, thème clair et sombre, aucune dépendance de composants UI.
Déployée, chaque personne se connecte avec son compte Strava et ne voit que ses
propres données.

## Démarrage

```bash
pnpm install
cp .env.example .env              # puis remplir les identifiants Strava
openssl rand -hex 32              # → à coller dans AUTH_SECRET
pnpm db:push                      # crée la base
pnpm dev                          # → http://localhost:3000
```

Au premier lancement, `/login` propose **Se connecter avec Strava**. Le compte
est créé automatiquement ; le tout premier compte de l'instance est administrateur.

### Configurer Strava (une seule fois)

1. Va sur **https://www.strava.com/settings/api** et crée une application
2. Renseigne `Authorization Callback Domain` = `localhost`
3. Copie `Client ID` et `Client Secret` dans `.env` :
   ```env
   STRAVA_CLIENT_ID="12345"
   STRAVA_CLIENT_SECRET="abc..."
   ```
4. Redémarre `pnpm dev`, va sur `/settings` → **Se connecter avec Strava**
5. Clique **Synchroniser Strava** (la première fois : *Réimporter tout l'historique*)

> ⚠️ Strava limite à **100 requêtes / 15 min** et 1000 / jour. La synchro normale
> est incrémentale et ne reprend que les nouvelles activités.

## Comptes et déploiement

### Un compte = un athlète Strava

Il n'y a **ni mot de passe, ni email à vérifier** : l'app n'a de données que via
Strava, donc Strava sert d'identité. Le retour d'OAuth crée le compte s'il
n'existe pas, puis ouvre une session.

| Mécanisme | Détail |
|---|---|
| Session | Cookie `httpOnly`, `sameSite=lax`, `secure` en production, 90 jours |
| Contenu du cookie | Un token aléatoire de 32 octets — **rien d'autre**, pas d'identité |
| Stockage | Seule l'empreinte SHA-256 du token est en base : une fuite de la base ne permet pas de rejouer une session |
| Révocation | « Déconnecter tous les appareils » dans les réglages supprime toutes les sessions |
| Expiration | Vérifiée à chaque requête ; les sessions périmées sont purgées à la connexion suivante |

Le middleware filtre sur la *présence* du cookie (le runtime Edge ne peut pas
interroger la base) ; la validité réelle est vérifiée côté serveur à chaque
page et chaque route API. Un cookie forgé ne donne donc accès à rien.

### Qui peut s'inscrire

Deux variables d'environnement, cumulables, sans redéploiement de code :

```env
# Vide = instance ouverte à tous
ALLOWED_ATHLETES="12345678,98765432"
# Code exigé à la première connexion (vide = aucun code)
INVITE_CODE="foulee-2026"
```

Restreindre la liste plus tard **n'exclut jamais quelqu'un déjà inscrit** :
enfermer dehors un utilisateur dont les données sont déjà dans l'instance
serait une mauvaise surprise, pas une mesure de sécurité.

### Isolation des données

Chaque ligne appartient à un `User` : activités, efforts, splits, objectifs,
plans, séances, points hebdo, réglages, matériel, journaux de synchro. Les
lectures passent par `lib/queries.ts`, qui résout l'utilisateur **depuis la
session** — un `userId` n'est jamais accepté depuis une requête entrante.

| Tentative | Résultat |
|---|---|
| Ouvrir l'objectif d'un autre (`/goals/<id>`) | 404 |
| Ouvrir le plan d'un autre (`/training/<id>`) | 404 |
| `PATCH` / `DELETE` sur le plan ou la séance d'un autre | 404, aucune écriture |
| Point hebdo sur le plan d'un autre | 404 |
| Supprimer l'objectif d'un autre | réponse identique à un succès, **aucune suppression** |

Cette dernière ligne est volontaire : répondre différemment révélerait
l'existence de l'identifiant.

Le même compte Strava ne peut alimenter qu'un seul utilisateur. En revanche
`Activity.stravaId` est unique **par utilisateur** : deux personnes qui ont
couru la même sortie de groupe l'importent chacune de leur côté.

### Suppression de compte

Réglages → Compte → *Supprimer mon compte*, en retapant son prénom (une modale
« Êtes-vous sûr ? » se clique sans lire, recopier un mot non). Tout part en
cascade depuis `User`. Le compte Strava, lui, n'est pas touché.

### Base de données

`DATABASE_PROVIDER` pilote le provider Prisma (`scripts/db-provider.mjs`
réécrit la ligne avant chaque `generate` / `push`, Prisma interdisant `env()`
à cet endroit) :

```env
# Local
DATABASE_PROVIDER="sqlite"
DATABASE_URL="file:./dev.db"

# Déploiement partagé
DATABASE_PROVIDER="postgresql"
DATABASE_URL="postgresql://user:pass@host:5432/foulee"
```

### Migration depuis la version mono-utilisateur

```bash
cp prisma/dev.db prisma/backup-pre-multiuser.db
pnpm db:push                      # applique le schéma multi-utilisateur
pnpm db:migrate-users             # rattache tout au compte du StravaAccount existant
```

Le script lit la sauvegarde avec `node:sqlite`, crée l'utilisateur depuis le
`StravaAccount` trouvé (rôle admin), puis réinjecte activités, efforts, splits,
objectifs, plans, séances, points hebdo, matériel et journaux en conservant les
identifiants. Il est **idempotent** : relancé, il s'arrête au lieu de dupliquer.

### Quota Strava

La limite de **100 requêtes / 15 min et 1000 / jour** est attachée à
l'*application* Strava, pas à l'utilisateur : elle est donc partagée par tous
les comptes de l'instance. À plusieurs utilisateurs actifs, évite les
réimportations complètes simultanées.

## Ce que l'app calcule

### Volume & charge
- Volume hebdomadaire (km, D+, temps, séances) sur 12 semaines, avec ligne d'objectif
- **Charge d'entraînement** : TRIMP de Banister si cardio dispo, sinon équivalent-km
- **ACWR** (ratio charge aiguë 7 j / chronique 28 j) avec bandes de risque :
  - `< 0.8` sous-charge · `0.8–1.3` optimal · `1.3–1.5` prudence · `> 1.5` risque de blessure
- Conseil textuel automatique selon la zone

### Allure & cardio
- Progression allure + FC moyennes sur 12 mois (double axe, allure inversée)
- Nuage **allure × FC** : visualise l'efficience (bas-gauche = mieux)
- Répartition du temps par **zone FC** (Z1 récup → Z5 VO2max), FC max auto-estimée
  (max observé, sinon Tanaka `208 − 0.7 × âge`)

### Records & prédictions — moteur VDOT
- PB sur 13 distances (400 m → marathon), extraits des efforts chronométrés Strava
- **Niveau de forme (VDOT)** selon Daniels & Gilbert, validé contre les tables
  officielles à **moins de 8 secondes** sur toutes les distances (voir `tests/vdot.test.ts`)
- **Prédictions de chrono en deux colonnes** : *potentiel* (ce que ton moteur
  autorise) et *réaliste* (ce que ton entraînement actuel permet réellement)
- **Indice de fiabilité** par distance (Fiable / Indicatif / Spéculatif) tenant
  compte de l'écart d'extrapolation, du volume hebdo et de la sortie longue
- Marqueur `sortie` sur les records courus nettement sous le potentiel réel
- **5 allures d'entraînement** de Daniels (EF, marathon, seuil, VO2max, vitesse)

> **Pourquoi VDOT et pas Riegel seul**
> Riegel extrapole depuis une distance sans savoir si l'effort était maximal.
> Avec un 5 km en 24'51" et un semi en 2h43 couru tranquille, Riegel partait du
> semi et prédisait **35 min au 5 km**. VDOT évalue chaque performance sur une
> échelle de forme commune : la sortie lente donne un VDOT de 25, le 5 km un
> VDOT de 38,6, et c'est ce dernier qui sert de base. Le 10 km prédit passe
> ainsi de valeurs absurdes à **51'34"**.

### Prédiction — un seul moteur pour toute l'app

`src/lib/prediction.ts` est la **source unique** des chronos annoncés. Les pages
Performance, Objectifs, Analyse et Entraînement affichent les mêmes nombres,
calculés au même endroit, à partir des mêmes mesures de volume et de sortie
longue (`currentFitness`, médiane des semaines actives).

| Notion | Ce que c'est |
|---|---|
| **Potentiel** | Chrono que ton VDOT autorise, distance la plus proche de ton meilleur effort |
| **Exposant d'endurance** | Ton coefficient de Riegel **personnel**, régressé en log-log sur tes records (`1.06` = référence de la littérature, `< 1.05` = profil endurant, `> 1.09` = profil vitesse) |
| **Réaliste** | Le potentiel corrigé par tes facteurs limitants réels : exposant mesuré, volume hebdo, sortie longue |
| **Fourchette** | Bornes basse et haute, resserrées quand la prédiction est fiable |
| **Facteurs limitants** | Chiffrés en secondes perdues, et seulement au-delà de 12 s ou 0,8 % — sous ce seuil, annoncer un « facteur limitant » serait de la fausse précision |

La **vitesse critique** (modèle à deux paramètres CS / D′) est estimée par
régression linéaire distance = CS·t + D′ sur les efforts de 2 à 30 min. Elle
donne un second point de vue sur le seuil, indépendant du VDOT, avec son D′
(réserve anaérobie, en mètres au-dessus du seuil).

### Analyse — modèles de sport de haut niveau

La page `/analysis` regroupe ce qui demande du recul plutôt qu'un coup d'œil :

| Bloc | Modèle |
|---|---|
| **Condition / fatigue / fraîcheur** | PMC de Banister : CTL 42 j, ATL 7 j, TSB = CTL − ATL, **prolongé par les séances planifiées** — la courbe montre la forme projetée le jour de ta course |
| **Potentiel vs réaliste** | Tableau distance par distance avec l'écart chiffré et le facteur qui coûte le plus |
| **Courbe allure-durée** | Tes records face au modèle de ton exposant : les distances où tu surperformes et celles où il y a du temps à prendre |
| **Vitesse critique** | Nuage distance × temps, droite de régression, CS et D′ |
| **Polarisation** | Répartition facile / zone grise / intense mois par mois (règle des 80/20) et diagnostic de la zone grise |
| **Allure par intensité** | Évolution de l'allure à effort facile, modéré et intense — la baisse à intensité *facile* est le meilleur marqueur de progrès aérobie |
| **Comparatif annuel** | Cumul kilométrique semaine par semaine, année contre année |
| **Régularité** | Grille de 52 semaines, taux de semaines actives, série en cours et record de série |
| **Barres passées** | Chronologie des records battus, avec le temps gagné à chaque fois |

La fraîcheur (TSB) est toujours jugée **relativement à ta condition** : +8 de TSB
ne veut pas dire la même chose avec une CTL de 30 ou de 90. Les seuils sont donc
exprimés en pourcentage de la CTL.

### Objectifs de course

La fiche d'un objectif est construite **autour du plan réellement lié** à la
course, pas d'un plan hebdomadaire générique recalculé dans son coin :

- **Score de préparation /100** : sortie longue (40) + volume (30) + allure (30),
  avec pour chaque facteur la valeur actuelle, le seuil attendu et l'écart
- Chrono **potentiel / réaliste / objectif** côte à côte, et le temps à trouver
- **Fraîcheur projetée le jour J** (TSB issu du PMC, prolongé par les séances
  planifiées) : on sait à l'avance si l'affûtage tombe juste
- **Plan d'allure** du jour J : découpage en segments, allure et temps de passage,
  en négative split pour les distances longues
- Tableau des semaines du plan, courbe de volume, prérequis de la distance
- Quand aucun plan n'est lié : un bouton génère le plan **depuis le moteur
  d'entraînement**, avec la course, sa distance et sa date déjà renseignées

### Entraînement — plan séance par séance

La page `/training` génère un plan complet, jour par jour, dans deux modes :

- **Avec course** : le plan est calé sur la date de la course (base → développement
  → spécifique → affûtage). **La course elle-même est une séance du plan** : placée
  le jour J, avec sa vraie distance, son allure cible et son découpage en tiers.
  Les jours qui la précèdent sont vidés de toute intensité et plafonnés à 8 km.
- **Sans course** : progression libre sur un horizon choisi, avec une orientation
  — `base`, `endurance`, `vitesse`, `entretien`, `reprise`, `côtes`. Le bloc se
  renouvelle tant qu'il n'y a pas d'objectif.

Chaque séance est structurée : échauffement, corps de séance, récupération, avec
l'allure cible de chaque bloc calculée depuis ton VDOT (`lib/workouts.ts`). Onze
types de séances sont générés — endurance, lignes droites, sortie longue avec
finish rapide, tempo, seuil (4 formats qui alternent), fractionné VO2max, côtes,
fartlek, renfo, cross-training, récupération.

#### Progression réaliste

C'est le cœur du module. Le plan **ne demande jamais un bond de volume** :

| Garde-fou | Valeur |
|---|---|
| Progression maximale par semaine | +8 % |
| Marche maximale en absolu | +8 km |
| Décharge | toutes les 4 semaines, à 72 % |
| Sortie longue | +2 km max / semaine, plafonnée selon la distance visée |
| Plafond personnel | réglable (0 = automatique) |
| Nombre de sorties | **automatique** par défaut : il suit le volume et ne monte jamais de plus de 2 sorties d'un coup |

Le nombre de sorties par semaine n'est plus une case à remplir. `autoDays()` le
déduit du volume en gardant une sortie moyenne dans une fourchette utile
(4 à 20 km), puis `daysSchedule()` annonce les paliers à l'avance : « 4 sorties,
puis 5 à partir de la semaine 9 ». Une décharge ne déclenche jamais un faux
palier. Le réglage manuel reste possible.

Si Strava ne couvre pas tes dernières semaines (reprise, montre non synchro,
autre app), tu peux **déclarer la charge des 4 dernières semaines** et ta
sortie longue actuelle à la création du plan : ces valeurs prennent le pas sur
l'historique. Le point de départ est la médiane des semaines actives, mais il ne
dépasse jamais beaucoup la dernière semaine réelle — reprendre à 15 km après
trois semaines à 50 fait repartir de 15, pas de 50.

La première semaine part **exactement** de ton volume actuel (médiane des
6 dernières semaines actives, les semaines blanches sont ignorées). Concrètement :
viser 100 km à un an en courant 35 km/semaine donne une montée lissée vers
~80 km/semaine atteinte en semaine 45, pas 80 km le mois prochain.

Le pic visé (`targetPeakFor`) dépend du temps disponible : plancher de la
distance quand la course est proche, volume de performance quand il y a la
place. Un semi dans 16 semaines depuis 35 km/sem vise ~48 km/sem ; le même
coureur avec un 50 km dans un an monte vers ~87 km/sem.

#### Faisabilité chiffrée, sans morale

Avant de créer le plan, l'app compare le **temps disponible** au **temps
nécessaire** et affiche des faits, pas des encouragements :

```
Réaliste          ratio 1.58
· 52 semaines disponibles, 33 nécessaires
· 35 → 80 km/sem à +8 %/semaine
· sortie longue 16 → 32 km
```

Cinq niveaux : `confortable`, `réaliste`, `exigeant`, `difficile`, `hors d'atteinte`.
Quand la date ne tient pas, l'app donne **la date à laquelle ce serait confortable**
au lieu de recommander d'abandonner.

#### Réadaptation hebdomadaire

Un point hebdo (douleur 0-3 + zone, fatigue, motivation, sommeil, jours
disponibles) recale les semaines à venir. Les règles sont hiérarchisées :

| Signal | Effet |
|---|---|
| Douleur 3/3 | cross-training, course suspendue |
| Douleur 2/3 | volume −30 %, intensité retirée |
| Douleur 1/3 | volume −10 %, intensité plafonnée |
| Fatigue élevée + sommeil court | volume −15 à −25 %, progression gelée |
| Semaine suivie < 60 % | progression gelée, volume recalé sur le réalisé |
| ACWR > 1,5 | volume −15 % |
| Tout bouclé + bon ressenti | +4 % autorisé |
| Jours disponibles réduits | semaine redistribuée sur ce nombre de jours |

L'ajustement s'estompe sur les semaines suivantes plutôt que de s'appliquer d'un
bloc. Les séances passées, faites, ou modifiées à la main ne sont jamais
réécrites — la régénération repart de ton volume réel.

Chaque séance se coche (faite / sautée), accepte un ressenti (RPE, douleur,
commentaire) et se relie automatiquement à l'activité Strava du même jour.

## Fonctionnalités

| Page | Contenu |
|---|---|
| **Résumé** | Observations automatiques, calendrier d'entraînement, charge, volume, allure, zones FC |
| **Activités** | Liste filtrable (période, type, tri) et fiche détaillée par séance |
| **Entraînement** | Plan séance par séance, point hebdo, réadaptation, trajectoire de volume |
| **Analyse** | PMC (condition/fatigue/fraîcheur), potentiel vs réaliste, courbe allure-durée, vitesse critique, polarisation, comparatif annuel, régularité, barres passées |
| **Performance** | Records, niveau de forme VDOT, prédictions potentiel/réaliste, allures d'entraînement |
| **Calculateur** | Outil interactif : performance → VDOT, VMA, chronos équivalents, allures |
| **Objectifs** | Préparation de course, score /100, fraîcheur projetée le jour J, plan d'allure, plan lié |
| **Matériel** | Kilométrage et usure des chaussures, seuil de remplacement ajustable |
| **Muscu** | Séances de renforcement (module de saisie à venir) |

### Observations automatiques

Le moteur (`src/lib/insights.ts`) n'émet une observation que si les données la
justifient, et affiche systématiquement la mesure correspondante. Il détecte
notamment les montées de charge trop rapides, les coupures, les déséquilibres
d'intensité (règle des 80/20), les variations d'efficience aérobie et les
progrès d'allure.

Il refuse aussi de parler de « records battus » tant que l'historique fait moins
de 4 mois : avec peu de recul, tous les records sont des premières, pas des
records battus.

## Structure

```
src/
  middleware.ts                 Garde d'entrée (redirige vers /login)
  app/
    page.tsx                    Dashboard principal
    login/page.tsx              Connexion Strava
    activities/page.tsx         Liste + filtres
    records/page.tsx            PB, prédictions potentiel/réaliste, allures cibles
    analysis/page.tsx           PMC, courbe allure-durée, vitesse critique, polarisation
    goals/page.tsx              Objectifs de course
    goals/[id]/page.tsx         Préparation d'un objectif
    training/page.tsx           Semaine en cours + point hebdo
    training/[id]/page.tsx      Plan complet, semaine par semaine, réglages
    strength/page.tsx           Muscu (v0)
    settings/page.tsx           Connexion Strava + profil athlète
    api/strava/
      connect/                  Redirection OAuth
      callback/                 Échange du code → tokens
      sync/                     Import incrémental ou complet
      disconnect/
    api/auth/logout/            Fermer la session courante
    api/auth/sessions/          Déconnecter tous les appareils
    api/auth/account/           Suppression définitive du compte
    api/goals/[id]/             DELETE / PATCH
    api/training/plans/         Création, régénération, pause, suppression
    api/training/sessions/[id]/ Statut, ressenti, édition d'une séance
    api/training/checkin/       Point hebdomadaire → réadaptation
  components/
    charts/                     Recharts (volume, charge, allure, zones FC)
    charts/FormChart.tsx        Condition / fatigue / fraîcheur, avec projection
    charts/AnalysisCharts.tsx   Allure-durée, vitesse critique, polarisation, comparatif
    analysis/                   Grille de régularité
    training/                   PlanBuilder, SessionCard, CheckinForm, WeekAccordion
    StatCard, SyncButton, ...
  lib/
    auth.ts                     Sessions, cookie, création de compte Strava
    auth-policy.ts              Liste d'accès et code d'invitation (fonctions pures)
    api.ts                      Garde 401 / 404 des routes API
    strava.ts                   Client API + OAuth + refresh token auto
    stats.ts                    ⭐ Moteur de calcul (volume, charge, ACWR)
    training.ts                 ⭐ Progression, faisabilité, composition, adaptation
    prediction.ts               ⭐ Source unique des chronos (potentiel / réaliste)
    fitness-model.ts            PMC de Banister : CTL, ATL, TSB, projection
    analysis.ts                 Polarisation, comparatif annuel, régularité, records
    goal.ts                     Score de préparation et prérequis d'une course
    workouts.ts                 Séances structurées + allures par bloc
    plan-store.ts               Persistance des plans, liaison séance ↔ activité
    queries.ts                  Accès base typé
    format.ts                   Formatage (allure, durée, distance)
  components/
    AccountMenu.tsx             Menu de compte (avatar, déconnexion)
    AccountActions.tsx          Sessions et suppression de compte
scripts/
  db-provider.mjs               Aligne le provider Prisma sur DATABASE_PROVIDER
  migrate-multiuser.mts         Migration mono → multi-utilisateur
prisma/schema.prisma            User, Session, StravaAccount, Activity,
                                BestEffort, Split, RaceGoal, TrainingPlan,
                                PlannedSession, WeekCheckin, Gear…
```

## Commandes

| Commande | Effet |
|---|---|
| `pnpm dev` | Serveur de développement (Turbopack) |
| `pnpm prod` | Build + serveur de production — **le plus rapide à l'usage** |
| `pnpm build` | Build de production seul |
| `pnpm db:push` | Applique le schéma Prisma (provider selon `DATABASE_PROVIDER`) |
| `pnpm db:migrate-users` | Migre une base mono-utilisateur vers le schéma multi-compte |
| `pnpm db:studio` | Explorateur de base graphique |
| `pnpm test` | Suite de tests (183 tests sur le moteur de calcul) |
| `pnpm test:watch` | Tests en mode watch |

## Performance

Si la navigation te semble lente, c'est presque toujours le **mode dev**, pas l'app :
Next.js compile chaque route à la demande au premier accès.

Mesures sur 41 activités :

| | 1er accès `/` | Accès suivants |
|---|---|---|
| webpack, charts eager | ~4,6 s | 0,15 s |
| Turbopack + charts différés | ~2,4 s | **0,04 s** |
| `pnpm prod` | 0,04 s | 0,04 s |

**Pour un usage quotidien, lance `pnpm prod`** : tout est précompilé, chaque page
répond en ~40 ms. Garde `pnpm dev` uniquement quand tu modifies le code.

Ce qui a été optimisé :
- **Turbopack** activé sur `pnpm dev` (compilation 5 à 9× plus rapide)
- **Recharts chargé en différé** (`src/components/charts/Lazy.tsx`) : le dashboard
  passe de 226 kB à 109 kB de JS au premier chargement. Les KPI et tableaux
  s'affichent instantanément, les graphiques arrivent juste après

Les requêtes base ne sont pas un facteur : ~3 ms pour charger toutes les activités.

## Tests

Le moteur de calcul est couvert par 183 tests (`node --test`, sans dépendance externe) :

```bash
pnpm test
```

- `tests/vdot.test.ts` — modèle VDOT confronté aux tables de Daniels, cohérence
  aller-retour, monotonie des allures
- `tests/records.test.ts` — records, sélection de la base de prédiction,
  non-régression explicite sur le bug « 5 km sub-25 prédit à 35 min »
- `tests/stats.test.ts` — volume hebdo, charge TRIMP, ACWR, zones FC, tendances
- `tests/training.test.ts` — bornes de progression, faisabilité, composition de
  semaine, règles de réadaptation, structure des séances, semaine de course,
  nombre de sorties automatique, charge déclarée. Un test vérifie explicitement
  qu'un plan « 35 km/sem → 100 km dans un an » ne démarre pas au-dessus de
  36 km la première semaine, un autre que la course est bien placée le jour J
  avec sa distance et sans intensité les jours précédents
- `tests/prediction.test.ts` — l'exposant d'endurance est retrouvé exactement sur
  un coureur synthétique généré avec un exposant connu (1.03, 1.06, 1.11), CS et
  D′ retrouvés sur un modèle parfait, prédiction jamais plus lente qu'un record
  réel, pénalité de volume appliquée au marathon mais jamais au 5 km, plan
  d'allure qui retombe exactement sur le chrono visé
- `tests/auth.test.ts` — liste d'accès, code d'invitation en comparaison à temps
  constant, priorité de la liste sur le code, nom affiché
- `tests/fitness-model.test.ts` — la CTL converge vers la charge quotidienne
  moyenne, la fatigue réagit plus vite que la condition, la condition chute à
  l'arrêt, le pic de fraîcheur tombe en fin d'affûtage, polarisation, régularité
  et chronologie des records

## Notes techniques

- Le `userId` n'est **jamais** lu depuis une requête entrante : il est résolu à
  partir de la session, dans `lib/queries.ts` et `lib/plan-store.ts`. Une page
  ne peut donc pas oublier un filtre
- `requireUser()` **redirige** vers `/login` au lieu de lever : une session
  expirée entre deux navigations donne un retour naturel à la connexion, pas une
  page d'erreur. Les routes API passent par `authed()`, qui répond 401 en JSON
- `Gear.id` est devenu un identifiant applicatif ; l'identifiant Strava vit dans
  `stravaGearId`, unique par utilisateur. `Activity.gearId` continue de porter
  l'identifiant Strava
- Toutes les données sont stockées en **unités SI** (mètres, secondes, m/s) ;
  le formatage se fait à l'affichage via `lib/format.ts`
- Les tokens Strava sont **rafraîchis automatiquement** (marge de 2 min avant expiration)
- Le calcul des zones FC impute la séance entière à la zone de sa FC moyenne
  (approximation — les streams Strava seconde par seconde donneraient l'exact)
- L'**ACWR reste masqué tant que 28 jours d'historique ne sont pas disponibles** :
  sans cela la charge chronique est artificiellement basse et le ratio explose
  (valeurs à 3-4 sans aucun sens). L'affichage est par ailleurs plafonné à 3, car
  au-delà la valeur exacte n'apporte rien et écraserait la zone utile 0,8–1,3
- Le VDOT est conservé en pleine précision pour les calculs et arrondi uniquement
  à l'affichage
- La cadence Strava est doublée à l'import (Strava renvoie une seule jambe)
- Le plan ne raisonne pas en « semaine type » figée : les volumes sont calculés
  d'abord (`weeklyVolumes`), puis répartis sur les jours (`composeWeek`), ce qui
  permet de changer le nombre de jours disponibles sans recalculer la trajectoire
- La réadaptation s'applique aux semaines **futures** uniquement, avec un effet
  dégressif ; les séances `locked` ou déjà passées sont préservées
- Le texte des ajustements est volontairement factuel (« −30 % de volume · sans
  intensité ») : pas de commentaire sur la difficulté ressentie
- **Un seul chiffre par notion** : le volume de référence, la sortie longue, le
  VDOT et les chronos prédits viennent tous des mêmes fonctions
  (`currentFitness`, `racePrediction`). Deux pages ne peuvent plus annoncer deux
  valeurs différentes pour la même chose
- L'exposant d'endurance n'est mesuré qu'à partir de **3 performances proches du
  meilleur VDOT** (tolérance 4 points) et sur un rapport de distances d'au moins
  2,5× : sinon la régression log-log se ferait sur du bruit, et on retombe sur
  la valeur de référence 1.06
- Le PMC est prolongé par les séances planifiées, avec une charge estimée
  (`plannedLoad`) à partir de la distance, de la durée et de l'intensité de la
  séance : la partie projetée de la courbe est tracée en pointillés

## Roadmap

**v2 — Muscu**
- Saisie exercices : séries / reps / charge
- 1RM estimé (Epley / Brzycki), volume par groupe musculaire
- Suivi de progression par mouvement, programmation de blocs de force

**Plus tard**
- Export du plan en .ics / vers la montre
- Webhook Strava par utilisateur (aujourd'hui la synchro est manuelle)
- Page d'administration (liste des comptes, quota Strava consommé)
- Streams Strava pour la vitesse critique (efforts de 2 à 30 min extraits des
  courbes de puissance-vitesse plutôt que des seuls records officiels)
- Streams Strava (zones FC exactes, analyse des splits, dérive cardiaque)
- Webhook Strava pour sync temps réel
- Carte des parcours (polylines déjà stockées en base)
