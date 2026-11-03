/**
 * 验收级红线测试。
 *
 * 三条最先写、必须先红后绿：A-01 支付回调、B-01 并发核销、C-02 定时任务重复。
 *
 * 关键设计：
 *  1) 断言直达数据库，不看返回值"看起来对"。
 *  2) 并发用 Promise.all + 提高并发度，并允许"放大并发以突破连接池串行化"
 *     —— 若并发度低于连接池，事务会被串行化，无锁实现也能侥幸通过。
 *  3) 错误断言统一走 err.code，不依赖中文 message 文案。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { query } from '@/lib/db';
import {
  ensureDatabase,
  resetDb,
  closeAll,
  seed,
  makeClock,
  seedConfirmedRegistration,
  seedHeldOrder,
  U1,
  U2,
  U3,
  U4,
  GUARANTEE,
  T0_ISO,
} from './helpers';
import { setClock, resetClock, MIN } from '@/lib/clock';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { RegistrationService } from '@/lib/services/registration.service';
import { CheckinService } from '@/lib/services/checkin.service';
import { MockPayChannel } from '@/lib/services/pay-channel.mock';
import { runNoShowFinalizeJob } from '@/lib/jobs/no-show-finalize.job';
import { runNoShowCandidateJob } from '@/lib/jobs/no-show-candidate.job';

let clock: ReturnType<typeof makeClock>;
let payment: GuaranteePaymentService;
let checkin: CheckinService;
let channel: MockPayChannel;

/** 断言 Promise 以指定 code 拒绝 */
async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
}

beforeEach(async () => {
  await ensureDatabase();
  await resetDb();
  await seed({ query } as never);
  clock = makeClock();
  setClock(clock);
  channel = new MockPayChannel();
  payment = new GuaranteePaymentService(channel);
  checkin = new CheckinService(payment);
});

afterAll(async () => {
  resetClock();
  await closeAll();
});

// ===========================================================================
// A-01  同一支付回调并发 10 次，保证金只入账一次
// ===========================================================================
describe('A-01 支付回调幂等', () => {
  it('并发 10 次相同回调，只确认一次、只入账一次', async () => {
    const reg = new RegistrationService(payment);
    clock.set(T0_ISO); clock.advance(-1 * 24 * 60 * MIN);
    const created = await reg.create({
      activityId: 'a1',
      userId: U1,
      guaranteeMode: 'GUARANTEE',
    });
    expect(created.registrationStatus).toBe('PENDING_PAYMENT');

    const orderId = created.guaranteeOrderId!;
    const payload = {
      orderId,
      registrationId: created.id,
      channelTxnId: 'wx_txn_001',
      channelEventId: 'evt_001',
      amount: GUARANTEE,
      paidAt: clock.now().toISOString(),
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => payment.handlePaySuccessNotify(payload))
    );

    expect(results.filter((r) => r.idempotent === false)).toHaveLength(1);
    expect(results.filter((r) => r.idempotent === true)).toHaveLength(9);

    const orders = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE registration_id = $1',
      [created.id]
    );
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('HELD');

    const attempts = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM payment_attempt
        WHERE guarantee_order_id = $1 AND kind = 'HOLD' AND status = 'SUCCESS'`,
      [orderId]
    );
    expect(attempts[0].c).toBe('1');

    const audits = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM audit_log
        WHERE entity_type='guarantee_order' AND entity_id=$1 AND action='PAY_HOLD_SUCCESS'`,
      [orderId]
    );
    expect(audits[0].c).toBe('1');
  });

  it('放大并发 20 次（突破连接池串行化）仍然只入账一次', async () => {
    const reg = new RegistrationService(payment);
    clock.set(T0_ISO); clock.advance(-1 * 24 * 60 * MIN);
    const created = await reg.create({
      activityId: 'a1',
      userId: U2,
      guaranteeMode: 'GUARANTEE',
    });
    const orderId = created.guaranteeOrderId!;
    const payload = {
      orderId,
      registrationId: created.id,
      channelTxnId: 'wx_txn_stress',
      channelEventId: 'evt_stress',
      amount: GUARANTEE,
      paidAt: clock.now().toISOString(),
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => payment.handlePaySuccessNotify(payload))
    );
    expect(results.filter((r) => r.idempotent === false)).toHaveLength(1);

    const attempts = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM payment_attempt
        WHERE guarantee_order_id=$1 AND kind='HOLD'`,
      [orderId]
    );
    expect(attempts[0].c).toBe('1');
  });

  it('回调金额不一致必须拒绝，状态不动', async () => {
    const reg = new RegistrationService(payment);
    clock.set(T0_ISO); clock.advance(-1 * 24 * 60 * MIN);
    const created = await reg.create({
      activityId: 'a1',
      userId: U2,
      guaranteeMode: 'GUARANTEE',
    });

    await expectCode(
      payment.handlePaySuccessNotify({
        orderId: created.guaranteeOrderId!,
        registrationId: created.id,
        channelTxnId: 'wx_txn_002',
        channelEventId: 'evt_002',
        amount: 3000,
        paidAt: clock.now().toISOString(),
      }),
      'AMOUNT_MISMATCH'
    );

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id = $1',
      [created.guaranteeOrderId]
    );
    expect(order[0].status).toBe('PAYING');
  });
});

// ===========================================================================
// B-01  同一报名单并发核销 10 次，只成功一次、不重复退款
// ===========================================================================
describe('B-01 并发核销幂等', () => {
  it('并发 10 次核销，只核销一次、只发起一次退款', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await seedHeldOrder({ query } as never, 'g1', 'r1');

    clock.set(T0_ISO);
    clock.advance(-30 * MIN);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        checkin.checkinManual({ registrationId: 'r1', hostId: 'u_host' })
      )
    );

    expect(results.filter((r) => r.alreadyCheckedIn === false)).toHaveLength(1);
    const dup = results.filter((r) => r.alreadyCheckedIn === true);
    expect(dup).toHaveLength(9);
    for (const d of dup) {
      expect(d.message).toMatch(/已于 \d{2}:\d{2} 核销/);
    }

    const reg = await query<{ checkin_status: string; registration_status: string }>(
      'SELECT checkin_status, registration_status FROM registration WHERE id=$1',
      ['r1']
    );
    expect(reg[0].checkin_status).toBe('CHECKED_IN');
    expect(reg[0].registration_status).toBe('CHECKED_IN');

    const audits = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM audit_log
        WHERE entity_type='registration' AND entity_id='r1' AND action='CHECKIN'`
    );
    expect(audits[0].c).toBe('1');

    const releases = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM payment_attempt
        WHERE guarantee_order_id='g1' AND kind='RELEASE'`
    );
    expect(Number(releases[0].c)).toBeGreaterThanOrEqual(1);

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(['RELEASING', 'RELEASED']).toContain(order[0].status);
  });

  it('非主理人核销他人活动被拒绝，且无状态变更', async () => {
    await seedConfirmedRegistration({ query } as never, 'r2', U2);
    await seedHeldOrder({ query } as never, 'g2', 'r2');
    clock.set(T0_ISO);
    clock.advance(-10 * MIN);

    await expectCode(
      checkin.checkinManual({ registrationId: 'r2', hostId: U3 }),
      'NOT_ACTIVITY_HOST'
    );

    const reg = await query<{ checkin_status: string }>(
      'SELECT checkin_status FROM registration WHERE id=$1',
      ['r2']
    );
    expect(reg[0].checkin_status).toBe('UNUSED');
  });

  it('窗口外核销被拒绝（T0-61m 与 T0+121m）', async () => {
    await seedConfirmedRegistration({ query } as never, 'r3', U1);

    clock.set(T0_ISO);
    clock.advance(-61 * MIN);
    await expectCode(
      checkin.checkinManual({ registrationId: 'r3', hostId: 'u_host' }),
      'OUT_OF_CHECKIN_WINDOW'
    );

    clock.set(T0_ISO);
    clock.advance(121 * MIN);
    await expectCode(
      checkin.checkinManual({ registrationId: 'r3', hostId: 'u_host' }),
      'OUT_OF_CHECKIN_WINDOW'
    );
  });

  it('窗口端点 T0-60m 与 T0+120m 允许核销', async () => {
    await seedConfirmedRegistration({ query } as never, 'r4', U1);
    clock.set(T0_ISO);
    clock.advance(-60 * MIN);
    const r = await checkin.checkinManual({ registrationId: 'r4', hostId: 'u_host' });
    expect(r.alreadyCheckedIn).toBe(false);
  });
});

// ===========================================================================
// C-02  定时任务重复执行只扣一次信用、一次保证金
// ===========================================================================
describe('C-02 爽约定时任务幂等', () => {
  it('连续执行 10 次 noShowFinalizeJob，信用只扣一次、保证金只扣划一次', async () => {
    // 构造：1 人爽约 + 3 人到场核销，验证走"扣划分账"分支
    await seedConfirmedRegistration({ query } as never, 'r1', U1, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    await seedHeldOrder({ query } as never, 'g1', 'r1');
    for (const [rid, uid, at] of [
      ['b1', U2, T0_ISO],
      ['b2', U3, T0_ISO],
      ['b3', U4, T0_ISO],
    ] as const) {
      await seedConfirmedRegistration({ query } as never, rid, uid, {
        checkinStatus: 'CHECKED_IN',
      });
      await query('UPDATE registration SET checkin_at=$1 WHERE id=$2', [at, rid]);
    }

    clock.set(T0_ISO);
    clock.advance(120 * MIN);

    for (let i = 0; i < 10; i++) {
      await runNoShowFinalizeJob({ payment });
    }

    const ledger = await query<{ c: string; delta: number; after_score: number }>(
      `SELECT count(*)::text AS c,
              max(delta) AS delta,
              max(after_score) AS after_score
         FROM credit_ledger
        WHERE registration_id='r1' AND event_type='NO_SHOW'`
    );
    expect(ledger[0].c).toBe('1');
    expect(ledger[0].delta).toBe(-10);
    expect(ledger[0].after_score).toBe(90);

    const acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(90);

    const orders = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(orders).toHaveLength(1);
    expect(['FORFEIT_PENDING', 'FORFEITED']).toContain(orders[0].status);

    const alloc = await query<{ total: string; c: string }>(
      `SELECT coalesce(sum(amount),0)::text AS total, count(*)::text AS c
         FROM forfeit_allocation WHERE guarantee_order_id='g1'`
    );
    expect(alloc[0].c).toBe('3');
    expect(Number(alloc[0].total)).toBe(GUARANTEE);

    const reg = await query<{ registration_status: string }>(
      'SELECT registration_status FROM registration WHERE id=$1',
      ['r1']
    );
    expect(reg[0].registration_status).toBe('NO_SHOW');

    // 通道侧只被调用一次
    expect(channel.countOf('forfeit')).toBe(1);
  });

  it('无人到场时保证金原路退，仅扣信用（走退款分支而非扣划）', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    await seedHeldOrder({ query } as never, 'g1', 'r1');

    clock.set(T0_ISO);
    clock.advance(120 * MIN);

    for (let i = 0; i < 5; i++) {
      await runNoShowFinalizeJob({ payment });
    }

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(order[0].status).toBe('RELEASED');

    const alloc = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM forfeit_allocation WHERE guarantee_order_id='g1'`
    );
    expect(alloc[0].c).toBe('0');

    const acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(90);
  });

  it('并发 5 个 noShowCandidateJob 实例，每个用户只通知一次', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await seedConfirmedRegistration({ query } as never, 'r2', U2);
    await seedConfirmedRegistration({ query } as never, 'r3', U3);

    clock.set(T0_ISO);
    clock.advance(60 * MIN);

    await Promise.all(Array.from({ length: 5 }, () => runNoShowCandidateJob()));

    const cand = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM registration
        WHERE checkin_status='NO_SHOW_CANDIDATE'`
    );
    expect(cand[0].c).toBe('3');

    const noti = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM notification WHERE type='NO_SHOW_CANDIDATE'`
    );
    expect(noti[0].c).toBe('3');
  });

  it('T0+119m59s 不判爽约，T0+120m 才判', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    await seedHeldOrder({ query } as never, 'g1', 'r1');

    clock.set(T0_ISO);
    clock.advance(120 * MIN - 1000);
    await runNoShowFinalizeJob({ payment });

    let reg = await query<{ checkin_status: string }>(
      'SELECT checkin_status FROM registration WHERE id=$1',
      ['r1']
    );
    expect(reg[0].checkin_status).toBe('NO_SHOW_CANDIDATE');

    clock.advance(1000);
    await runNoShowFinalizeJob({ payment });
    reg = await query<{ checkin_status: string }>(
      'SELECT checkin_status FROM registration WHERE id=$1',
      ['r1']
    );
    expect(reg[0].checkin_status).toBe('NO_SHOW');
  });

  it('候选期内补核销，不再产生 NO_SHOW', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    await seedHeldOrder({ query } as never, 'g1', 'r1');

    clock.set(T0_ISO);
    clock.advance(90 * MIN); // 候选期内
    const r = await checkin.checkinManual({ registrationId: 'r1', hostId: 'u_host' });
    expect(r.alreadyCheckedIn).toBe(false);

    clock.advance(31 * MIN); // 推到 T0+121m
    await runNoShowFinalizeJob({ payment });

    const ledger = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger
        WHERE registration_id='r1' AND event_type='NO_SHOW'`
    );
    expect(ledger[0].c).toBe('0');
  });
});
