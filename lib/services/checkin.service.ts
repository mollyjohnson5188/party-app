/**
 * 核销服务。
 *
 * 并发安全的唯一手法：
 *   UPDATE registration
 *      SET checkin_status='CHECKED_IN', ...
 *    WHERE id=$1 AND checkin_status IN ('UNUSED','NO_SHOW_CANDIDATE')
 *  用 rowCount 裁决谁核销成功。rowCount=0 即"别人已核销"，走幂等分支。
 * 绝不先 SELECT 再 if。
 */
import { withTransaction, queryOne } from '@/lib/db';
import { Err } from '@/lib/errors';
import {
  getClock,
  isWithinCheckinWindow,
  CHECKIN_OPEN_BEFORE,
  CHECKIN_CLOSE_AFTER,
} from '@/lib/clock';
import { auditIn } from './audit.service';
import { GuaranteePaymentService } from './guarantee-payment.service';
import { verifyCheckinToken } from '@/lib/checkin-code';

export interface CheckinResult {
  alreadyCheckedIn: boolean;
  message: string;
  checkinAt?: string;
  registrationId: string;
}

interface RegRow {
  id: string;
  activity_id: string;
  user_id: string;
  host_id: string;
  registration_status: string;
  checkin_status: string;
  checkin_at: string | null;
}

function fmtHHmm(d: Date): string {
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  });
}

export class CheckinService {
  constructor(private readonly payment: GuaranteePaymentService) {}

  /** 手动核销（主理人二次确认后） */
  async checkinManual(input: {
    registrationId: string;
    hostId: string;
  }): Promise<CheckinResult> {
    const reg = await queryOne<RegRow>('SELECT * FROM registration WHERE id=$1', [
      input.registrationId,
    ]);
    if (!reg) throw Err.registrationNotFound(input.registrationId);
    if (reg.host_id !== input.hostId) throw Err.notActivityHost();

    return this.doCheckin(reg, input.hostId, 'MANUAL');
  }

  /** 扫码核销 */
  async checkinScan(input: {
    activityId: string;
    hostId: string;
    token: string;
  }): Promise<CheckinResult> {
    // 先验签与过期校验，再做业务校验 —— 过期 token 应直接报 TOKEN_EXPIRED，
    // 而不是被窗口/活动状态错误掩盖。
    const verified = verifyCheckinToken(input.token, getClock().now());
    if (!verified.ok) {
      throw verified.reason === 'EXPIRED' ? Err.tokenExpired() : Err.tokenInvalid();
    }
    if (verified.activityId !== input.activityId) throw Err.tokenInvalid();

    const act = await queryOne<{
      id: string;
      host_id: string;
      start_at: Date;
      status: string;
      cancelled_at: Date | null;
    }>('SELECT id, host_id, start_at, status, cancelled_at FROM activity WHERE id=$1', [
      input.activityId,
    ]);
    if (!act) throw Err.activityNotFound(input.activityId);
    if (act.host_id !== input.hostId) throw Err.notActivityHost();
    if (act.status === 'CANCELLED') throw Err.activityCancelled();

    const reg = await queryOne<RegRow>('SELECT * FROM registration WHERE id=$1', [
      verified.registrationId,
    ]);
    if (!reg) throw Err.registrationNotFound(verified.registrationId);
    if (reg.host_id !== input.hostId) throw Err.notActivityHost();

    return this.doCheckin(reg, input.hostId, 'SCAN');
  }

  private async doCheckin(
    reg: RegRow,
    hostId: string,
    mode: 'SCAN' | 'MANUAL'
  ): Promise<CheckinResult> {
    const now = getClock().now();

    // 活动状态与时间窗口校验
    const act = await queryOne<{
      start_at: Date;
      status: string;
    }>('SELECT start_at, status FROM activity WHERE id=$1', [reg.activity_id]);

    if (!act) throw Err.activityNotFound(reg.activity_id);
    if (act.status === 'CANCELLED') throw Err.activityCancelled();

    const startAt = new Date(act.start_at);
    if (!isWithinCheckinWindow(now, startAt)) {
      const open = new Date(startAt.getTime() - CHECKIN_OPEN_BEFORE);
      const close = new Date(startAt.getTime() + CHECKIN_CLOSE_AFTER);
      throw Err.outOfWindow(fmtHHmm(open), fmtHHmm(close));
    }

    const result = await withTransaction(async (c) => {
      // CAS：谁把行从"未核销"推到"已核销"，谁就是核销者
      const moved = await c.query(
        `UPDATE registration
            SET checkin_status='CHECKED_IN',
                registration_status='CHECKED_IN',
                checkin_at=$1,
                checkin_by=$2,
                updated_at=now()
          WHERE id=$3
            AND checkin_status IN ('UNUSED','NO_SHOW_CANDIDATE')
            AND registration_status IN ('CONFIRMED','NO_SHOW')
          RETURNING checkin_at`,
        [now.toISOString(), hostId, reg.id]
      );

      if (moved.rowCount === 0) {
        // 幂等分支：读实际核销时间
        const cur = await queryOne<{ checkin_at: string | null; checkin_status: string }>(
          'SELECT checkin_at, checkin_status FROM registration WHERE id=$1',
          [reg.id]
        );
        const at = cur?.checkin_at ? new Date(cur.checkin_at) : now;
        return {
          alreadyCheckedIn: true,
          message:
            cur?.checkin_status === 'CHECKED_IN'
              ? `该用户已于 ${fmtHHmm(at)} 核销`
              : '当前状态不可核销',
          registrationId: reg.id,
        } as CheckinResult;
      }

      await auditIn(c, {
        entityType: 'registration',
        entityId: reg.id,
        action: 'CHECKIN',
        fromState: reg.checkin_status,
        toState: 'CHECKED_IN',
        reason: mode,
        operatorType: 'HOST',
        operatorId: hostId,
        extra: { mode },
      });

      return {
        alreadyCheckedIn: false,
        message: '核销成功',
        checkinAt: now.toISOString(),
        registrationId: reg.id,
      } as CheckinResult;
    });

    // 核销成功才触发退款；退款失败不阻塞核销响应
    if (!result.alreadyCheckedIn) {
      try {
        await this.payment.releaseOnCheckin(reg.id, hostId);
      } catch (e) {
        console.error('[checkin] 触发退款异常', e);
      }
    }

    return result;
  }
}
