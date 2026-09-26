# Foulée

Application d'analyse d'entraînement **multi-utilisateur**. Import automatique depuis Strava,
statistiques de course à pied, **plan d'entraînement séance par séance** qui se
recale chaque semaine sur ce que tu as réellement couru (avec **conformité**
semaine par semaine), une **section analyse** qui applique aux données les modèles
utilisés en sport de haut niveau (PMC de Banister, vitesse critique, exposant
d'endurance personnel, **seuils LT1/LT2 personnalisés**, **découplage aérobie**),
des **cartes de parcours** sans aucun service de tuiles, un **carnet quotidien**
(sommeil, récupération, score de préparation), une **bibliothèque de séances**
calibrées sur le VDOT, un **plan de course** (GPX, profil, ravitaillement), un
**carnet de musculation** pensé pour le coureur, et une **rétrospective**
annuelle imprimable.

Interface éditoriale, thème clair et sombre, aucune dépendance de composants UI.
Déployée, chaque personne se connecte avec son compte Strava et ne voit que ses
propres données.

### Organisation en sept pôles

La barre de navigation regroupe les pages en sept univers : **Aujourd'hui**
(résumé + carnet du jour), **Activités** (liste, **atelier de parcours**,
**import de fichiers**), **Entraînement** (plan, bibliothèque de séances,
**séances personnalisées**), **Courses** (objectifs, **saison multi-objectifs**,
plans de course, records, prédictions & calculs), **Analyse** (forme & charge,
modèles & seuils, séances passées), **Corps** (musculation, matériel) et
**Plus** (rétrospective, lexique, réglages). Dès qu'on entre dans un pôle, une
**sous-barre** liste toutes ses pages (source unique : `lib/poles.ts`) — plus
de fonctionnalité cachée.

Sur l'accueil, un **rappel contextuel** (`lib/nudges.ts`) suggère une seule
chose utile au bon moment : préparer le plan de course à moins de 8 semaines,
créer le plan d'une course lointaine, noter ses ressentis, remplacer des
chaussures usées, lire la rétrospective en début de mois. On peut l'ignorer :
il se tait jusqu'à ce que la situation change.

Une **visite guidée** accueille la première connexion : un projecteur se
promène sur les six pôles avec des bulles d'infos, se relance à tout moment
via le bouton « ? » flottant ou le pôle Plus.

L'**accueil des nouveaux** est guidé : une carte « Bien démarrer » suit les
quatre premières étapes (Strava, synchro, objectif, carnet) jusqu'à leur
complétion, un bouton « ? » sur chaque page explique « cette page en trois
phrases », un **lexique** traduit les termes (CTL, VDOT, seuils…), et le
profil athlète affiche sa complétude dans les réglages.

## Démarrage

```bash
pnpm install
cp .env.example .env              # puis remplir les identifiants Strava
openssl rand -hex 32              # → à coller dans AUTH_SECRET
openssl rand -hex 32              # → à coller dans TOKEN_SECRET (chiffrement des tokens)
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

Les tokens Strava (`accessToken` / `refreshToken`) sont **chiffrés au repos**
(AES-256-GCM) avec `TOKEN_SECRET` : jamais en clair dans la base.

> ⚠️ Strava limite à **100 requêtes / 15 min** et 1000 / jour. La synchro normale
> est incrémentale et ne reprend que les nouvelles activités.

## Comptes et déploiement

### Deux portes d'entrée : Strava ou email

- **Strava** (recommandé) : Strava sert d'identité, aucun mot de passe. Le retour
  d'OAuth crée le compte s'il n'existe pas, puis ouvre une session.
- **Email + mot de passe**, pour qui n'a pas Strava : les données viennent alors
  de l'import de fichiers (FIT/GPX/TCX, export Garmin) et du carnet. Le mot de
  passe est haché en **scrypt** (sel aléatoire, `lib/password.ts`), 10 caractères
  minimum ; après 5 échecs en 15 minutes l'email est freiné ; un email inconnu
  prend le même temps qu'un mauvais mot de passe (pas d'énumération) ; les
  formulaires refusent les requêtes d'une autre origine (CSRF de connexion).
  L'email n'est pas vérifié et il n'y a **pas de réinitialisation par email**.
  Un compte email peut connecter Strava plus tard depuis les Réglages : il
  pourra ensuite entrer par l'une ou l'autre porte.

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

Les comptes email suivent le même code d'invitation. Une instance privée
(`ALLOWED_ATHLETES` renseigné) **sans** code d'invitation ferme l'inscription
par email, faute de pouvoir vérifier l'identité.

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
- **Forme aérobie — l'allure à FC fixe** : « à 155 bpm, tu cours à 5:22/km,
  contre 5:41 il y a trois mois ». Régression vitesse ~ FC sur 6 semaines
  glissantes, sur les seuls km plats des footings, avec marge d'erreur à 95 % ;
  l'écart n'est déclaré que s'il sort de la marge (`lib/aerobic-pace.ts`).
  À côté, la dérive cardiaque médiane des sorties longues.
- **Répartition de l'intensité** au **temps réellement passé** dans chaque zone
  (courbe à la seconde, sinon km-splits, sinon moyenne — la source est affichée),
  en **cardio et en allure** côte à côte, lecture polarisée 80/20 en tête,
  barres semaine par semaine, et un signal quand cœur et allure divergent.
- **Un seul modèle de zones** (`lib/zones.ts`), ancré sur le seuil : zones
  personnelles LT1/LT2 si mesurées, sinon FC de réserve (Karvonen) et allure
  seuil du VDOT. FC max robuste (un pic isolé du capteur est écarté).
- **Comparatif 28 jours** avec écarts signés et colorés selon le sens souhaité ;
  l'allure comparée est celle des footings seulement, et rien n'est affiché sous
  4 sorties par période.

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
| **Polarisation** | Répartition facile / zone grise / intense mois par mois, au temps passé par km (même modèle de zones que l'accueil), et diagnostic 80/20 |
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

### Objectifs du quotidien

En plus des courses, des **objectifs sans échéance de course** avec une jauge de
progression :

- **Volume** — « 200 km ce mois » : les kilomètres du mois en cours
- **Série** — « 30 jours d'affilée » : la série de jours courus en cours
- **Fréquence** — « 4 sorties/semaine » : les sorties de la semaine

Chacun affiche l'avancement réel, la cible et le pourcentage, calculés en heure
locale (`lib/goal-progress.ts`).

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

L'interface est **multilingue** : français (par défaut), anglais et espagnol.
La langue se choisit **dès l'écran de connexion** (à la première visite, celle
du navigateur est proposée via `Accept-Language`), puis dans Réglages ; elle
est enregistrée sur le profil à la création du compte (elle suit l'utilisateur
sur tous ses appareils) et ne change jamais les URLs.

| Page | Contenu |
|---|---|
| **Résumé** | La saison en une phrase, séance du jour en grand (frise, repères semaine / course / fraîcheur), bande nuit de l'état de forme, rappel contextuel, observations, calendrier d'une année (séances prévues en pointillés), charge, volume, forme aérobie, répartition de l'intensité |
| **Activités** | Liste filtrable avec vignettes de tracé, vues **Mosaïque** et **Carte** (chaleur + parcours récurrents), fiche détaillée par séance |
| **Entraînement** | Plan séance par séance (avec le « pourquoi » de chaque séance), point hebdo, réadaptation, trajectoire de volume, **saisons multi-objectifs** (courses A/B/C, blocs, affûtage) |
| **Séances personnalisées** | Saisie rapide en texte (`20' EF + 3×(6×400 @VMA r=1'30)`), cibles relatives, profil et charge en direct, planification et export `.fit` vers la montre |
| **Atelier de parcours** | Dessiner sur son propre réseau (les rues déjà courues, sans tuiles) : boucles générées, lignes droites pour le fractionné, points d'intérêt, export GPX |
| **Import de fichiers** | FIT, GPX, TCX et export complet Garmin (.zip) — décodeur FIT maison, fusion avec Strava sans doublon, carnet complété (sommeil, FC de repos, VFC) |
| **Plan de course** | Du GPX à la ligne d'arrivée : tronçons, allures à effort constant (GAP + facteur de pente personnel + chaleur), scénarios A/B/C avec signal de bascule, nutrition calée sur le temps, bracelet, débrief |
| **Conseil du jour** | Un seul conseil priorisé (douleur, surcharge, course proche, affûtage, carnet, forme) |
| **Agent** | Le brief de la semaine (bilan, semaine à venir, objectif, conseil), calculé par règles, rédigé par un LLM (DeepSeek) si configuré — agrégats uniquement, jamais de tracé |
| **Backyard ultra** | Calculateur boucle par boucle (course/marche, repos, sommeil emprunté) et volume en heures |
| **Analyse** | PMC (condition/fatigue/fraîcheur), potentiel vs réaliste, courbe allure-durée, vitesse critique, polarisation, comparatif annuel, régularité, barres passées |
| **Performance** | Records, niveau de forme VDOT, prédictions potentiel/réaliste, allures d'entraînement |
| **Calculateur** | Outil interactif : performance → VDOT, VMA, chronos équivalents, allures |
| **Objectifs** | Préparation de course, score /100, fraîcheur projetée le jour J, plan d'allure, plan lié |
| **Matériel** | Kilométrage et usure des chaussures, seuil de remplacement ajustable |
| **Muscu** | Carnet de séance (séries, charges, RIR), 1RM estimé, records, progression suggérée, équilibre de la chaîne du coureur |
| **Rétrospective** | Année ou mois raconté : kilométrage et comparaison, la saison tracé par tracé, quand tu cours, les moments, records tombés |
| **Entraînement** | La semaine en sept colonnes (date, séance, frise, aujourd'hui marqué) ; plan séance par séance, trajectoire, point hebdomadaire |
| **Objectifs** | L'affiche de la course en bande nuit : nom en grand, compte à rebours, chemin des semaines coloré par phase, préparation et chrono réaliste |
| **Performance** | VDOT en très grand, « coureur confirmé », « tu vaux un marathon en… », records, prédictions |
| **Matériel** | La prochaine paire à remplacer en compteur : usure, km/semaine, semaines restantes |

### Parcours et cartes — sans tuiles

Strava fournit pour chaque sortie un `summary_polyline`. `lib/polyline.ts` le
décode, le projette en Mercator, le simplifie (Ramer–Douglas–Peucker) et le
dessine en SVG pur : aucune clé d'API, aucune tuile, rien qui sorte de l'instance.

| Où | Ce qu'on voit |
|---|---|
| **Fiche séance** | Tracé sur papier millimétré, **coloré kilomètre par kilomètre selon l'allure** (vert = plus vite que la moyenne, terre cuite = plus lent), bornes kilométriques, nord, barre d'échelle. Survoler un kilomètre sur la carte le met en évidence dans la bande d'allure, et inversement (flèches ← → au clavier) |
| **Liste** | Silhouette du tracé en tête de ligne |
| **Mosaïque** | Une vignette par sortie : on reconnaît ses boucles habituelles d'un coup d'œil |
| **Carte** | Toutes les sorties d'un secteur superposées en traits translucides sur fond nuit : les rues les plus courues s'illuminent. Secteurs regroupés par point de départ (25 km) |
| **Parcours récurrents** | Sorties reconnues comme le même parcours, avec leur record |

**Même parcours** : chaque tracé est rééchantillonné en 16 points équidistants ;
deux sorties sont le même parcours si l'écart moyen point à point est sous 120 m
(dans un sens ou dans l'autre) et la distance à ±12 %. La fiche séance affiche
alors l'historique des passages et le rang de la séance, plus son rang en allure
parmi les sorties de distance voisine.

La polyline résumée étant plus courte que la distance réelle, les distances
cumulées sont remises à l'échelle de la distance Strava : le tronçon n°5 de la
carte correspond bien au split n°5.

### Fiche séance

En plus du tracé : **prévu · réalisé** quand la séance valide une séance du plan
(distance, durée, allure, écart en %), **négative split**, **découplage
cardiaque** calculé sur l'efficience (vitesse ÷ FC, pas la FC brute, pour ne pas
confondre dérive et changement d'allure), et un **carnet** : effort perçu 1-10,
sensations, note privée, drapeau « course ». Le carnet s'enregistre au fil de la
saisie ; la note privée n'est jamais écrasée par la synchro (contrairement à la
description Strava), et un drapeau « course » posé à la main est verrouillé.

### Musculation

Un carnet pensé pour être rempli entre deux séries, téléphone en main :

- **Modèles** orientés coureur (Renfo A / B, prévention express, haut du corps)
  et « répéter la dernière séance » ; 41 exercices, chacun avec ses muscles et
  son intérêt pour la course (« soléaire : encaisse jusqu'à 8× le poids du
  corps »)
- **Préremplissage** depuis la dernière fois, **suggestion de double
  progression** (toutes les séries réussies avec marge → +1 pas de charge ;
  sinon même charge, +1 répétition), **1RM estimé en direct** (moyenne
  Epley/Brzycki, répétitions en réserve incluses, rien au-delà de 12) et badge
  « record en vue »
- Séries d'échauffement (non comptées), **minuteur de repos** lancé en cochant
  une série, **brouillon** conservé si la page se recharge
- Rattachement automatique à la séance Strava du même jour (durée, FC), et
  **coche automatique** de la séance « Renforcement » prévue par le plan
- Vue d'ensemble : **la chaîne du coureur** (séries dures par semaine face à
  une fourchette de complément à la course), son **évolution sur 12 semaines**,
  le **garde-fou de charge** (séries dures 7 j vs 28 j, sur le modèle de l'ACWR
  course), la **force relative** (1RM ÷ poids de corps, avec repère de niveau),
  les **objectifs de force** (cible de 1RM avec jauge), le nuage **RPE × charge**,
  la tendance de 1RM par exercice, la régularité et l'historique fusionné avec
  les séances Strava à « détailler »
- **Exercices épinglés** en tête du sélecteur, et **séance planifiée pré-remplie**
  (nom, durée) quand le plan prévoit un renforcement

Une « série dure » est une série de travail à RIR ≤ 4 ; un muscle secondaire
compte pour une demi-série.

### Palette de commandes et raccourcis

`⌘K` / `Ctrl+K` (ou `/`) ouvre la palette : pages, actions (synchroniser,
thème, nouvelle séance de muscu, agenda…), recherche des séances par nom, date
ou distance, objectifs et plans. Elle fait aussi du **calcul express** :

```
5k 24:30        → VDOT 39,2 · 4'54"/km · 10 km 50'51" · semi 1h52 · marathon 3h53
semi en 1h45    → idem depuis le semi
4'45/km         → 12,6 km/h · temps de passage 5 km, 10 km, semi, marathon
13 km/h         → idem
```

Raccourcis : `g` puis une lettre pour chaque page (`g r` résumé, `g a`
activités, `g e` entraînement, `g k` carte, `g y` rétrospective…), `?` pour
l'aide, `Maj+D` pour le thème, `←` `→` pour passer d'une séance à l'autre.
Sur mobile, une barre d'onglets en bas donne les quatre pages du quotidien.

### Agenda (iCalendar)

Réglages → Agenda donne une **adresse secrète** à coller dans Google Agenda,
Apple Calendrier ou Outlook. Les séances y sont des événements « journée
entière » (on place sa séance dans sa journée), avec la structure et les
allures en description, et les courses objectif avec un rappel à J−7. Les UID
sont stables : quand le plan se réadapte, l'agenda met à jour l'événement au
lieu de le dupliquer. L'adresse est révocable et régénérable ; elle n'ouvre
qu'une lecture du plan.

### Export de données

Réglages → Export télécharge **toutes tes données en JSON** (activités, objectifs,
séances du plan — tracés GPS inclus) ou **les activités en CSV** pour un tableur.
Aucune dépendance, aucune attente : tes données t'appartiennent.

### Synchronisation automatique

À l'ouverture de l'app, si la dernière synchro date de plus de 3 h, une synchro
incrémentale part en arrière-plan. Rien ne s'affiche sauf s'il y a du nouveau
(« 2 nouvelles activités · Voir »). Côté API, une seule synchro peut tourner à la
fois par compte : le quota Strava est partagé par toute l'instance.

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
    login/page.tsx              Connexion Strava ou email, choix de la langue
    activities/page.tsx         Liste + filtres
    records/page.tsx            PB, prédictions potentiel/réaliste, allures cibles
    analysis/page.tsx           PMC, courbe allure-durée, vitesse critique, polarisation
    goals/page.tsx              Objectifs de course
    goals/[id]/page.tsx         Préparation d'un objectif
    training/page.tsx           Semaine en cours + point hebdo
    training/[id]/page.tsx      Plan complet, semaine par semaine, réglages
    strength/                   Muscu : vue d'ensemble, carnet (new, [id]/edit), séance, exercice
    recap/page.tsx              Rétrospective annuelle / mensuelle
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
    api/activities/[id]/        Carnet d'une activité (RPE, sensations, note, course)
    api/strength/workouts/      Séances de musculation (création, édition, suppression)
    api/calendar/[token]/       Flux iCalendar public (jeton secret)
    api/settings/calendar/      Activer / régénérer / désactiver le flux
    api/palette/                Index de recherche de la palette
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
    polyline.ts                 Tracés GPS : décodage, projection, km, même parcours
    strength.ts                 Exercices, 1RM, volume, records, suggestion
    strength-store.ts           Persistance musculation, rattachement Strava / plan
    ics.ts                      Export iCalendar (RFC 5545)
    quick-calc.ts               Calcul express de la palette
    frieze.ts                   Frise d'une séance (structure → segments)
    recap.ts                    Rétrospective : comparaisons, séries, « quand »
  components/
    AccountMenu.tsx             Menu de compte (avatar, déconnexion)
    AccountActions.tsx          Sessions et suppression de compte
scripts/
  db-provider.mjs               Aligne le provider Prisma sur DATABASE_PROVIDER
  migrate-multiuser.mts         Migration mono → multi-utilisateur
prisma/schema.prisma            User, Session, StravaAccount, Activity,
                                BestEffort, Split, RaceGoal, TrainingPlan,
                                PlannedSession, WeekCheckin, Gear,
                                StrengthWorkout, StrengthSet…
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
| `pnpm test` | Suite de tests (234 tests sur le moteur de calcul) |
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

Le moteur de calcul est couvert par 234 tests (`node --test`, sans dépendance externe) :

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
- `tests/polyline.test.ts` — décodage (exemple de référence Google), découpage
  au kilomètre et remise à l'échelle, même parcours (décalé, sens inverse,
  éloigné), regroupement par secteur
- `tests/strength.test.ts` — 1RM (Epley/Brzycki, RIR), séries dures, records
  (jamais au premier passage), double progression
- `tests/quick-calc.test.ts`, `tests/ics.test.ts`, `tests/frieze.test.ts`,
  `tests/recap.test.ts` — calcul express, repli des lignes iCalendar sans
  couper l'UTF-8, frise de séance, série de jours à travers le changement d'heure
- `tests/fitness-model.test.ts` — la CTL converge vers la charge quotidienne
  moyenne, la fatigue réagit plus vite que la condition, la condition chute à
  l'arrêt, le pic de fraîcheur tombe en fin d'affûtage, polarisation, régularité
  et chronologie des records

## Notes techniques

- **Internationalisation (next-intl)** : les messages vivent dans
  `messages/{fr,en,es}.json` (parité des clés vérifiée par `tests/i18n.test.ts`).
  La locale est résolue par le cookie `NEXT_LOCALE` (`src/i18n/request.ts`),
  synchronisé avec `User.language` via `/api/lang-sync` (le layout ne peut pas
  écrire de cookie). Les composants serveur utilisent `getTranslations`, les
  clients `useTranslations`. Le contenu **généré puis persisté** (plans, étapes
  de séance, ajustements, textes de rétrospective) reste dans la langue de
  création — comme les données saisies par l'utilisateur.

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
- Les zones se comptent au temps passé : courbe à la seconde quand elle existe
  (pauses de montre > 30 s ignorées), sinon km-splits, sinon moyenne de séance
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

La feuille de route détaillée (15 chantiers, décisions prises) est dans
[`docs/ROADMAP.md`](docs/ROADMAP.md). **Phases 0 à 3 réalisées** : zones
uniques au temps passé, forme aérobie, calendrier, navigation à 7 pôles,
séances personnalisées, import de fichiers, atelier de parcours, plan de
course + nutrition, saison multi-objectifs, conseils, agent (LLM), machine
learning, backyard, éditions de l'accueil.


**Plus tard**
- Export des séances vers la montre (Garmin / Coros)
- Muscu : programmation de blocs de force, lien charge muscu ↔ fatigue course
- Webhook Strava par utilisateur (aujourd'hui : synchro auto à l'ouverture si > 3 h)
- Page d'administration (liste des comptes, quota Strava consommé)
- Streams Strava pour la vitesse critique (efforts de 2 à 30 min extraits des
  courbes de puissance-vitesse plutôt que des seuls records officiels)
