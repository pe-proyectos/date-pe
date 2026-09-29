import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

// Pool "admin": conecta como owner (bypassa RLS). Para migraciones y el
// registro global de tenants / búsquedas cross-tenant controladas.
export const adminPool = new Pool({ connectionString: env.databaseUrl, max: 5 });

// Pool "app": conecta como datepe_app (RLS SÍ aplica). Para todo lo scoped
// a un tenant y para lecturas públicas controladas.
export const appPool = new Pool({ connectionString: env.databaseAppUrl, max: 10 });

export type Sql = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<pg.QueryResult<T>>;

/**
 * Ejecuta una función con el contexto de un tenant fijado (RLS lo filtra).
 * Todo corre en una transacción con SET LOCAL app.tenant_id.
 */
export async function withTenant<R>(
  tenantId: string,
  fn: (sql: Sql) => Promise<R>,
): Promise<R> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const sql: Sql = (text, params) => client.query(text, params as unknown[]);
    const result = await fn(sql);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lecturas públicas cross-tenant (búsqueda, página pública de reserva).
 * Habilita solo SELECT sobre tablas marcadas public_ro.
 */
export async function withPublicRead<R>(fn: (sql: Sql) => Promise<R>): Promise<R> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.public_read', 'on', true)");
    const sql: Sql = (text, params) => client.query(text, params as unknown[]);
    const result = await fn(sql);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Query directa con el pool admin (owner). Usar solo para tareas de plataforma. */
export const admin: Sql = (text, params) => adminPool.query(text, params as unknown[]);
