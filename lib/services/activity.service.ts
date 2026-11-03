/**
 * 活动服务：主理人取消 / 系统取消。
 *
 * 规程要点：
 *  - 活动延期不支持改时间，必须取消原活动 + 重新发布
 *  - 取消后所有 HELD 保证金全额原路退
 *  - 不扣任何参与者信用分
 *  - 主理人取消率记录，MVP 不扣主理人信用分
 */
import { withTransaction, query } from '@/lib/db';
import { Err } from '@/lib/errors';
import { getClock } from '@/lib/clock';
import { auditIn } from '@/lib/services/audit.service';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';

export interface CancelActivityResult {
  cancelled: boolean;
  affectedRegistrations: number;
  refundsTriggered: number;
  /** 主理人累计取消率，仅展示 */
  hostCancelRate: number | null;
}

export class ActivityService {
  constructor(private readonly payment?: GuaranteePaymentService) {}

  private get pmt(): GuaranteePaymentService {
    return this.payment ?? new GuaranteePaymentService(getDefaultChannel());
  }

  async cancel(input: {
    activityId: string;
    operatorId: string;
    operatorType: 'HOST' | 'SYSTEM';
    reason: string;
  }): Promise<CancelActivityResult> {
    const now = getClock().now();

    const result = await withTransaction(async (c) => {
      const act = (
        await c.query<{ id: string; host_id: string; status: string }>(
          'SELECT id, host_id, status FROM activity WHERE id=$1 FOR UPDATE',
          [input.activityId]
        )
      ).rows[0];
      if (!act) throw Err.activityNotFound(input.activityId);

      if (input.operatorType === 'HOST' && act.host_id !== input.operatorId) {
        throw Err.notActorHost();
      }
      if (act.status === 'CANCELLED') {
        return { cancelled: false, affectedRegistrations: 0, regIds: [] as string[] };
      }

      await c.query(
        `UPDATE activity
            SET status='CANCELLED', cancelled_at=$1, cancel_reason=$2, updated_at=now()
          WHERE id=$3`,
        [now.toISOString(), input.reason, input.activityId]
      );

      // 批量把有效报名置为取消态
      const targetStatus =
        input.operatorType === 'HOST' ? 'CANCELLED_BY_HOST' : 'CANCELLED_BY_SYSTEM';

      const moved = await c.query<{ id: string }>(
        `UPDATE registration
            SET registration_status=$1,
                cancelled_at=$2,
                cancel_reason=$3,
                updated_at=now()
          WHERE activity_id=$4
            AND registration_status IN ('PENDING_PAYMENT','CONFIRMED')
          RETURNING id`,
        [targetStatus, now.toISOString(), input.reason, input.activityId]
      );

      // 已核销的人不因活动取消而回退（他们确实到场了）
      await auditIn(c, {
        entityType: 'activity',
        entityId: input.activityId,
        action: 'CANCEL_ACTIVITY',
        fromState: act.status,
        toState: 'CANCELLED',
        reason: input.reason,
        operatorType: input.operatorType,
        operatorId: input.operatorId,
        extra: { affected: moved.rowCount },
      });

      for (const r of moved.rows) {
        await auditIn(c, {
          entityType: 'registration',
          entityId: r.id,
          action: 'CANCEL_BY_ACTIVITY',
          toState: targetStatus,
          reason: input.reason,
          operatorType: input.operatorType,
          operatorId: input.operatorId,
        });
      }

      return {
        cancelled: true,
        affectedRegistrations: moved.rowCount ?? 0,
        regIds: moved.rows.map((r) => r.id),
      };
    });

    if (!result.cancelled) {
      const rate = await this.hostCancelRate(
        (await query<{ host_id: string }>('SELECT host_id FROM activity WHERE id=$1', [
          input.activityId,
        ]))[0].host_id
      );
      return {
        cancelled: false,
        affectedRegistrations: 0,
        refundsTriggered: 0,
        hostCancelRate: rate,
      };
    }

    // 事务外批量退款：逐单独立事务，单笔失败不影响其他
    let refunds = 0;
    for (const regId of result.regIds) {
      const orders = await query<{ id: string }>(
        'SELECT id FROM guarantee_order WHERE registration_id=$1',
        [regId]
      );
      for (const o of orders) {
        try {
          const r = await this.pmt.releaseOrder(o.id, 'ACTIVITY_CANCEL', input.operatorId);
          if (r.released || r.alreadyDone) refunds += 1;
        } catch (e) {
          console.error('[activity.cancel] 退款失败', o.id, e);
        }
      }
    }

    const hostId = (
      await query<{ host_id: string }>('SELECT host_id FROM activity WHERE id=$1', [
        input.activityId,
      ])
    )[0].host_id;

    return {
      cancelled: true,
      affectedRegistrations: result.affectedRegistrations,
      refundsTriggered: refunds,
      hostCancelRate: await this.hostCancelRate(hostId),
    };
  }

  /** 主理人取消率 = 取消活动数 / 总活动数（仅展示，不扣分） */
  async hostCancelRate(hostId: string): Promise<number | null> {
    const row = (
      await query<{ total: string; cancelled: string }>(
        `SELECT count(*)::text AS total,
                count(*) FILTER (WHERE status='CANCELLED')::text AS cancelled
           FROM activity WHERE host_id=$1`,
        [hostId]
      )
    )[0];
    const total = Number(row?.total ?? 0);
    if (total === 0) return null;
    return Math.round((Number(row?.cancelled ?? 0) / total) * 1000) / 1000;
  }
}
