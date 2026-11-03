import { ok, handleError } from '@/lib/api';
import { query } from '@/lib/db';
import crypto from 'node:crypto';
import { encryptShortCode, generateCheckinToken, hashToken } from '@/lib/checkin-code';

/**
 * POST /api/dev/seed —— 灌演示数据（仅演示环境使用）。
 * 会清空业务表后重建，生产环境请删除此路由。
 */
export async function POST() {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== '1') {
      return ok({ skipped: true, reason: '生产环境已禁用，需设置 ALLOW_SEED=1' });
    }

    await query(`TRUNCATE appeal, forfeit_allocation, compensation_ledger,
                 payment_attempt, credit_ledger, guarantee_order, registration,
                 notification, audit_log, job_run, activity, credit_account, app_user
                 RESTART IDENTITY CASCADE`);

    const now = Date.now();
    const H = 3_600_000;

    const users: [string, string, string][] = [
      ['u_host', '林间行者', '13800000001'],
      ['u_zhang', '张一鸣', '13800000002'],
      ['u_li', '李思远', '13800000003'],
      ['u_wang', '王星然', '13800000004'],
      ['u_chen', '陈慕白', '13800000005'],
      ['u_admin', '平台运营', '13800000000'],
    ];
    for (const [id, nickname, phone] of users) {
      await query(
        `INSERT INTO app_user(id, nickname, phone) VALUES($1,$2,$3)
         ON CONFLICT(id) DO NOTHING`,
        [id, nickname, phone]
      );
      await query(
        `INSERT INTO credit_account(user_id, score, level) VALUES($1,$2,$3)
         ON CONFLICT(user_id) DO NOTHING`,
        [id, 100, 'EXCELLENT']
      );
    }

    // 一个用户设为 96 分，展示差异化
    await query(`UPDATE credit_account SET score=96, level='NORMAL' WHERE user_id='u_li'`);

    const activities: {
      id: string;
      host: string;
      title: string;
      loc: string;
      startOffsetH: number;
      capacity: number;
      mode: 'NONE' | 'GUARANTEE';
      amount: number;
      minCredit: number;
      desc: string;
    }[] = [
      {
        id: 'act_hike',
        host: 'u_host',
        title: '周末香山轻徒步 · 秋色线',
        loc: '香山公园东门',
        startOffsetH: 26, // 明天
        capacity: 8,
        mode: 'GUARANTEE',
        amount: 5000,
        minCredit: 80,
        desc: '全程约 8 公里，爬升 400 米，适合初次徒步的白领。集合点在地铁巴沟站。',
      },
      {
        id: 'act_climb',
        host: 'u_host',
        title: '室内攀岩体验 · 零基础可',
        loc: '朝阳区攀岩馆',
        startOffsetH: 50,
        capacity: 6,
        mode: 'GUARANTEE',
        amount: 3000,
        minCredit: 0,
        desc: '含教练与装备，2 小时体验课。保证金到场核销后原路全额退。',
      },
      {
        id: 'act_run',
        host: 'u_zhang',
        title: '奥森 10 公里晨跑',
        loc: '奥林匹克森林公园南门',
        startOffsetH: 3, // 3 小时后，用于演示核销窗口
        capacity: 12,
        mode: 'NONE',
        amount: 0,
        minCredit: 0,
        desc: '免费占位，配速 6 分半左右。跑后一起喝咖啡。',
      },
      {
        id: 'act_photo',
        host: 'u_li',
        title: '城市街拍 · 胶片主题',
        loc: '南锣鼓巷',
        startOffsetH: -30, // 已结束，用于演示结算
        capacity: 10,
        mode: 'GUARANTEE',
        amount: 2000,
        minCredit: 0,
        desc: '带一卷胶卷，一起走街串巷。',
      },
    ];

    for (const a of activities) {
      const start = new Date(now + a.startOffsetH * H);
      const end = new Date(start.getTime() + 3 * H);
      const status = a.startOffsetH < -3 ? 'FINISHED' : 'PUBLISHED';
      await query(
        `INSERT INTO activity(
           id, host_id, title, description, location, start_at, end_at,
           capacity, status, guarantee_mode, guarantee_amount, min_credit_score
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          a.id,
          a.host,
          a.title,
          a.desc,
          a.loc,
          start.toISOString(),
          end.toISOString(),
          a.capacity,
          status,
          a.mode,
          a.amount,
          a.minCredit,
        ]
      );
    }

    // 报名样本
    const regs: {
      id: string;
      act: string;
      user: string;
      status: string;
      checkin: string;
      amount: number;
      checkinAt?: string;
    }[] = [
      // 香山局：3 人已确认保证金
      { id: 'reg_h1', act: 'act_hike', user: 'u_zhang', status: 'CONFIRMED', checkin: 'UNUSED', amount: 5000 },
      { id: 'reg_h2', act: 'act_hike', user: 'u_li', status: 'CONFIRMED', checkin: 'UNUSED', amount: 5000 },
      { id: 'reg_h3', act: 'act_hike', user: 'u_wang', status: 'CONFIRMED', checkin: 'UNUSED', amount: 5000 },
      // 攀岩局：1 人待支付
      { id: 'reg_c1', act: 'act_climb', user: 'u_chen', status: 'PENDING_PAYMENT', checkin: 'UNUSED', amount: 3000 },
      // 晨跑：已核销 1 人
      {
        id: 'reg_r1',
        act: 'act_run',
        user: 'u_li',
        status: 'CHECKED_IN',
        checkin: 'CHECKED_IN',
        amount: 0,
        checkinAt: new Date(now + 2.5 * H).toISOString(),
      },
      { id: 'reg_r2', act: 'act_run', user: 'u_wang', status: 'CONFIRMED', checkin: 'UNUSED', amount: 0 },
      // 街拍（已结束）：2 人到场，1 人爽约
      {
        id: 'reg_p1',
        act: 'act_photo',
        user: 'u_zhang',
        status: 'CHECKED_IN',
        checkin: 'CHECKED_IN',
        amount: 2000,
        checkinAt: new Date(now - 31 * H).toISOString(),
      },
      {
        id: 'reg_p2',
        act: 'act_photo',
        user: 'u_wang',
        status: 'CHECKED_IN',
        checkin: 'CHECKED_IN',
        amount: 2000,
        checkinAt: new Date(now - 30.5 * H).toISOString(),
      },
      { id: 'reg_p3', act: 'act_photo', user: 'u_chen', status: 'NO_SHOW', checkin: 'NO_SHOW', amount: 2000 },
    ];

    for (const r of regs) {
      const act = activities.find((a) => a.id === r.act)!;
      const start = new Date(now + act.startOffsetH * H);
      const token = generateCheckinToken({
        activityId: act.id,
        registrationId: r.id,
        expireAt: new Date(start.getTime() + 2 * H),
      });
      const code = String(100000 + crypto.randomInt(0, 899999));
      await query(
        `INSERT INTO registration(
           id, activity_id, user_id, host_id, registration_status,
           guarantee_mode, guarantee_amount, checkin_status,
           checkin_code_hash, checkin_code_cipher, checkin_code_expire_at,
           checkin_at, checkin_by, created_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now() - interval '2 days')`,
        [
          r.id,
          r.act,
          r.user,
          act.host,
          r.status,
          r.amount > 0 ? 'GUARANTEE' : 'NONE',
          r.amount,
          r.checkin,
          hashToken(token),
          encryptShortCode(code),
          new Date(start.getTime() + 2 * H).toISOString(),
          r.checkinAt ?? null,
          r.checkin === 'CHECKED_IN' ? act.host : null,
        ]
      );

      if (r.amount > 0) {
        const orderStatus =
          r.status === 'PENDING_PAYMENT'
            ? 'PAYING'
            : r.checkin === 'CHECKED_IN'
              ? 'RELEASED'
              : r.checkin === 'NO_SHOW'
                ? 'FORFEITED'
                : 'HELD';
        await query(
          `INSERT INTO guarantee_order(
             id, registration_id, amount, status, payment_channel,
             channel_hold_id, held_at, released_at, forfeited_at
           ) VALUES($1,$2,$3,$4,'mock',$5,now(),$6,$7)`,
          [
            `go_${r.id}`,
            r.id,
            r.amount,
            orderStatus,
            `hold_${r.id}`,
            orderStatus === 'RELEASED' ? new Date(now).toISOString() : null,
            orderStatus === 'FORFEITED' ? new Date(now).toISOString() : null,
          ]
        );
      }
    }

    // 街拍局的爽约分账 + 信用流水
    await query(
      `INSERT INTO forfeit_allocation(id, guarantee_order_id, activity_id, beneficiary_reg_id, no_show_reg_id, amount)
       VALUES('fa_p1','go_reg_p3','act_photo','reg_p1','reg_p3',1000),
             ('fa_p2','go_reg_p3','act_photo','reg_p2','reg_p3',1000)`
    );
    await query(
      `INSERT INTO compensation_ledger(kind, guarantee_order_id, activity_id, amount, remark)
       VALUES('IN_FORFEIT','go_reg_p3','act_photo',2000,'爽约扣划入池')`
    );
    await query(
      `INSERT INTO credit_ledger(id,user_id,registration_id,event_type,delta,nominal_delta,before_score,after_score,reason,operator)
       VALUES('cl_p3','u_chen','reg_p3','NO_SHOW',-10,-10,100,90,'T0+120min 未核销，自动判定爽约','SYSTEM')`
    );
    await query(`UPDATE credit_account SET score=90, level='NORMAL' WHERE user_id='u_chen'`);

    // 一些审计日志
    await query(
      `INSERT INTO audit_log(entity_type, entity_id, action, from_state, to_state, operator_type, reason)
       VALUES('registration','reg_p3','MARK_NO_SHOW','NO_SHOW_CANDIDATE','NO_SHOW','SYSTEM','定时任务自动判定'),
             ('guarantee_order','go_reg_p3','FORFEIT_SUCCESS','FORFEIT_PENDING','FORFEITED','SYSTEM','爽约扣划分账'),
             ('registration','reg_r1','CHECKIN','UNUSED','CHECKED_IN','HOST','扫码核销')`
    );

    const counts = await query<{ t: string; c: string }>(
      `SELECT 'activity' AS t, count(*)::text AS c FROM activity
       UNION ALL SELECT 'registration', count(*)::text FROM registration
       UNION ALL SELECT 'guarantee_order', count(*)::text FROM guarantee_order`
    );

    return ok({ seeded: true, counts });
  } catch (e) {
    return handleError(e);
  }
}
