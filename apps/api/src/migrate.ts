import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminPool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../../db/schema.sql');

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(schemaPath, 'utf8');
  await adminPool.query(sql);
}

// Ejecutable directo: `pnpm --filter @datepe/api migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('Esquema aplicado');
      return adminPool.end();
    })
    .catch((err) => {
      console.error('Error migrando:', err);
      process.exit(1);
    });
}
