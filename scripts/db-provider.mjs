// Aligne le `provider` du schéma Prisma sur la variable DATABASE_PROVIDER.
//
// Prisma refuse env() dans le provider d'une datasource : le seul moyen de
// garder un dépôt qui tourne en SQLite en local et en Postgres en déploiement
// est de réécrire cette ligne avant chaque generate / push.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SUPPORTED = ["sqlite", "postgresql", "mysql"];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "prisma", "schema.prisma");

// .env n'est pas chargé par node : lecture minimale, sans dépendance.
function envFromFile() {
  try {
    const out = {};
    for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const wanted = (process.env.DATABASE_PROVIDER || envFromFile().DATABASE_PROVIDER || "sqlite").trim();
if (!SUPPORTED.includes(wanted)) {
  console.error(`DATABASE_PROVIDER="${wanted}" non supporté (${SUPPORTED.join(", ")})`);
  process.exit(1);
}

const schema = readFileSync(schemaPath, "utf8");
const current = schema.match(/datasource db \{\s*\n\s*provider\s*=\s*"([^"]+)"/)?.[1];
if (current === wanted) process.exit(0);

writeFileSync(
  schemaPath,
  schema.replace(
    /(datasource db \{\s*\n\s*provider\s*=\s*)"[^"]+"/,
    `$1"${wanted}"`
  )
);
console.log(`Prisma datasource : ${current} → ${wanted}`);
