# Deploy Foulée

## Première installation

```bash
sudo chown -R foulee:foulee /opt/foulee

sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm install --frozen-lockfile'
sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm db:push'
sudo -u foulee -H bash -c 'cd /opt/foulee && pnpm build'

sudo systemctl enable foulee
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
sudo systemctl status foulee
```

Logs :

```bash
sudo journalctl -u foulee -f
```

Test local :

```bash
curl http://127.0.0.1:3000
```

## Important

Ne pas supprimer `/opt/foulee` : il contient notamment `.env` et la base SQLite.
