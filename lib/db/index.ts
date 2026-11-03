import { Pool, PoolClient, QueryResultRow } from 'pg';

/**
 * 数据库连接。单例，避免 Next.js dev 模式热重载导致连接泄漏。
 */
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@127.0.0.1:5432/party',
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return global.__pgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * 事务助手。
 *
 * 注意：所有资金/信用写入**必须**走事务，且业务层的"唯一性判断"依赖
 * INSERT 抛 23505 后整体回滚，而不是先 SELECT 再判断。
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* 忽略回滚失败 */
    }
    throw e;
  } finally {
    client.release();
  }
}

/** PostgreSQL 唯一约束冲突 */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

/** 从唯一约束冲突里取约束名，便于区分是哪条幂等键命中了 */
export function violationConstraint(e: unknown): string | null {
  if (!isUniqueViolation(e)) return null;
  return (e as { constraint?: string }).constraint ?? null;
}
