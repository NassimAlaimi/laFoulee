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
