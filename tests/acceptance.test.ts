/**
 * 验收标准 3/4/6/7/8/9/10 的测试。
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
import { setClock, resetClock, MIN, HOUR } from '@/lib/clock';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { RegistrationService } from '@/lib/services/registration.service';
import { CheckinService } from '@/lib/services/checkin.service';
import { ActivityService } from '@/lib/services/activity.service';
import { AppealService } from '@/lib/services/appeal.service';
import { CreditService } from '@/lib/services/credit.service';
import { MockPayChannel } from '@/lib/services/pay-channel.mock';
import { runNoShowCandidateJob } from '@/lib/jobs/no-show-candidate.job';
import { runNoShowFinalizeJob } from '@/lib/jobs/no-show-finalize.job';
import { runCreditSettleJob } from '@/lib/jobs/credit-settle.job';
import { runPaymentRetryJob } from '@/lib/jobs/payment-retry.job';
import { splitForfeit } from '@/lib/domain/forfeit-split';

let clock: ReturnType<typeof makeClock>;
let channel: MockPayChannel;
let payment: GuaranteePaymentService;

async function expectCode(p: Promise<unknown>, code: string) {
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
});

afterAll(async () => {
  resetClock();
  await closeAll();
});

// ===========================================================================
// D 组：退款
// ===========================================================================
describe('D 退款', () => {
  it('D-01 核销后立即发起退款，金额全额、原路', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await seedHeldOrder({ query } as never, 'g1', 'r1');
    clock.set(T0_ISO);
    clock.advance(-20 * MIN);

    const checkin = new CheckinService(payment);
    await checkin.checkinManual({ registrationId: 'r1', hostId: 'u_host' });

    const order = await query<{ status: string; released_at: string | null }>(
      'SELECT status, released_at FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(order[0].status).toBe('RELEASED');
    expect(order[0].released_at).not.toBeNull();

    const attempt = await query<{ amount: number }>(
      `SELECT amount FROM payment_attempt
        WHERE guarantee_order_id='g1' AND kind='RELEASE' AND status='SUCCESS'`
    );
    expect(attempt).toHaveLength(1);
    expect(attempt[0].amount).toBe(GUARANTEE);
  });

  it('D-02 退款失败重试 6 次后置 FAILED 并告警，报名状态不被污染', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await seedHeldOrder({ query } as never, 'g1', 'r1');
    clock.set(T0_ISO);
    clock.advance(-20 * MIN);

    channel.failReleaseTimes = 100;

    const checkin = new CheckinService(payment);
    await checkin.checkinManual({ registrationId: 'r1', hostId: 'u_host' });

    let order = await query<{ status: string; retry_count: number }>(
      'SELECT status, retry_count FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(['RELEASING', 'FAILED']).toContain(order[0].status);
    expect(order[0].retry_count).toBe(1);

    const alerts: string[] = [];
    for (let i = 0; i < 6; i++) {
      clock.advance(11 * MIN);
      await runPaymentRetryJob({
        payment,
        onAlert: (m) => {
          alerts.push(m);
        },
      });
    }

    order = await query<{ status: string; retry_count: number }>(
      'SELECT status, retry_count FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(order[0].status).toBe('FAILED');
    expect(order[0].retry_count).toBe(6);
    expect(alerts.length).toBeGreaterThan(0);

    // 已核销状态不受退款失败影响
    const reg = await query<{ registration_status: string }>(
      'SELECT registration_status FROM registration WHERE id=$1',
      ['r1']
    );
    expect(reg[0].registration_status).toBe('CHECKED_IN');
  });

  it('D-03 重试中途成功即停止', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await seedHeldOrder({ query } as never, 'g1', 'r1');
    clock.set(T0_ISO);
    clock.advance(-20 * MIN);

    channel.failReleaseTimes = 2;
    const checkin = new CheckinService(payment);
    await checkin.checkinManual({ registrationId: 'r1', hostId: 'u_host' });

    clock.advance(11 * MIN);
    await runPaymentRetryJob({ payment });
    clock.advance(11 * MIN);
    await runPaymentRetryJob({ payment });

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(order[0].status).toBe('RELEASED');
  });
});

// ===========================================================================
// E 组：取消
// ===========================================================================
describe('E 取消', () => {
  it('E-01 活动取消：全额退，所有参与者信用不变', async () => {
    for (const [rid, uid] of [
      ['r1', U1],
      ['r2', U2],
      ['r3', U3],
    ] as const) {
      await seedConfirmedRegistration({ query } as never, rid, uid);
      await seedHeldOrder({ query } as never, `g_${rid}`, rid);
    }
    // 一条免费占位
    await seedConfirmedRegistration({ query } as never, 'r4', U4, { amount: 0 });

    clock.set(T0_ISO);
    clock.advance(-2 * HOUR);

    const svc = new ActivityService(payment);
    const res = await svc.cancel({
      activityId: 'a1',
      operatorId: 'u_host',
      operatorType: 'HOST',
      reason: '天气预警',
    });

    expect(res.cancelled).toBe(true);
    expect(res.affectedRegistrations).toBe(4);

    const regs = await query<{ registration_status: string }>(
      'SELECT registration_status FROM registration WHERE activity_id=$1',
      ['a1']
    );
    expect(regs.every((r) => r.registration_status === 'CANCELLED_BY_HOST')).toBe(true);

    const orders = await query<{ status: string }>(
      `SELECT status FROM guarantee_order WHERE registration_id IN ('r1','r2','r3')`
    );
    expect(orders).toHaveLength(3);
    expect(orders.every((o) => o.status === 'RELEASED')).toBe(true);

    // 信用分完全不变
    const ledger = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger WHERE event_type <> 'INIT'`
    );
    expect(ledger[0].c).toBe('0');

    const scores = await query<{ score: number }>(
      `SELECT score FROM credit_account WHERE user_id IN ('u1','u2','u3')`
    );
    expect(scores.every((s) => s.score === 100)).toBe(true);
  });

  it('E-02 12h 外取消：不扣分，全额退', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await seedHeldOrder({ query } as never, 'g1', 'r1');
    clock.set(T0_ISO);
    clock.advance(-(12 * HOUR + 1000));

    const svc = new RegistrationService(payment);
    const res = await svc.cancelByUser({ registrationId: 'r1', userId: U1 });
    expect(res.cancelled).toBe(true);
    expect(res.lateCancel).toBe(false);

    const lg = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger WHERE event_type='LATE_CANCEL'`
    );
    expect(lg[0].c).toBe('0');

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(order[0].status).toBe('RELEASED');
  });

  it('E-03 12h 内取消：扣 2 分，全额退', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await seedHeldOrder({ query } as never, 'g1', 'r1');
    clock.set(T0_ISO);
    clock.advance(-1 * HOUR);

    const svc = new RegistrationService(payment);
    const res = await svc.cancelByUser({ registrationId: 'r1', userId: U1 });
    expect(res.lateCancel).toBe(true);

    const lg = await query<{ delta: number }>(
      `SELECT delta FROM credit_ledger WHERE event_type='LATE_CANCEL' AND registration_id='r1'`
    );
    expect(lg).toHaveLength(1);
    expect(lg[0].delta).toBe(-2);

    const acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(98);

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(order[0].status).toBe('RELEASED');
  });

  it('E-04 活动开始后不能自行取消', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    clock.set(T0_ISO);
    clock.advance(10 * MIN);

    await expectCode(
      new RegistrationService(payment).cancelByUser({ registrationId: 'r1', userId: U1 }),
      'ACTIVITY_STARTED_CANNOT_CANCEL'
    );
  });

  it('E-05 取消后释放名额，可重新报名（新建记录）', async () => {
    await resetDb();
    await seed({ query } as never, { capacity: 1 });
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);

    const svc = new RegistrationService(payment);
    const r1 = await svc.create({ activityId: 'a1', userId: U1, guaranteeMode: 'GUARANTEE' });

    // 名额已满
    await expectCode(
      svc.create({ activityId: 'a1', userId: U2, guaranteeMode: 'GUARANTEE' }),
      'ACTIVITY_FULL'
    );

    await svc.cancelByUser({ registrationId: r1.id, userId: U1 });

    // 取消后可重新报名，且生成新记录
    const r1b = await svc.create({ activityId: 'a1', userId: U1, guaranteeMode: 'GUARANTEE' });
    expect(r1b.id).not.toBe(r1.id);

    const rows = await query<{ id: string; registration_status: string }>(
      `SELECT id, registration_status FROM registration
        WHERE activity_id='a1' AND user_id=$1 ORDER BY created_at`,
      [U1]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].registration_status).toBe('CANCELLED_BY_USER');
  });

  it('E-06 重复报名被拒绝', async () => {
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);
    const svc = new RegistrationService(payment);
    await svc.create({ activityId: 'a1', userId: U1, guaranteeMode: 'GUARANTEE' });
    await expectCode(
      svc.create({ activityId: 'a1', userId: U1, guaranteeMode: 'GUARANTEE' }),
      'DUPLICATE_REGISTRATION'
    );
  });

  it('E-07 不能报名自己的活动', async () => {
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);
    await expectCode(
      new RegistrationService(payment).create({
        activityId: 'a1',
        userId: 'u_host',
        guaranteeMode: 'GUARANTEE',
      }),
      'CANNOT_REGISTER_OWN_ACTIVITY'
    );
  });
});

// ===========================================================================
// F 组：爽约分账
// ===========================================================================
describe('F 爽约分账', () => {
  it('F-01 4 人到场，5000 分均分各 1250', async () => {
    const alloc = splitForfeit(5000, [
      { registrationId: 'b1', checkinAt: new Date('2026-11-10T10:01:00+08:00') },
      { registrationId: 'b2', checkinAt: new Date('2026-11-10T10:02:00+08:00') },
      { registrationId: 'b3', checkinAt: new Date('2026-11-10T10:03:00+08:00') },
      { registrationId: 'b4', checkinAt: new Date('2026-11-10T10:04:00+08:00') },
    ]);
    expect(alloc.map((a) => a.amount)).toEqual([1250, 1250, 1250, 1250]);
    expect(alloc.reduce((s, a) => s + a.amount, 0)).toBe(5000);
  });

  it('F-02 3 人到场，余数 2 分给最早核销的两人', () => {
    const alloc = splitForfeit(5000, [
      { registrationId: 'b1', checkinAt: new Date('2026-11-10T10:03:00+08:00') },
      { registrationId: 'b2', checkinAt: new Date('2026-11-10T10:01:00+08:00') },
      { registrationId: 'b3', checkinAt: new Date('2026-11-10T10:02:00+08:00') },
    ]);
    // 排序后：b2(10:01) -> 1667, b3(10:02) -> 1667, b1(10:03) -> 1666
    const map = Object.fromEntries(alloc.map((a) => [a.beneficiaryRegId, a.amount]));
    expect(map.b2).toBe(1667);
    expect(map.b3).toBe(1667);
    expect(map.b1).toBe(1666);
    expect(alloc.reduce((s, a) => s + a.amount, 0)).toBe(5000);
  });

  it('F-03 分账总额恒等于扣划额（随机压力）', () => {
    for (let amount = 1; amount < 400; amount += 7) {
      for (let n = 1; n <= 12; n++) {
        const bens = Array.from({ length: n }, (_, i) => ({
          registrationId: `b${i}`,
          checkinAt: new Date(2026, 0, 1, 10, i),
        }));
        const alloc = splitForfeit(amount, bens);
        expect(alloc.reduce((s, a) => s + a.amount, 0)).toBe(amount);
      }
    }
  });

  it('F-06 两个爽约者各自独立分账', async () => {
    // 2 人爽约 + 3 人到场
    await seedConfirmedRegistration({ query } as never, 'n1', U1, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    await seedConfirmedRegistration({ query } as never, 'n2', U2, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    await seedHeldOrder({ query } as never, 'g1', 'n1');
    await seedHeldOrder({ query } as never, 'g2', 'n2');
    for (const [rid, uid] of [
      ['b1', U3],
      ['b2', U4],
    ] as const) {
      await seedConfirmedRegistration({ query } as never, rid, uid, {
        checkinStatus: 'CHECKED_IN',
      });
      await query('UPDATE registration SET checkin_at=$1 WHERE id=$2', [T0_ISO, rid]);
    }
    // 第三人用 host 的另一个用户占位
    await query(`INSERT INTO app_user(id,nickname) VALUES('u5','用户5') ON CONFLICT DO NOTHING`);
    await query(`INSERT INTO credit_account(user_id) VALUES('u5') ON CONFLICT DO NOTHING`);
    await seedConfirmedRegistration({ query } as never, 'b3', 'u5', {
      checkinStatus: 'CHECKED_IN',
    });
    await query('UPDATE registration SET checkin_at=$1 WHERE id=$2', [T0_ISO, 'b3']);

    clock.set(T0_ISO);
    clock.advance(120 * MIN);
    await runNoShowFinalizeJob({ payment });

    const a1 = await query<{ total: string }>(
      `SELECT coalesce(sum(amount),0)::text AS total FROM forfeit_allocation WHERE guarantee_order_id='g1'`
    );
    const a2 = await query<{ total: string }>(
      `SELECT coalesce(sum(amount),0)::text AS total FROM forfeit_allocation WHERE guarantee_order_id='g2'`
    );
    expect(Number(a1[0].total)).toBe(GUARANTEE);
    expect(Number(a2[0].total)).toBe(GUARANTEE);

    // 平台不截留：补偿专户净额 0（尚无打款则等于入账额）
    const pool = await query<{ kind: string; total: string }>(
      `SELECT kind, sum(amount)::text AS total FROM compensation_ledger GROUP BY kind`
    );
    const inflow = pool.find((p) => p.kind === 'IN_FORFEIT');
    expect(Number(inflow?.total ?? 0)).toBe(GUARANTEE * 2);
    // 无 PLATFORM_COST（平台未从补偿额中扣手续费）
    expect(pool.find((p) => p.kind === 'PLATFORM_COST')).toBeUndefined();
  });
});

// ===========================================================================
// G 组：申诉
// ===========================================================================
describe('G 申诉', () => {
  async function setupNoShow() {
    await seedConfirmedRegistration({ query } as never, 'r1', U1, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    await seedHeldOrder({ query } as never, 'g1', 'r1');
    for (const [rid, uid] of [
      ['b1', U2],
      ['b2', U3],
    ] as const) {
      await seedConfirmedRegistration({ query } as never, rid, uid, {
        checkinStatus: 'CHECKED_IN',
      });
      await query('UPDATE registration SET checkin_at=$1 WHERE id=$2', [T0_ISO, rid]);
    }
    clock.set(T0_ISO);
    clock.advance(120 * MIN);
    await runNoShowFinalizeJob({ payment });
  }

  it('G-01 申诉通过：信用加回、保证金回滚', async () => {
    await setupNoShow();

    let acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(90);

    const svc = new AppealService(payment);
    const ap = await svc.submit({
      registrationId: 'r1',
      userId: U1,
      statement: '我确实到场了，主理人未核销',
      evidenceUrls: ['https://example.com/p1.jpg'],
    });

    const res = await svc.review({ appealId: ap.id, adminId: 'u_admin', approved: true });
    expect(res.status).toBe('APPROVED');
    expect(res.creditReverted).toBe(true);
    expect(res.guaranteeRefunded).toBe(true);

    acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(100);

    const reg = await query<{ checkin_status: string; registration_status: string }>(
      'SELECT checkin_status, registration_status FROM registration WHERE id=$1',
      ['r1']
    );
    expect(reg[0].checkin_status).toBe('CHECKED_IN');

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      ['g1']
    );
    expect(order[0].status).toBe('RELEASED');
  });

  it('G-02 只能回滚一次：重复审核 10 次只加一次分、只退一次款', async () => {
    await setupNoShow();
    const svc = new AppealService(payment);
    const ap = await svc.submit({ registrationId: 'r1', userId: U1, statement: '申诉' });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        svc
          .review({ appealId: ap.id, adminId: 'u_admin', approved: true })
          .catch(() => null)
      )
    );

    const revert = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger
        WHERE registration_id='r1' AND event_type='APPEAL_REVERT'`
    );
    expect(revert[0].c).toBe('1');

    const releases = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM payment_attempt
        WHERE guarantee_order_id='g1' AND kind='RELEASE'`
    );
    expect(releases[0].c).toBe('1');

    const acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(100);
  });

  it('G-03 申诉窗口 24 小时', async () => {
    await setupNoShow();
    // 活动 end_at 默认 T0+180min，再往后推 24h
    clock.advance(180 * MIN + 24 * HOUR + 1000);
    await expectCode(
      new AppealService(payment).submit({
        registrationId: 'r1',
        userId: U1,
        statement: '晚了',
      }),
      'APPEAL_WINDOW_CLOSED'
    );
  });

  it('G-04 申诉被拒：状态不变，记录原因', async () => {
    await setupNoShow();
    const svc = new AppealService(payment);
    const ap = await svc.submit({ registrationId: 'r1', userId: U1, statement: '申诉' });
    const res = await svc.review({
      appealId: ap.id,
      adminId: 'u_admin',
      approved: false,
      note: '凭证不足',
    });
    expect(res.status).toBe('REJECTED');

    const reg = await query<{ checkin_status: string }>(
      'SELECT checkin_status FROM registration WHERE id=$1',
      ['r1']
    );
    expect(reg[0].checkin_status).toBe('NO_SHOW');

    const revert = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger WHERE event_type='APPEAL_REVERT'`
    );
    expect(revert[0].c).toBe('0');

    const note = await query<{ review_note: string }>(
      'SELECT review_note FROM appeal WHERE id=$1',
      [ap.id]
    );
    expect(note[0].review_note).toBe('凭证不足');
  });

  it('G-05 非本人不能申诉；非 NO_SHOW 不能申诉', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1, {
      checkinStatus: 'NO_SHOW_CANDIDATE',
    });
    clock.set(T0_ISO);
    clock.advance(120 * MIN);
    await runNoShowFinalizeJob({ payment });

    const svc = new AppealService(payment);
    await expectCode(svc.submit({ registrationId: 'r1', userId: U2, statement: 'x' }), 'NOT_OWNER');

    await seedConfirmedRegistration({ query } as never, 'r9', U3, {
      checkinStatus: 'UNUSED',
    });
    await expectCode(svc.submit({ registrationId: 'r9', userId: U3, statement: 'x' }), 'NOT_APPEALABLE');
  });
});

// ===========================================================================
// H 组：信用分
// ===========================================================================
describe('H 信用分', () => {
  it('H-01 并发重复加分只生效一次', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    const credit = new CreditService();

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        credit.apply('r1', U1, 'NO_SHOW', { reason: 'test' }).catch(() => null)
      )
    );
    const applied = results.filter((r) => r && r.alreadyProcessed === false);
    expect(applied.length).toBeLessThanOrEqual(1);

    const lg = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger WHERE registration_id='r1' AND event_type='NO_SHOW'`
    );
    expect(lg[0].c).toBe('1');

    const acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(90);
  });

  it('H-02 分数钳制在 [0,120]', async () => {
    const credit = new CreditService();
    await query('UPDATE credit_account SET score=5 WHERE user_id=$1', [U1]);
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    const r = await credit.apply('r1', U1, 'NO_SHOW');
    expect(r.after).toBe(0);
    expect(r.delta).toBe(-5);

    await query('UPDATE credit_account SET score=118 WHERE user_id=$1', [U2]);
    await seedConfirmedRegistration({ query } as never, 'r2', U2);
    const r2 = await credit.apply('r2', U2, 'ADMIN_ADJUST', { nominalDelta: 5 });
    expect(r2.after).toBe(120);
    expect(r2.delta).toBe(2);
  });

  it('H-03 对账恒等式 score = 100 + sum(delta)', async () => {
    const credit = new CreditService();
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await credit.apply('r1', U1, 'NO_SHOW');
    const diff = await credit.reconcile();
    expect(diff).toHaveLength(0);
  });

  it('H-04 成行加分延后到活动结束后结算', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1, {
      checkinStatus: 'CHECKED_IN',
    });
    await query('UPDATE registration SET checkin_at=$1 WHERE id=$2', [T0_ISO, 'r1']);

    clock.set(T0_ISO);
    clock.advance(60 * MIN); // 活动未结束
    await runCreditSettleJob();

    let lg = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger WHERE event_type='CHECK_IN'`
    );
    expect(lg[0].c).toBe('0');

    clock.advance(3 * HOUR); // 活动结束
    await runCreditSettleJob();
    lg = await query<{ c: string }>(
      `SELECT count(*)::text AS c FROM credit_ledger WHERE event_type='CHECK_IN'`
    );
    expect(lg[0].c).toBe('1');

    const acct = await query<{ score: number }>(
      'SELECT score FROM credit_account WHERE user_id=$1',
      [U1]
    );
    expect(acct[0].score).toBe(101);
  });

  it('H-05 信用门槛拦截报名', async () => {
    await resetDb();
    await seed({ query } as never, { minCreditScore: 90 });
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);
    await query('UPDATE credit_account SET score=85 WHERE user_id=$1', [U2]);

    const svc = new RegistrationService(payment);
    await expectCode(
      svc.create({ activityId: 'a1', userId: U2, guaranteeMode: 'GUARANTEE' }),
      'CREDIT_BELOW_THRESHOLD'
    );

    await query('UPDATE credit_account SET score=90 WHERE user_id=$1', [U2]);
    const ok = await svc.create({ activityId: 'a1', userId: U2, guaranteeMode: 'GUARANTEE' });
    expect(ok.registrationStatus).toBe('PENDING_PAYMENT');
  });
});

// ===========================================================================
// I 组：审计
// ===========================================================================
describe('I 审计', () => {
  it('I-01 全链路可追溯', async () => {
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);
    const reg = new RegistrationService(payment);
    const created = await reg.create({ activityId: 'a1', userId: U1, guaranteeMode: 'GUARANTEE' });

    await payment.handlePaySuccessNotify({
      orderId: created.guaranteeOrderId!,
      registrationId: created.id,
      channelTxnId: 'wx_t1',
      channelEventId: 'evt_t1',
      amount: GUARANTEE,
      paidAt: clock.now().toISOString(),
    });

    clock.set(T0_ISO);
    clock.advance(-10 * MIN);
    const checkin = new CheckinService(payment);
    await checkin.checkinManual({ registrationId: created.id, hostId: 'u_host' });

    const audits = await query<{ action: string; operator_type: string }>(
      `SELECT action, operator_type FROM audit_log
        WHERE entity_id IN ($1, $2) ORDER BY created_at`,
      [created.id, created.guaranteeOrderId]
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain('CREATE_REGISTRATION');
    expect(actions).toContain('PAY_HOLD_SUCCESS');
    expect(actions).toContain('CHECKIN');
    expect(actions).toContain('RELEASE_SUCCESS');
    expect(audits.every((a) => !!a.operator_type)).toBe(true);
  });
});

// ===========================================================================
// B 组补充：核销码
// ===========================================================================
describe('B 核销码', () => {
  it('B-05 过期 token 拒绝核销', async () => {
    await resetDb();
    await seed({ query } as never);
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);

    const reg = new RegistrationService(payment);
    const created = await reg.create({ activityId: 'a1', userId: U1, guaranteeMode: 'NONE' });

    // 取库里的 token 不可行（只存 hash），改由工具函数重建一个过期 token
    const { generateCheckinToken } = await import('@/lib/checkin-code');
    const expired = generateCheckinToken({
      activityId: 'a1',
      registrationId: created.id,
      expireAt: new Date(clock.now().getTime() - 1000),
    });

    await expectCode(
      new CheckinService(payment).checkinScan({
        activityId: 'a1',
        hostId: 'u_host',
        token: expired,
      }),
      'TOKEN_EXPIRED'
    );
  });

  it('B-05b 活动取消后不可核销', async () => {
    await seedConfirmedRegistration({ query } as never, 'r1', U1);
    await query(`UPDATE activity SET status='CANCELLED' WHERE id='a1'`);
    clock.set(T0_ISO);

    await expectCode(
      new CheckinService(payment).checkinManual({ registrationId: 'r1', hostId: 'u_host' }),
      'ACTIVITY_CANCELLED'
    );
  });

  it('B-07 6 位码加密可解密，库中无明文', async () => {
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);
    const reg = new RegistrationService(payment);
    const created = await reg.create({ activityId: 'a1', userId: U1, guaranteeMode: 'NONE' });

    const row = await query<{ checkin_code_cipher: string; checkin_code_hash: string }>(
      'SELECT checkin_code_cipher, checkin_code_hash FROM registration WHERE id=$1',
      [created.id]
    );
    expect(row[0].checkin_code_cipher).not.toContain(created.checkinCode!);

    const { decryptShortCode } = await import('@/lib/checkin-code');
    expect(decryptShortCode(row[0].checkin_code_cipher)).toBe(created.checkinCode);
  });
});

// ===========================================================================
// A 组补充：支付超时
// ===========================================================================
describe('A 支付超时', () => {
  it('15 分钟未支付则关单并释放名额', async () => {
    clock.set(T0_ISO);
    clock.advance(-48 * HOUR);
    const reg = new RegistrationService(payment);
    const created = await reg.create({ activityId: 'a1', userId: U1, guaranteeMode: 'GUARANTEE' });

    clock.advance(16 * MIN);
    const cancelled = await payment.cancelUnpaidOrder(created.guaranteeOrderId!);
    expect(cancelled).toBe(true);

    const order = await query<{ status: string }>(
      'SELECT status FROM guarantee_order WHERE id=$1',
      [created.guaranteeOrderId]
    );
    expect(order[0].status).toBe('CANCELLED');
  });
});
