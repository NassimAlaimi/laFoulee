# Déployer La Foulée

Architecture cible :

```
Internet ─► https://dcimer.swagman.fr (443) ─► Caddy ─► 127.0.0.1:3000 ─► Next.js
                   │  (chiffrement TLS,
                   │   certificat Let's Encrypt automatique)
```

- **Caddy** = reverse proxy HTTPS (écoute 80/443).
- **L'app** tourne sous systemd (`foulee`), sur `127.0.0.1:3000` uniquement.
- **Minecraft** reste sur son port (25565/tcp) : aucun conflit, Caddy n'y touche pas.

Fichiers de référence dans ce dépôt :

| Fichier | Destination |
|---|---|
| `deploy/Caddyfile` | `/etc/caddy/Caddyfile` |
| `deploy/foulee.service` | `/etc/systemd/system/foulee.service` |

## Prérequis

- Un enregistrement DNS **A** de `dcimer.swagman.fr` vers l'IP publique du serveur.
- Le dépôt cloné dans `/opt/foulee`, appartenant à l'utilisateur `foulee`.
- Un `.env` dans `/opt/foulee` (jamais commité — contient les clés Strava, LLM, `TOKEN_SECRET`).

## 1. Première installation (app)

```bash
sudo useradd -m foulee        # si absent
sudo chown -R foulee:foulee /opt/foulee

sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm install --frozen-lockfile'
sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm db:push'
sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm build'

sudo cp deploy/foulee.service /etc/systemd/system/foulee.service
sudo systemctl daemon-reload
sudo systemctl enable --now foulee
```

## 2. Reverse proxy HTTPS (Caddy)

```bash
# Installer Caddy (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Configurer puis recharger
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Puis dire à l'app qu'elle est derrière HTTPS — dans `/opt/foulee/.env` :

```env
NEXT_PUBLIC_APP_URL="https://dcimer.swagman.fr"
STRAVA_REDIRECT_URI="https://dcimer.swagman.fr/api/strava/callback"
```

> `NEXT_PUBLIC_APP_URL` commence par `https://` → le cookie de session reçoit le
> flag `Secure` (voir `src/lib/auth.ts`). C'est ce qui rend la session
> non interceptable.

Mettre à jour l'app Strava (https://www.strava.com/settings/api) :
`Authorization Callback Domain` = `dcimer.swagman.fr`.

Rebuilder et redémarrer :

```bash
sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm build'
sudo systemctl restart foulee
```

## 3. Firewall

Ouvrir le web, garder Minecraft, **fermer 3000** (sinon le HTTPS ne sert à rien,
l'app reste joignable en clair sur :3000) :

```bash
sudo ufw allow 22/tcp           # SSH — INDISPENSABLE, sinon tu te coupes l'accès
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 25565/tcp        # Minecraft (inchangé)
sudo ufw delete allow 3000/tcp  # si 3000 était ouvert
```

> ⚠️ **Avant** `sudo ufw enable`, vérifie que SSH est bien autorisé :
> `sudo ufw status verbose` — tu dois voir `22/tcp ALLOW` (ou `OpenSSH ALLOW`).
> Si ton SSH est sur un port non standard, autorise ce port à la place du 22.
> Sans cette règle, activer le firewall bloque tes connexions SSH.

```bash
sudo ufw enable
```

Complément : le service (`deploy/foulee.service`) force déjà
`HOSTNAME=127.0.0.1`, donc l'app n'écoute que sur localhost — le firewall est
la deuxième barrière.

## 4. Webhook Strava (une fois)

La politique API Strava impose d'effacer les données d'un athlète qui révoque
l'accès depuis strava.com (§7.4) et de refléter une activité supprimée sous
48 h (§6.3). L'app reçoit ces événements sur `/api/strava/webhook` ; il faut
déclarer l'abonnement **une seule fois**, app démarrée et joignable en HTTPS :

```bash
# 1. Dans /opt/foulee/.env : STRAVA_WEBHOOK_VERIFY_TOKEN="$(openssl rand -hex 16)"
#    puis : sudo systemctl restart foulee
# 2. Créer l'abonnement (Strava appelle aussitôt l'URL pour la valider)
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=TON_CLIENT_ID \
  -F client_secret=TON_CLIENT_SECRET \
  -F callback_url=https://dcimer.swagman.fr/api/strava/webhook \
  -F verify_token=LE_MEME_JETON
# → {"id": 123456}
# 3. Reporter cet id dans .env : STRAVA_WEBHOOK_SUBSCRIPTION_ID="123456", redémarrer.

# Vérifier / supprimer l'abonnement :
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=TON_CLIENT_ID -d client_secret=TON_CLIENT_SECRET
```

Les événements ne sont pas signés par Strava : l'app ne supprime rien sans
avoir vérifié auprès de l'API que l'accès est réellement révoqué (ou
l'activité réellement supprimée).

## 5. Sauvegardes (indispensable)

Toute l'instance tient dans **un fichier** (`/opt/foulee/prisma/dev.db`) :
disque mort ou mauvaise commande = tout perdu. `deploy/backup.sh` en fait une
copie cohérente à chaud (API de sauvegarde SQLite), vérifie son intégrité, la
compresse et garde 14 jours.

```bash
sudo apt install sqlite3
sudo install -d -o foulee -g foulee -m 700 /var/backups/foulee
sudo cp /opt/foulee/deploy/foulee-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now foulee-backup.timer

sudo systemctl start foulee-backup      # premier essai tout de suite
ls -lh /var/backups/foulee              # un foulee-AAAA-MM-JJ_HHMM.db.gz
systemctl list-timers foulee-backup     # prochaine exécution (03:30)
```

**Hors du serveur** : une sauvegarde sur le même disque ne protège pas d'une
panne de disque. Renseigne `BACKUP_REMOTE` dans `foulee-backup.service`
(rsync via SSH vers un NAS, un autre serveur…) — ou, a minima, rapatrie de
temps en temps : `rsync -a serveur:/var/backups/foulee/ ~/sauvegardes-foulee/`.

**Le `.env` aussi**, une fois, dans un gestionnaire de mots de passe :
sans `TOKEN_SECRET`, les jetons Strava de la sauvegarde sont illisibles
(les utilisateurs devraient reconnecter Strava) ; sans `AUTH_SECRET`, tout le
monde est déconnecté.

**Restaurer** (à tester une fois, avant d'en avoir besoin) :

```bash
sudo systemctl stop foulee
sudo -u foulee cp /opt/foulee/prisma/dev.db /opt/foulee/prisma/dev.db.avant-restauration
gunzip -c /var/backups/foulee/foulee-AAAA-MM-JJ_HHMM.db.gz | sudo -u foulee tee /opt/foulee/prisma/dev.db >/dev/null
sudo -u foulee rm -f /opt/foulee/prisma/dev.db-journal /opt/foulee/prisma/dev.db-wal /opt/foulee/prisma/dev.db-shm
sudo systemctl start foulee
```

## Mise à jour

```bash
sudo -u foulee -H bash -c 'cd /opt/foulee && git pull'
sudo chown -R foulee:foulee /opt/foulee

sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm install --frozen-lockfile'
sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm db:push'
sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm build'

sudo systemctl restart foulee
```

## Vérifier

```bash
sudo systemctl status foulee caddy
sudo journalctl -u foulee -f
curl -I https://dcimer.swagman.fr        # doit répondre 200/307, en HTTPS
curl -I http://dcimer.swagman.fr:3000/   # doit échouer (port fermé)
```

## Sécurité — rappels

- **Jamais de `3000` exposé** : seul Caddy (localhost) parle à l'app.
- `.env` ne doit **jamais** être commité ; les secrets sont injectés sur le
  serveur, pas dans le dépôt.
- Les clés (`LLM_API_KEY`, `STRAVA_CLIENT_SECRET`, `TOKEN_SECRET`) ne vivent que
  côté backend ; elles ne sont jamais envoyées au navigateur.
- Ne pas supprimer `/opt/foulee` : il contient `.env` et la base SQLite.
