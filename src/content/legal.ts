/**
 * Mentions légales et politique de confidentialité, en trois langues.
 *
 * Contenu éditorial (pas des messages d'interface) : un module par page
 * plutôt que des dizaines de clés dans messages/*.json. La parité des
 * structures entre langues est testée (tests/legal.test.ts).
 *
 * Variables remplacées au rendu : {publisher}, {contact}, {host}, {url}
 * (voir `legalIdentity()` — renseignées dans .env).
 */

export type LegalSection = { title: string; body: string[] };
export type LegalPage = { title: string; lead: string; updated: string; sections: LegalSection[] };
export type LegalLocale = { legal: LegalPage; privacy: LegalPage };

export const LEGAL_UPDATED = "2026-09-26";

const fr: LegalLocale = {
  legal: {
    title: "Mentions légales",
    lead: "Qui publie Foulée, où elle est hébergée, et ce qu'elle n'est pas.",
    updated: "Mise à jour le 26 septembre 2026",
    sections: [
      {
        title: "Éditeur",
        body: [
          "Foulée ({url}) est un site personnel, gratuit, sans publicité ni but commercial, édité par {publisher}, qui en est aussi le directeur de la publication.",
          "Contact : {contact}",
        ],
      },
      { title: "Hébergement", body: ["{host}"] },
      {
        title: "Marques",
        body: [
          "Foulée n'est ni développée, ni sponsorisée, ni approuvée par Strava. Strava est une marque de Strava, Inc. ; « Powered by Strava » signale seulement que Foulée utilise l'API Strava pour les comptes qui la connectent.",
          "Garmin, FIT et les autres noms cités sont des marques de leurs propriétaires respectifs, mentionnées pour décrire la compatibilité des fichiers importés.",
        ],
      },
      {
        title: "Données cartographiques",
        body: [
          "Le fond de rues de l'atelier de parcours provient d'OpenStreetMap © contributeurs OpenStreetMap, disponible sous licence ODbL (openstreetmap.org/copyright).",
        ],
      },
      {
        title: "Responsabilité",
        body: [
          "Les estimations de Foulée (prédictions de chrono, charge, plans d'entraînement) sont des calculs indicatifs, pas des avis médicaux. En cas de doute sur ta santé, demande l'avis d'un professionnel avant d'augmenter ton entraînement.",
        ],
      },
      {
        title: "Données personnelles",
        body: ["Leur traitement est décrit dans la politique de confidentialité."],
      },
    ],
  },
  privacy: {
    title: "Confidentialité",
    lead: "Ce que Foulée sait de toi, pourquoi, où ça va — et comment tout récupérer ou tout effacer. Version courte : tes données servent à ton entraînement, à rien d'autre, et ne sont vues que par toi.",
    updated: "Mise à jour le 26 septembre 2026",
    sections: [
      {
        title: "Responsable du traitement",
        body: ["{publisher} — {contact}. Pour toute question ou demande sur tes données, écris à cette adresse."],
      },
      {
        title: "Ce que Foulée enregistre",
        body: [
          "Ton compte : prénom (et nom, photo de profil et ville si tu te connectes avec Strava), identifiant athlète Strava, ou adresse email et empreinte de ton mot de passe (jamais le mot de passe lui-même).",
          "Tes activités, venues de Strava ou des fichiers de montre que tu importes : date, distance, durée, allure, dénivelé, fréquence cardiaque, cadence, calories, tracé GPS, km par km, records, équipement.",
          "Ce que tu saisis : carnet quotidien (sommeil, fréquence cardiaque au repos, VFC, ressenti, fatigue, notes), poids, FC max, VMA, objectifs et courses, plans et séances, musculation, parcours dessinés, produits de nutrition.",
          "Techniquement : un cookie de session, la date de dernière visite, le navigateur utilisé pour chaque session ouverte (pour que tu puisses les reconnaître et les fermer), et un journal des erreurs du serveur.",
        ],
      },
      {
        title: "Données de santé",
        body: [
          "Fréquence cardiaque, VFC, sommeil, poids et ressenti peuvent révéler des informations sur ta santé : ce sont des données sensibles. Foulée ne les traite qu'avec ton consentement explicite, donné à la création du compte, et uniquement pour analyser ton entraînement.",
          "Tu peux retirer ce consentement à tout moment en supprimant les données concernées ou ton compte.",
        ],
      },
      {
        title: "Pourquoi, et sur quelle base",
        body: [
          "Fournir le service que tu demandes : analyses, prédictions, plans (exécution du service, et ton consentement pour les données de santé).",
          "Protéger l'instance : freinage des tentatives de connexion et d'inscription, journal des erreurs (intérêt légitime).",
          "Rien d'autre : pas de publicité, pas de profilage commercial, pas de revente, aucun outil de mesure d'audience ni traceur tiers.",
        ],
      },
      {
        title: "Qui y a accès",
        body: [
          "Toi seul. Chaque compte ne voit que ses propres données : aucune activité, aucun tracé n'est montré à un autre utilisateur.",
          "L'administrateur de l'instance ({publisher}) a techniquement accès au serveur et à la base, et voit la liste des comptes connectés à Strava ; il ne consulte pas tes données, sauf à ta demande ou pour corriger une panne.",
          "Strava, si tu connectes ton compte : Foulée lit ton profil et tes activités via l'API Strava (lecture seule, jamais d'écriture) ; ces échanges relèvent aussi de la politique de confidentialité de Strava.",
          "OpenStreetMap : l'atelier de parcours demande à un serveur Overpass public les rues du rectangle géographique où tu cours. Seul ce rectangle est envoyé — ni ton identité, ni tes tracés.",
          "Aucune intelligence artificielle ni service d'IA externe ne reçoit tes données.",
        ],
      },
      {
        title: "Où, et combien de temps",
        body: [
          "Sur le serveur de l'instance : {host}.",
          "Tant que ton compte existe. La suppression du compte efface immédiatement et définitivement toutes tes données ; elles disparaissent aussi des sauvegardes de la base sous 14 jours (rotation).",
          "Déconnecter Strava efface les activités, l'équipement et les jetons venus de Strava (ce que tu as importé ou saisi toi-même reste). Révoquer l'accès depuis strava.com produit le même effet.",
          "Sessions : 90 jours au plus. Journal des erreurs : 30 jours. Compteurs anti-abus : quelques heures, en mémoire, jamais écrits sur disque.",
        ],
      },
      {
        title: "Sécurité",
        body: [
          "Connexion chiffrée (HTTPS) ; mot de passe haché avec scrypt et un sel aléatoire ; jetons Strava chiffrés au repos (AES-256-GCM) ; le cookie de session ne contient qu'un jeton aléatoire, dont seule l'empreinte est stockée ; en-têtes de sécurité stricts (CSP).",
        ],
      },
      {
        title: "Tracés GPS",
        body: [
          "Un tracé peut désigner ton domicile. Par défaut, Foulée masque à l'affichage le début et la fin de chaque tracé dans un rayon de 500 m (réglable dans Réglages → Confidentialité des tracés). Les données enregistrées restent complètes pour tes analyses et ton export.",
        ],
      },
      {
        title: "Tes droits",
        body: [
          "Accès et portabilité : Réglages → Export — un fichier JSON complet (et un CSV de tes activités), à tout moment, sans demande.",
          "Rectification : modifie tes réglages, tes séances, ton carnet directement dans l'app.",
          "Effacement : Réglages → Compte → Supprimer mon compte, immédiat et définitif.",
          "Opposition, limitation, retrait du consentement, question : {contact}. Réponse sous un mois.",
          "Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (cnil.fr).",
        ],
      },
      {
        title: "Cookies",
        body: [
          "Seulement ceux qui sont indispensables : foulee_session (ta connexion) et NEXT_LOCALE (ta langue). Le navigateur garde aussi localement ton thème, l'avancement de la visite guidée et quelques préférences d'affichage. Aucun cookie publicitaire ni de mesure d'audience — d'où l'absence de bandeau.",
        ],
      },
      {
        title: "Âge",
        body: ["Foulée s'adresse aux personnes de 15 ans et plus."],
      },
      {
        title: "Modifications",
        body: [
          "Cette page peut évoluer avec l'app ; la date de mise à jour figure en tête. Un changement important sera signalé dans l'app.",
        ],
      },
    ],
  },
};

const en: LegalLocale = {
  legal: {
    title: "Legal notice",
    lead: "Who publishes Foulée, where it is hosted, and what it is not.",
    updated: "Updated on 26 September 2026",
    sections: [
      {
        title: "Publisher",
        body: [
          "Foulée ({url}) is a personal, free website with no advertising and no commercial purpose, published by {publisher}, who is also its publication director.",
          "Contact: {contact}",
        ],
      },
      { title: "Hosting", body: ["{host}"] },
      {
        title: "Trademarks",
        body: [
          "Foulée is not developed, sponsored or endorsed by Strava. Strava is a trademark of Strava, Inc.; “Powered by Strava” only means that Foulée uses the Strava API for accounts that connect it.",
          "Garmin, FIT and the other names mentioned are trademarks of their respective owners, cited to describe the compatibility of imported files.",
        ],
      },
      {
        title: "Map data",
        body: [
          "The street layer of the route workshop comes from OpenStreetMap © OpenStreetMap contributors, available under the ODbL licence (openstreetmap.org/copyright).",
        ],
      },
      {
        title: "Liability",
        body: [
          "Foulée's estimates (race-time predictions, load, training plans) are indicative calculations, not medical advice. If in doubt about your health, ask a professional before increasing your training.",
        ],
      },
      {
        title: "Personal data",
        body: ["How it is processed is described in the privacy policy."],
      },
    ],
  },
  privacy: {
    title: "Privacy",
    lead: "What Foulée knows about you, why, where it goes — and how to get it all back or erase it all. Short version: your data serves your training, nothing else, and only you see it.",
    updated: "Updated on 26 September 2026",
    sections: [
      {
        title: "Data controller",
        body: ["{publisher} — {contact}. For any question or request about your data, write to this address."],
      },
      {
        title: "What Foulée stores",
        body: [
          "Your account: first name (and last name, profile picture and city if you sign in with Strava), Strava athlete ID, or email address and a hash of your password (never the password itself).",
          "Your activities, from Strava or from the watch files you import: date, distance, duration, pace, elevation, heart rate, cadence, calories, GPS track, splits, records, gear.",
          "What you enter: daily log (sleep, resting heart rate, HRV, feeling, fatigue, notes), weight, max HR, VO2max speed, goals and races, plans and sessions, strength training, drawn routes, nutrition products.",
          "Technically: a session cookie, the date of your last visit, the browser used for each open session (so you can recognise and close them), and a server error log.",
        ],
      },
      {
        title: "Health data",
        body: [
          "Heart rate, HRV, sleep, weight and feeling can reveal information about your health: they are sensitive data. Foulée only processes them with your explicit consent, given when you create your account, and only to analyse your training.",
          "You can withdraw this consent at any time by deleting the data concerned or your account.",
        ],
      },
      {
        title: "Why, and on what basis",
        body: [
          "To provide the service you ask for: analysis, predictions, plans (performance of the service, and your consent for health data).",
          "To protect the instance: throttling of sign-in and sign-up attempts, error log (legitimate interest).",
          "Nothing else: no advertising, no commercial profiling, no resale, no analytics or third-party trackers.",
        ],
      },
      {
        title: "Who can access it",
        body: [
          "Only you. Each account only sees its own data: no activity or track is shown to another user.",
          "The instance administrator ({publisher}) technically has access to the server and database, and sees the list of accounts connected to Strava; they do not look at your data except at your request or to fix a failure.",
          "Strava, if you connect your account: Foulée reads your profile and activities through the Strava API (read-only, never writes); these exchanges are also governed by Strava's privacy policy.",
          "OpenStreetMap: the route workshop asks a public Overpass server for the streets inside the geographic rectangle where you run. Only that rectangle is sent — neither your identity nor your tracks.",
          "No artificial intelligence or external AI service receives your data.",
        ],
      },
      {
        title: "Where, and for how long",
        body: [
          "On the instance's server: {host}.",
          "For as long as your account exists. Deleting your account immediately and permanently erases all your data; it also disappears from database backups within 14 days (rotation).",
          "Disconnecting Strava erases the activities, gear and tokens that came from Strava (what you imported or entered yourself stays). Revoking access from strava.com has the same effect.",
          "Sessions: 90 days at most. Error log: 30 days. Anti-abuse counters: a few hours, in memory, never written to disk.",
        ],
      },
      {
        title: "Security",
        body: [
          "Encrypted connection (HTTPS); password hashed with scrypt and a random salt; Strava tokens encrypted at rest (AES-256-GCM); the session cookie only holds a random token, of which only the hash is stored; strict security headers (CSP).",
        ],
      },
      {
        title: "GPS tracks",
        body: [
          "A track can point to your home. By default, Foulée hides on screen the start and end of every track within a 500 m radius (adjustable in Settings → Route privacy). The stored data stays complete for your analysis and your export.",
        ],
      },
      {
        title: "Your rights",
        body: [
          "Access and portability: Settings → Export — a complete JSON file (and a CSV of your activities), at any time, no request needed.",
          "Rectification: edit your settings, sessions and log directly in the app.",
          "Erasure: Settings → Account → Delete my account, immediate and permanent.",
          "Objection, restriction, withdrawal of consent, questions: {contact}. Answer within one month.",
          "If you believe your rights are not respected, you can lodge a complaint with your data protection authority (in France, the CNIL — cnil.fr).",
        ],
      },
      {
        title: "Cookies",
        body: [
          "Only strictly necessary ones: foulee_session (your sign-in) and NEXT_LOCALE (your language). Your browser also keeps your theme, guided-tour progress and a few display preferences locally. No advertising or analytics cookies — hence no banner.",
        ],
      },
      {
        title: "Age",
        body: ["Foulée is intended for people aged 15 and over."],
      },
      {
        title: "Changes",
        body: [
          "This page may evolve with the app; the update date is shown at the top. Any significant change will be announced in the app.",
        ],
      },
    ],
  },
};

const es: LegalLocale = {
  legal: {
    title: "Aviso legal",
    lead: "Quién publica Foulée, dónde está alojada y lo que no es.",
    updated: "Actualizado el 26 de septiembre de 2026",
    sections: [
      {
        title: "Editor",
        body: [
          "Foulée ({url}) es un sitio personal, gratuito, sin publicidad ni fines comerciales, editado por {publisher}, que es también su director de publicación.",
          "Contacto: {contact}",
        ],
      },
      { title: "Alojamiento", body: ["{host}"] },
      {
        title: "Marcas",
        body: [
          "Foulée no ha sido desarrollada, patrocinada ni aprobada por Strava. Strava es una marca de Strava, Inc.; «Powered by Strava» solo indica que Foulée usa la API de Strava para las cuentas que la conectan.",
          "Garmin, FIT y los demás nombres citados son marcas de sus respectivos propietarios, mencionadas para describir la compatibilidad de los archivos importados.",
        ],
      },
      {
        title: "Datos cartográficos",
        body: [
          "La capa de calles del taller de recorridos procede de OpenStreetMap © colaboradores de OpenStreetMap, disponible bajo licencia ODbL (openstreetmap.org/copyright).",
        ],
      },
      {
        title: "Responsabilidad",
        body: [
          "Las estimaciones de Foulée (predicciones de marca, carga, planes de entrenamiento) son cálculos orientativos, no consejos médicos. Ante cualquier duda sobre tu salud, consulta a un profesional antes de aumentar tu entrenamiento.",
        ],
      },
      {
        title: "Datos personales",
        body: ["Su tratamiento se describe en la política de privacidad."],
      },
    ],
  },
  privacy: {
    title: "Privacidad",
    lead: "Lo que Foulée sabe de ti, por qué, adónde va — y cómo recuperarlo todo o borrarlo todo. En resumen: tus datos sirven a tu entrenamiento, a nada más, y solo los ves tú.",
    updated: "Actualizado el 26 de septiembre de 2026",
    sections: [
      {
        title: "Responsable del tratamiento",
        body: ["{publisher} — {contact}. Para cualquier pregunta o solicitud sobre tus datos, escribe a esta dirección."],
      },
      {
        title: "Qué guarda Foulée",
        body: [
          "Tu cuenta: nombre (y apellidos, foto de perfil y ciudad si entras con Strava), identificador de atleta de Strava, o dirección de correo y huella de tu contraseña (nunca la contraseña en sí).",
          "Tus actividades, de Strava o de los archivos de reloj que importas: fecha, distancia, duración, ritmo, desnivel, frecuencia cardiaca, cadencia, calorías, recorrido GPS, parciales, récords, equipamiento.",
          "Lo que introduces: diario (sueño, frecuencia cardiaca en reposo, VFC, sensaciones, fatiga, notas), peso, FC máxima, VAM, objetivos y carreras, planes y sesiones, musculación, recorridos dibujados, productos de nutrición.",
          "Técnicamente: una cookie de sesión, la fecha de tu última visita, el navegador usado en cada sesión abierta (para que puedas reconocerlas y cerrarlas) y un registro de errores del servidor.",
        ],
      },
      {
        title: "Datos de salud",
        body: [
          "La frecuencia cardiaca, la VFC, el sueño, el peso y las sensaciones pueden revelar información sobre tu salud: son datos sensibles. Foulée solo los trata con tu consentimiento explícito, dado al crear la cuenta, y únicamente para analizar tu entrenamiento.",
          "Puedes retirar este consentimiento en cualquier momento borrando los datos en cuestión o tu cuenta.",
        ],
      },
      {
        title: "Por qué, y con qué base",
        body: [
          "Prestar el servicio que pides: análisis, predicciones, planes (ejecución del servicio, y tu consentimiento para los datos de salud).",
          "Proteger la instancia: limitación de intentos de inicio de sesión y de registro, registro de errores (interés legítimo).",
          "Nada más: sin publicidad, sin perfilado comercial, sin reventa, sin herramientas de medición de audiencia ni rastreadores de terceros.",
        ],
      },
      {
        title: "Quién tiene acceso",
        body: [
          "Solo tú. Cada cuenta solo ve sus propios datos: ninguna actividad ni recorrido se muestra a otro usuario.",
          "El administrador de la instancia ({publisher}) tiene acceso técnico al servidor y a la base de datos, y ve la lista de cuentas conectadas a Strava; no consulta tus datos salvo a petición tuya o para corregir una avería.",
          "Strava, si conectas tu cuenta: Foulée lee tu perfil y tus actividades mediante la API de Strava (solo lectura, nunca escribe); estos intercambios se rigen también por la política de privacidad de Strava.",
          "OpenStreetMap: el taller de recorridos pide a un servidor Overpass público las calles del rectángulo geográfico donde corres. Solo se envía ese rectángulo — ni tu identidad ni tus recorridos.",
          "Ninguna inteligencia artificial ni servicio de IA externo recibe tus datos.",
        ],
      },
      {
        title: "Dónde, y durante cuánto tiempo",
        body: [
          "En el servidor de la instancia: {host}.",
          "Mientras exista tu cuenta. Borrar la cuenta elimina inmediata y definitivamente todos tus datos; también desaparecen de las copias de seguridad de la base en 14 días (rotación).",
          "Desconectar Strava borra las actividades, el equipamiento y los tokens procedentes de Strava (lo que importaste o introdujiste tú se conserva). Revocar el acceso desde strava.com tiene el mismo efecto.",
          "Sesiones: 90 días como máximo. Registro de errores: 30 días. Contadores antiabuso: unas horas, en memoria, nunca escritos en disco.",
        ],
      },
      {
        title: "Seguridad",
        body: [
          "Conexión cifrada (HTTPS); contraseña cifrada con scrypt y una sal aleatoria; tokens de Strava cifrados en reposo (AES-256-GCM); la cookie de sesión solo contiene un token aleatorio, del que solo se guarda la huella; cabeceras de seguridad estrictas (CSP).",
        ],
      },
      {
        title: "Recorridos GPS",
        body: [
          "Un recorrido puede señalar tu domicilio. Por defecto, Foulée oculta en pantalla el inicio y el final de cada recorrido en un radio de 500 m (ajustable en Ajustes → Privacidad de los recorridos). Los datos guardados siguen completos para tus análisis y tu exportación.",
        ],
      },
      {
        title: "Tus derechos",
        body: [
          "Acceso y portabilidad: Ajustes → Exportar — un archivo JSON completo (y un CSV de tus actividades), en cualquier momento, sin solicitud.",
          "Rectificación: modifica tus ajustes, sesiones y diario directamente en la app.",
          "Supresión: Ajustes → Cuenta → Eliminar mi cuenta, inmediata y definitiva.",
          "Oposición, limitación, retirada del consentimiento, preguntas: {contact}. Respuesta en un plazo de un mes.",
          "Si consideras que no se respetan tus derechos, puedes presentar una reclamación ante tu autoridad de protección de datos (en España, la AEPD; en Francia, la CNIL).",
        ],
      },
      {
        title: "Cookies",
        body: [
          "Solo las imprescindibles: foulee_session (tu sesión) y NEXT_LOCALE (tu idioma). El navegador guarda además localmente tu tema, el avance de la visita guiada y algunas preferencias de visualización. Ninguna cookie publicitaria ni de medición de audiencia — por eso no hay banner.",
        ],
      },
      {
        title: "Edad",
        body: ["Foulée está dirigida a personas de 15 años o más."],
      },
      {
        title: "Cambios",
        body: [
          "Esta página puede evolucionar con la app; la fecha de actualización figura al principio. Cualquier cambio importante se anunciará en la app.",
        ],
      },
    ],
  },
};

export const LEGAL: Record<string, LegalLocale> = { fr, en, es };

export type LegalIdentity = { publisher: string; contact: string; host: string; url: string };

/** Remplace les variables {publisher}, {contact}, {host}, {url}. */
export function fillLegal(text: string, id: LegalIdentity): string {
  return text.replace(/\{(publisher|contact|host|url)\}/g, (_, k: keyof LegalIdentity) => id[k]);
}
