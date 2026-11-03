import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { FakeClock } from '@/lib/clock';

/**
 * 测试基础设施：真实 PostgreSQL，每个用例前重建 schema。
 * 故意不 mock 数据库 —— 本项目的幂等保证全部落在 DB 唯一约束上。
 */

export const TEST_DSN =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5432/party_test';

let adminPool: Pool | null = null;

function admin(): Pool {
  if (!adminPool) {
    // 连到 postgres 库用于建/删测试库
    const url = new URL(TEST_DSN);
    url.pathname = '/postgres';
    adminPool = new Pool({ connectionString: url.toString(), max: 2 });
  }
  return adminPool;
}

/** 确保测试库存在（一次） */
export async function ensureDatabase(): Promise<void> {
  const name = new URL(TEST_DSN).pathname.slice(1);
  const { rows } = await admin().query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [name]
  );
  if (rows.length === 0) {
    await admin().query(`CREATE DATABASE "${name}"`);
  }
}

/** 重建 schema：删库重建，保证零残留 */
export async function resetDb(): Promise<void> {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'db/migrations/001_init.sql'),
    'utf8'
  );
  const pool = new Pool({ connectionString: TEST_DSN, max: 5 });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

export async function closeAll(): Promise<void> {
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
}

// ---------------------------------------------------------------------------
// 基线数据
// ---------------------------------------------------------------------------

export const HOST_ID = 'u_host';
export const U1 = 'u1';
export const U2 = 'u2';
export const U3 = 'u3';
export const U4 = 'u4';
export const ACTIVITY_ID = 'a1';
export const GUARANTEE = 5000; // 5000 分 = ¥50
export const T0_ISO = '2026-11-10T10:00:00+08:00';

export interface SeedOptions {
  capacity?: number;
  guaranteeMode?: 'NONE' | 'GUARANTEE';
  guaranteeAmount?: number;
  startAt?: string;
  durationMin?: number;
  minCreditScore?: number;
}

export function makeClock(startAtIso = T0_ISO): FakeClock {
  return new FakeClock(startAtIso);
}

/** 建一条活动 + 4 个用户，返回 activityId */
export async function seed(
  db: { query: (sql: string, p?: unknown[]) => Promise<{ rows: unknown[] }> },
  opts: SeedOptions = {}
): Promise<void> {
  const {
    capacity = 5,
    guaranteeMode = 'GUARANTEE',
    guaranteeAmount = guaranteeMode === 'GUARANTEE' ? GUARANTEE : 0,
    startAt = T0_ISO,
    durationMin = 180,
    minCreditScore = 0,
  } = opts;

  const users = [HOST_ID, U1, U2, U3, U4];
  for (const u of users) {
    await db.query(
      `INSERT INTO app_user(id, nickname) VALUES ($1,$2)
       ON CONFLICT (id) DO NOTHING`,
      [u, `用户${u}`]
    );
    await db.query(
      `INSERT INTO credit_account(user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [u]
    );
  }

  const start = new Date(startAt);
  const end = new Date(start.getTime() + durationMin * 60_000);

  await db.query(
    `INSERT INTO activity(
       id, host_id, title, location, start_at, end_at, capacity,
       status, guarantee_mode, guarantee_amount, min_credit_score
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PUBLISHED',$8,$9,$10)`,
    [
      ACTIVITY_ID,
      HOST_ID,
      '香山徒步',
      '香山公园东门',
      start.toISOString(),
      end.toISOString(),
      capacity,
      guaranteeMode,
      guaranteeAmount,
      minCreditScore,
    ]
  );
}

/** 直接灌一条 CONFIRMED 报名（绕过接口，用于构造中间态） */
export async function seedConfirmedRegistration(
  db: { query: (sql: string, p?: unknown[]) => Promise<{ rows: unknown[] }> },
  regId: string,
  userId: string,
  opts: { amount?: number; status?: string; checkinStatus?: string } = {}
): Promise<void> {
  const { amount = GUARANTEE, status = 'CONFIRMED', checkinStatus = 'UNUSED' } =
    opts;
  await db.query(
    `INSERT INTO registration(
       id, activity_id, user_id, host_id, registration_status,
       guarantee_mode, guarantee_amount, checkin_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      regId,
      ACTIVITY_ID,
      userId,
      HOST_ID,
      status,
      amount > 0 ? 'GUARANTEE' : 'NONE',
      amount,
      checkinStatus,
    ]
  );
}

/** 直接灌一张 HELD 保证金单 */
export async function seedHeldOrder(
  db: { query: (sql: string, p?: unknown[]) => Promise<{ rows: unknown[] }> },
  orderId: string,
  regId: string,
  amount = GUARANTEE
): Promise<void> {
  await db.query(
    `INSERT INTO guarantee_order(
       id, registration_id, amount, status, payment_channel, channel_hold_id, held_at
     ) VALUES ($1,$2,$3,'HELD','mock',$4,now())`,
    [orderId, regId, amount, `hold_${orderId}`]
  );
}
