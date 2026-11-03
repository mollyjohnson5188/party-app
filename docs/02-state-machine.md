# 状态转换表 v1.0

> 配套文档：`01-schema.sql`（表结构）、`03-test-cases.md`（测试用例）
>
> 三张状态机彼此独立，**任何一张表的字段变更都必须由"唯一写入者"发起**，其他模块只能发事件，不能直接改状态。

---

## 0. 三条铁律（先读这个）

| # | 铁律 | 实现手段 |
|---|------|----------|
| 1 | **资金动作只能有一个入口**：`GuaranteePaymentService`。业务代码不得直接调用支付通道 SDK | 依赖注入，`PayChannel` 为唯一实现类，测试用 `MockChannel` |
| 2 | **"只成功一次"靠数据库唯一约束**，不靠 `if (status === 'HELD')` | `payment_attempt.uq_pa_idempotency`、`credit_ledger.uq_cl_reg_event` |
| 3 | **状态只能前进，不能回退**（唯一例外：申诉回滚 `NO_SHOW → CHECKED_IN`） | 每张表定义 `ALLOWED_FROM` 集合，写入前校验 |

---

## 1. 报名单状态机 `registration.registration_status`

```
                        ┌──────────────────┐
   guaranatee=NONE ────▶│   CONFIRMED      │◀──── 支付成功回调
                        └────────┬─────────┘
                                 │ 核销成功
                                 ▼
                        ┌──────────────────┐
                        │   CHECKED_IN     │◀──── 申诉通过（仅1次）
                        └──────────────────┘
                                 
   PENDING_PAYMENT ──15min超时──▶ CANCELLED_BY_SYSTEM
   
   CONFIRMED ──用户T0前取消──▶ CANCELLED_BY_USER
   CONFIRMED ──活动取消──▶  CANCELLED_BY_HOST / CANCELLED_BY_SYSTEM
   CONFIRMED ──T0+120min未核销──▶ NO_SHOW
   NO_SHOW ──申诉通过──▶ CHECKED_IN / CONFIRMED
```

| # | 当前状态 | 事件 | 下一状态 | 前置条件 | 同事务副作用 | 幂等键 | 谁触发 |
|---|---------|------|---------|---------|------------|--------|--------|
| R1 | （无） | 创建报名 `NONE` | `CONFIRMED` | 活动 PUBLISHED、有余位、信用分≥门槛、非本人主办 | 占位 +1；无保证金单 | `uq_reg_active` | 用户 |
| R2 | （无） | 创建报名 `GUARANTEE` | `PENDING_PAYMENT` | 同上 | 建 `guarantee_order(CREATED)` → 调通道 → `PAYING`；`payment_expire_at = now+15min` | `uq_reg_active` | 用户 |
| R3 | `PENDING_PAYMENT` | 支付成功回调 | `CONFIRMED` | 通道签名校验通过、金额一致 | `guarantee_order: PAYING→HELD`；写 `payment_attempt(HOLD,SUCCESS)`；发报名成功通知 | `uq_pa_idempotency = HOLD:{registration_id}` | 通道回调 |
| R4 | `PENDING_PAYMENT` | 15 分钟超时 | `CANCELLED_BY_SYSTEM` | `now > payment_expire_at` | `guarantee_order: PAYING→CANCELLED`；释放名额；通知候补 | 状态机 CAS：`WHERE status='PENDING_PAYMENT'` | `paymentRetryJob` / 超时任务 |
| R5 | `PENDING_PAYMENT` | 支付失败回调 | `CANCELLED_BY_SYSTEM` | 通道明确失败 | `guarantee_order: PAYING→FAILED`（或 CANCELLED，视通道语义）；释放名额 | 同上 | 通道回调 |
| R6 | `CONFIRMED` | 主理人核销 | `CHECKED_IN` | `checkin_status` 同步置 `CHECKED_IN`；窗口 `[T0-60m, T0+120m]`；token 有效；操作者是本活动 host | 异步触发 `guarantee_order: HELD→RELEASING`；写审计 | `WHERE checkin_status='UNUSED' OR 'NO_SHOW_CANDIDATE'` 行锁 CAS | 主理人 |
| R7 | `CONFIRMED` | 用户取消 | `CANCELLED_BY_USER` | `now < T0` | 释放名额；`HELD→RELEASING`；`now > T0-12h` 则记 `LATE_CANCEL(-2)` | 状态机 CAS | 用户 |
| R8 | `CONFIRMED` | 主理人取消活动 | `CANCELLED_BY_HOST` | 活动 `PUBLISHED/ONGOING` | 批量 `HELD→RELEASING`；**不动信用分** | 状态机 CAS | 主理人 |
| R9 | `CONFIRMED` | 系统取消（天气/申诉前置） | `CANCELLED_BY_SYSTEM` | — | 同 R8 | 状态机 CAS | 系统 |
| R10 | `CONFIRMED` | T0+120m 未核销 | `NO_SHOW` | `checkin_status=NO_SHOW_CANDIDATE` 且 `now >= T0+120m` | `guarantee_order: HELD→FORFEIT_PENDING`；记 `NO_SHOW(-10)` | `uq_cl_reg_event` + 行锁 | `noShowFinalizeJob` |
| R11 | `NO_SHOW` | 申诉通过 | `CHECKED_IN` | 管理员审核通过、`appeal.expire_at` 未过、本单未回滚过 | `guarantee_order: FORFEIT_PENDING/FORFEITED→RELEASING`；记 `APPEAL_REVERT(+10)` | `uq_cl_reg_event(reg, APPEAL_REVERT)` | 管理员 |
| R12 | `NO_SHOW` | 申诉拒绝 | `NO_SHOW`（不变） | — | 仅写 `appeal.REJECTED` + 审计 | `uq_appeal_reg` | 管理员 |
| R13 | 任意 | 重复触发同事件 | **不变** | — | 返回 200 + `alreadyProcessed: true`，不写任何流水 | 见上 | — |

**禁止的转换（必须单元测试断言会抛错）：**
- `CHECKED_IN → 任何取消态`
- `NO_SHOW → CANCELLED_*`（爽约不能靠"取消"洗白）
- `CANCELLED_* → CONFIRMED`
- `CONFIRMED → PENDING_PAYMENT`

---

## 2. 保证金单状态机 `guarantee_order.status`

> 这张表是**资金唯一真相源**。报名单状态变化只是"业务视角"，退款/扣划是否真的发生，只看这张表。

| # | 当前状态 | 事件 | 下一状态 | 触发条件 | 通道动作 | retry 策略 |
|---|---------|------|---------|---------|----------|-----------|
| G1 | （无） | 创建 | `CREATED` | 报名创建 `GUARANTEE` | — | — |
| G2 | `CREATED` | 发起支付 | `PAYING` | — | `channel.createHold()` 返回 `channel_hold_id` | 失败→`FAILED`，报名同步 `CANCELLED_BY_SYSTEM` |
| G3 | `PAYING` | 支付成功 | `HELD` | 回调验签通过、金额一致 | 记录 `held_at` | — |
| G4 | `PAYING` | 15min 超时 | `CANCELLED` | `now > registration.payment_expire_at` | 调 `channel.closeHold()`（若通道已扣款则改用 release） | 不重试，报名关闭 |
| G5 | `HELD` | 核销成功 | `RELEASING` | 报名 `CHECKED_IN` | `channel.release(全额)` | 见 G9 |
| G6 | `HELD` | 用户提前取消 | `RELEASING` | 报名 `CANCELLED_BY_USER`（含 T0 前任意时刻） | 全额 release | 见 G9 |
| G7 | `HELD` | 活动取消 | `RELEASING` | 报名 `CANCELLED_BY_HOST/SYSTEM` | 全额 release | 见 G9 |
| G8 | `HELD` | 判爽约 | `FORFEIT_PENDING` | 报名 `NO_SHOW` 且到场人数 > 0 | 不进通道，先算分账 | — |
| G9 | `RELEASING` | 退款成功 | `RELEASED` | 通道 `release` 返回成功 | 记录 `release_id`、`released_at` | — |
| G10 | `RELEASING` | 退款失败 | `RELEASING`（原地） | 通道报错 | `retry_count+1`、`next_retry_at=now+10min` | 最多 6 次（累计 ~60min），超限→`FAILED` + 告警 + 转人工；**报名单保持 `CHECKED_IN` 不变** |
| G11 | `FORFEIT_PENDING` | 分账成功 | `FORFEITED` | `forfeit_allocation` 全部落库且金额加总 = 扣划总额 | `channel.forfeit/transfer` | 同 G10 |
| G12 | `FORFEIT_PENDING` | 分账失败 | 原地 | — | 同上 | 同 G10 |
| G13 | `HELD` | **到场人数 = 0** | `RELEASING → RELEASED` | 判爽约时 `count(CHECKED_IN)=0` | 全额原路退，仅扣信用分 | — |
| G14 | `FORFEIT_PENDING` / `FORFEITED` | 申诉通过 | `RELEASING → RELEASED` | — | 若 `FORFEITED`：优先向受益人反向追缴；追缴不可行则由**平台垫付**原路全退（记 `platform_advance` 审计） | 同 G10 |
| G15 | `CREATED` / `PAYING` | 报名取消 | `CANCELLED` | — | 关闭/释放冻结 | — |
| G16 | `RELEASED` / `FORFEITED` / `CANCELLED` | 任何重复事件 | 不变 | — | 直接返回成功 | — |

**累计重试的时间口径**：`retry_count < 6` 时允许重试，`next_retry_at = now + 10min`。第 6 次失败后置 `FAILED`，`last_error` 保留最后一次错误，触发 P2 告警。

---

## 3. 核销状态机 `registration.checkin_status`

| # | 当前 `checkin_status` | 事件 | 下一状态 | 条件 | 备注 |
|---|----------------------|------|---------|------|------|
| C1 | `UNUSED` | 主理人扫码核销 | `CHECKED_IN` | `now ∈ [T0-60m, T0+120m]`；token 未过期；host 匹配 | 行锁 + CAS `WHERE checkin_status='UNUSED'` |
| C2 | `UNUSED` | 主理人手动核销 | `CHECKED_IN` | 同上 | 二次确认；写审计注明 `MANUAL` |
| C3 | `UNUSED` | 到 T0+60m | `NO_SHOW_CANDIDATE` | 定时任务；`registration_status='CONFIRMED'` | 通知用户 + 主理人；写 `no_show_candidate_at` |
| C4 | `NO_SHOW_CANDIDATE` | 主理人补核销 | `CHECKED_IN` | `now < T0+120m` | 允许，且正常触发退款 |
| C5 | `NO_SHOW_CANDIDATE` | 到 T0+120m | `NO_SHOW` | 定时任务 | 触发 G8/G13 + 信用 `NO_SHOW` |
| C6 | `NO_SHOW` | 管理员申诉通过 | `CHECKED_IN` | 结束后 24h 内，本单未回滚过 | 触发 G14 + 信用 `APPEAL_REVERT` |
| C7 | `CHECKED_IN` | 重复核销 | `CHECKED_IN` | — | **幂等**：200 + `message: "该用户已于 HH:mm 核销"`，不写流水、不重复退款 |
| C8 | 任意 | 活动取消 | 不变（但报名单取消） | — | 核销入口直接 400 `ACTIVITY_CANCELLED` |

**窗口边界严格闭合**（`>=` / `<=`，含端点），测试用例覆盖 `T0-60m` 与 `T0+120m` 两个边界。

---

## 4. 信用分变动触发表

| 事件 | 触发时机 | delta（名义） | 幂等键 | 谁写 |
|------|---------|-------|--------|------|
| `INIT` | 首次注册 | 100（账户初始化，流水 before=0, after=100） | `uq_cl_init_user` | 系统 |
| `CHECK_IN` | **活动结束后**由 `creditSettleJob` 统一结算（不在核销瞬间加分） | +1 | `(registration_id, CHECK_IN)` | 系统 |
| `NO_SHOW` | T0+120m 自动判定 | -10 | `(registration_id, NO_SHOW)` | 系统 |
| `LATE_CANCEL` | 用户取消且 `now > T0-12h` | -2 | `(registration_id, LATE_CANCEL)` | 系统 |
| `APPEAL_REVERT` | 申诉通过 | `-1 × 原单据的 nominal_delta`（如 +10，保证"原样撤销"） | `(registration_id, APPEAL_REVERT)` | 管理员操作触发 |
| `ADMIN_ADJUST` | 管理员手动 | 任意 | 不唯一（允许多次），必须 `reason` + `operator` | 管理员 |

**两个字段必须分清（DDL 已强制）**：

| 字段 | 含义 | 用途 |
|------|------|------|
| `nominal_delta` | 规则规定的名义值（爽约就是 -10） | 申诉回滚按 `-nominal_delta` 加回；报表统计"该扣多少" |
| `delta` | 钳制后**实际生效**的值（`after - before`） | **唯一**对账依据：`score = 100 + sum(delta)` |

- 分数钳制 `[0, 120]`。例：用户 score=5 时爽约，`nominal_delta=-10` 但 `delta=-5`；申诉通过加回 `+10`，最终 10 分（而非 100 分）——这是"原样撤销"的正确语义。
- DDL 用 `ck_cl_math`（`delta = after - before`）与 `ck_cl_clamped`（`abs(delta) <= abs(nominal_delta)`）双向兜底，钳制不会破坏对账恒等式，也无法被写成"放大变动"。
- 写流水与更新账户**同一事务**；先 `INSERT credit_ledger`（唯一约束冲突则整体回滚并返回"已处理"），再 `UPDATE credit_account`。
- **不加分时机陷阱**：若核销即 +1，用户可"核销→退报名→再报名"反复刷分。故 `CHECK_IN` 一律延后到活动结束后结算，且结算条件为 `checkin_status='CHECKED_IN' AND activity.status='FINISHED'`。

---

## 5. 定时任务与锁

| 任务 | 频率 | 扫描条件 | 幂等保证 |
|------|------|---------|---------|
| `noShowCandidateJob` | 每 5 min | `checkin_status='UNUSED' AND registration_status='CONFIRMED' AND now >= activity.start_at + 60m` | CAS `UPDATE ... WHERE checkin_status='UNUSED'`；影响行数=1 才执行副作用 |
| `noShowFinalizeJob` | 每 5 min | `checkin_status='NO_SHOW_CANDIDATE' AND now >= start_at + 120m` | 同上 + `uq_cl_reg_event` 兜底 |
| `creditSettleJob` | 每日 + 活动结束触发 | `activity.status='FINISHED'` 且报名 `CHECKED_IN` 未结算 | `uq_cl_reg_event` |
| `paymentRetryJob` | 每 10 min | `status IN ('RELEASING','FORFEIT_PENDING') AND next_retry_at <= now` | 单行 `SELECT ... FOR UPDATE SKIP LOCKED` |
| `creditReconcileJob` | 每日 03:00 | 全量账户 | 对账修复，仅告警不静默改 |

**并发保护**：每个 `lock_key`（如 `no_show_finalize:{registration_id}`）在 `job_run` 表有 `RUNNING` 唯一索引，重复执行直接 `SKIPPED`。
