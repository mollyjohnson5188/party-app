/**
 * 信用分服务。
 *
 * 铁律：
 *  1. 先 INSERT credit_ledger（唯一键判重），再 UPDATE credit_account，同一事务。
 *  2. delta 记实际生效值，nominal_delta 记规则名义值 —— 保证
 *     score = 100 + sum(delta) 恒成立（DDL 有 ck_cl_math 兜底）。
 *  3. 唯一约束冲突 = 已处理，返回 alreadyProcessed，不重复加减。
 */
import { PoolClient } from 'pg';
import { withTransaction, queryOne, query, isUniqueViolation } from '@/lib/db';
import { newId } from '@/lib/id';

export type CreditEvent =
  | 'INIT'
  | 'CHECK_IN'
  | 'NO_SHOW'
  | 'LATE_CANCEL'
  | 'APPEAL_REVERT'
  | 'ADMIN_ADJUST';

export const NOMINAL: Record<CreditEvent, number> = {
  INIT: 100,
  CHECK_IN: 1,
  NO_SHOW: -10,
  LATE_CANCEL: -2,
  APPEAL_REVERT: 10,
  ADMIN_ADJUST: 0,
};

export const SCORE_MIN = 0;
export const SCORE_MAX = 120;
export const SCORE_BASE = 100;

export interface CreditChangeResult {
  alreadyProcessed: boolean;
  before: number;
  after: number;
  delta: number;
}

function clamp(v: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, v));
}

export class CreditService {
  /**
   * 记一笔信用变动。
   * @param nominalDelta 名义变动值；不传则用规则表默认值
   */
  async apply(
    registrationId: string | null,
    userId: string,
    event: CreditEvent,
    opts: {
      nominalDelta?: number;
      reason?: string;
      operator?: string;
    } = {}
  ): Promise<CreditChangeResult> {
    const nominal = opts.nominalDelta ?? NOMINAL[event];
    return withTransaction((c) =>
      this.applyIn(c, registrationId, userId, event, nominal, opts.reason ?? null, opts.operator ?? 'SYSTEM')
    );
  }

  /** 事务内版本，供定时任务与核销流程复用，保证与其他写入同事务 */
  async applyIn(
    c: PoolClient,
    registrationId: string | null,
    userId: string,
    event: CreditEvent,
    nominalDelta: number,
    reason: string | null,
    operator: string
  ): Promise<CreditChangeResult> {
    // 锁定账户行，串行化同一用户的并发变动
    const acct = (
      await c.query<{ score: number }>(
        'SELECT score FROM credit_account WHERE user_id=$1 FOR UPDATE',
        [userId]
      )
    ).rows[0];

    const before = acct ? acct.score : SCORE_BASE;
    const after = clamp(before + nominalDelta);
    const actual = after - before;

    try {
      await c.query(
        `INSERT INTO credit_ledger(
           id, user_id, registration_id, event_type,
           delta, nominal_delta, before_score, after_score, reason, operator
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          newId('cl'),
          userId,
          registrationId,
          event,
          actual,
          nominalDelta,
          before,
          after,
          reason,
          operator,
        ]
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        return { alreadyProcessed: true, before, after: before, delta: 0 };
      }
      throw e;
    }

    await c.query(
      `INSERT INTO credit_account(user_id, score, level, updated_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (user_id) DO UPDATE
         SET score = EXCLUDED.score, level = EXCLUDED.level, updated_at = now()`,
      [userId, after, levelOf(after)]
    );

    return { alreadyProcessed: false, before, after, delta: actual };
  }

  /** 查询用户信用视图 */
  async getMe(userId: string): Promise<{
    score: number;
    level: string;
    checkinCount: number;
    noShowCount: number;
    lateCancelCount: number;
  }> {
    const acct = await queryOne<{ score: number; level: string }>(
      'SELECT score, level FROM credit_account WHERE user_id=$1',
      [userId]
    );
    const counts = await queryOne<{ checkin: string; noshow: string; late: string }>(
      `SELECT
         count(*) FILTER (WHERE event_type='CHECK_IN')::text AS checkin,
         count(*) FILTER (WHERE event_type='NO_SHOW')::text AS noshow,
         count(*) FILTER (WHERE event_type='LATE_CANCEL')::text AS late
       FROM credit_ledger WHERE user_id=$1`,
      [userId]
    );
    return {
      score: acct?.score ?? SCORE_BASE,
      level: acct?.level ?? levelOf(SCORE_BASE),
      checkinCount: Number(counts?.checkin ?? 0),
      noShowCount: Number(counts?.noshow ?? 0),
      lateCancelCount: Number(counts?.late ?? 0),
    };
  }

  /** 对账：账户分 vs 流水汇总，返回不一致的用户 */
  async reconcile(): Promise<{ userId: string; account: number; computed: number }[]> {
    const diff = await query<{ user_id: string; account: number; computed: string }>(
      `SELECT a.user_id, a.score AS account,
              ($1 + COALESCE(SUM(l.delta),0))::text AS computed
         FROM credit_account a
         LEFT JOIN credit_ledger l ON l.user_id = a.user_id AND l.event_type <> 'INIT'
        GROUP BY a.user_id, a.score
       HAVING a.score <> ($1 + COALESCE(SUM(l.delta),0))`,
      [SCORE_BASE]
    );
    return diff.map((d) => ({
      userId: d.user_id,
      account: Number(d.account),
      computed: Number(d.computed),
    }));
  }
}

export function levelOf(score: number): 'EXCELLENT' | 'NORMAL' | 'LIMITED' {
  if (score >= 100) return 'EXCELLENT';
  if (score >= 80) return 'NORMAL';
  return 'LIMITED';
}
