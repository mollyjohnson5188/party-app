import { withTransaction, queryOne } from '@/lib/db';
import { Err } from '@/lib/errors';

/**
 * 审计日志。规程要求：所有状态变更写审计日志（操作人/时间/前状态/后状态/原因/关联支付单号）。
 * 本模块刻意设计成"必须与业务写在同一个事务里"，避免业务提交了但审计丢了。
 */

export type OperatorType = 'SYSTEM' | 'HOST' | 'USER' | 'ADMIN';

export interface AuditEntry {
  entityType: 'registration' | 'guarantee_order' | 'credit_account' | 'activity' | 'appeal';
  entityId: string;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null;
  operatorType: OperatorType;
  operatorId?: string | null;
  paymentRef?: string | null;
  extra?: Record<string, unknown> | null;
}

/** 在给定事务内写审计 */
export async function auditIn(
  client: { query: (sql: string, p?: unknown[]) => Promise<unknown> },
  e: AuditEntry
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log(
       entity_type, entity_id, action, from_state, to_state, reason,
       operator_type, operator_id, payment_ref, extra
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      e.entityType,
      e.entityId,
      e.action,
      e.fromState ?? null,
      e.toState ?? null,
      e.reason ?? null,
      e.operatorType,
      e.operatorId ?? null,
      e.paymentRef ?? null,
      e.extra ? JSON.stringify(e.extra) : null,
    ]
  );
}

/** 独立事务写审计（用于非关键路径） */
export async function audit(e: AuditEntry): Promise<void> {
  await withTransaction((c) => auditIn(c, e));
}

export async function mustGet<T>(p: Promise<T | null>, err: Error): Promise<T> {
  const v = await p;
  if (v === null) throw err;
  return v;
}

export { queryOne, Err };
