# 测试用例集 v1.0

> 原则：**验收标准 1、2、5 的测试必须先于实现写完并跑出红色**，再写实现让它变绿。
>
> 测试风格：`vitest` + `supertest` + 真实 PostgreSQL（Testcontainers 或本地库），**不用内存 mock 数据库**。
> 原因：本次所有幂等保证都落在数据库唯一约束上，mock 掉 DB 等于把被测对象删了。

---

## 测试环境约定

```ts
// 时间可注入，禁止在业务代码里直接 new Date()
const clock = new FakeClock('2026-11-10T10:00:00+08:00'); // T0 = 10:00

// 每个用例前置：清库 + 建 1 主理人 / 3 用户 / 1 活动（capacity=3, GUARANTEE, 5000 分）
beforeEach(async () => { await resetDb(); await seedBaseline(); });
```

常量：

| 名称 | 值 |
|------|-----|
| `T0` | 活动集合时间 |
| 保证金 | 5000 分（¥50） |
| 窗口 | `[T0-60m, T0+120m]` |
| 迟到取消线 | `T0-12h` |

---

# A 组：支付回调幂等（验收 1）

### A-01 同一回调重复 10 次，保证金只入账一次

```gherkin
Given 用户 U1 报名了一个 GUARANTEE 活动，保证金单状态 PAYING
When  构造合法支付成功回调 payload
And   用完全相同 payload 并发发起 10 次 POST /payments/guarantee/notify
Then  HTTP 全部返回 200
And   guarantee_order 状态 = HELD，且只有 1 行
And   payment_attempt(kind=HOLD, status=SUCCESS) 计数 = 1
And   registration 状态 = CONFIRMED，updated_at 只被写入 1 次
And   通知表只有 1 条"报名成功"
```

**断言细节**
- 10 个响应中，恰好 1 个 `body.idempotent = false`，9 个 `body.idempotent = true`。
- `SELECT count(*) FROM payment_attempt WHERE guarantee_order_id=$1 AND status='SUCCESS'` → `1`
- 重复执行 10 轮（共 100 次）后仍为 `1`。

**失败模式预警**：若实现用 `if (order.status === 'PAYING')` 判断，并发下会 10 个请求同时读到 `PAYING`，全部入账 → 测试必须用 `Promise.all` 真并发，不能 `for await` 串行。

---

### A-02 回调金额与保证金单不一致，拒绝入账

```gherkin
Given 保证金单 amount = 5000
When  回调 payload 带 amount = 3000
Then  HTTP 400，code = AMOUNT_MISMATCH
And   guarantee_order 仍为 PAYING
And   audit_log 有一条 REJECT 记录（含 expected / actual）
```

### A-03 回调签名错误 / 时间戳过期

```gherkin
When  回调 sign 被篡改，或 timestamp 距今 > 5 分钟
Then  HTTP 401，code = SIGN_INVALID / TIMESTAMP_EXPIRED
And   任何表都无写入（用事务快照对比断言）
```

### A-04 通道重投事件（channel_event_id 相同）

```gherkin
Given 已成功处理回调，payment_attempt.channel_event_id = "evt_001"
When  通道用相同 channel_event_id、但 body 里时间戳不同再次回调
Then  HTTP 200 + idempotent = true
And   payment_attempt 计数不变
```

---

# B 组：并发核销（验收 2）

### B-01 同一报名单并发核销 10 次，只成功一次

```gherkin
Given 报名单 R1 状态 CONFIRMED，checkin_status = UNUSED，当前时间 = T0-30m
When  Promise.all 并发发起 10 次 POST /host/checkin/manual { registrationId: R1 }
Then  恰好 1 个响应 body.success = true
And   9 个响应 body.success = true 但 body.alreadyCheckedIn = true
And   HTTP 全部 200（幂等不报错）
And   checkin_status = CHECKED_IN
And   audit_log 里 action='CHECKIN' 只有 1 条
And   guarantee_order 状态 = RELEASING 或 RELEASED（1 行，未重复发起）
And   payment_attempt(kind=RELEASE) 只有 1 条
```

**关键断言**：`SELECT count(*) FROM payment_attempt WHERE guarantee_order_id=$1 AND kind='RELEASE'` = `1`。这是"不重复退款"的硬证据。

**实现要求**：`SELECT ... FOR UPDATE` 或 `UPDATE registration SET checkin_status='CHECKED_IN', checkin_at=$1 WHERE id=$2 AND checkin_status IN ('UNUSED','NO_SHOW_CANDIDATE') RETURNING *`，用影响行数决定谁成功。**禁止**先 `SELECT` 判断再 `UPDATE`。

---

### B-02 扫码核销 + 手动核销并发

```gherkin
When  同时发起 POST /host/checkin/scan (token) 和 POST /host/checkin/manual (registrationId)
Then  只有 1 次真正核销，另一返回"已核销 HH:mm"
```

### B-03 重复核销提示文案

```gherkin
Given R1 已于 10:05 核销
When  10:20 再次核销
Then  HTTP 200, message = "该用户已于 10:05 核销", alreadyCheckedIn = true
And   不新增 credit_ledger、不新增 payment_attempt
```

### B-04 非主理人不能核销他人活动（验收 9）

```gherkin
Given 用户 H2 是另一个活动的主理人
When  H2 调用 POST /host/checkin/manual { registrationId: R1 }（R1 属于 H1 的活动）
Then  HTTP 403，code = NOT_ACTIVITY_HOST
And   无任何状态变更
```

### B-05 核销码过期 / 活动取消后不可核销（验收 9）

```gherkin
Given token 的 expireAt = T0+120m
When  在 T0+121m 用该 token 扫码
Then  HTTP 400，code = TOKEN_EXPIRED

Given 活动已取消
When  任意时刻扫码
Then  HTTP 400，code = ACTIVITY_CANCELLED
```

### B-06 核销窗口边界

| 场景 | 时间 | 期望 |
|------|------|------|
| 窗口前 1 分钟 | `T0-61m` | 400 `OUT_OF_CHECKIN_WINDOW` |
| 窗口起点 | `T0-60m` | 成功 |
| 窗口终点 | `T0+120m` | 成功（若尚未被定时任务判定，允许，判定优雅处理） |
| 窗口后 1 分钟 | `T0+121m` | 400 `OUT_OF_CHECKIN_WINDOW` |

---

# C 组：定时任务幂等（验收 5）

### C-01 noShowCandidateJob 重复执行不重复通知

```gherkin
Given 3 条 CONFIRMED 报名均 UNUSED，当前时间 = T0+60m
When  并发启动 5 个 noShowCandidateJob 实例
Then  3 条 checkin_status = NO_SHOW_CANDIDATE（各 1 次）
And   job_run 中 4 条 status = SKIPPED
And   通知表每个用户各 1 条，共 3 条
```

### C-02 noShowFinalizeJob 重复执行只扣一次信用、一次保证金

```gherkin
Given 3 条报名均 NO_SHOW_CANDIDATE，其中 1 条有保证金 5000
And   当前时间 = T0+120m
When  for (let i = 0; i < 10; i++) await noShowFinalizeJob()
Then  该注册人 credit_ledger(event_type='NO_SHOW') 计数 = 1
And   分数从 100 变 90（只扣一次）
And   guarantee_order 状态 ∈ {FORFEIT_PENDING, FORFEITED}（1 行）
And   forfeit_allocation 总额 = 5000
```

**这是"最易出错"的第二处**：循环 10 次统计 `credit_ledger` 必须为 1。若实现只依赖 `checkin_status='NO_SHOW'` 检查，第二遍会跳过——看似正确但并发下会漏。必须同时依赖 `uq_cl_reg_event`。

### C-03 边界时间：T0+119m59s 不判爽约

```gherkin
Given 时间 = T0+119m59s，checkin_status = NO_SHOW_CANDIDATE
When  运行 noShowFinalizeJob
Then  checkin_status 仍为 NO_SHOW_CANDIDATE，无扣分
```

### C-04 候选期内补核销，不产生 NO_SHOW

```gherkin
Given checkin_status = NO_SHOW_CANDIDATE，时间 = T0+90m
When  主理人核销
Then  checkin_status = CHECKED_IN
When  运行 noShowFinalizeJob（时间推进到 T0+121m）
Then  credit_ledger 无 NO_SHOW 记录
```

---

# D 组：退款（验收 3）

### D-01 核销后 24 小时内原路退回

```gherkin
Given R1 核销成功
Then  guarantee_order 状态 = RELEASING（同步）
And   异步 worker 执行后 = RELEASED，released_at 有值
And   released_at - checkin_at <= 24h
And   release 金额 = 5000（全额，无手续费扣除）
```

### D-02 退款失败自动重试，6 次后转人工并告警

```gherkin
Given 通道 release 连续失败
When  依次触发 paymentRetryJob 6 次（每次推进 10 分钟）
Then  retry_count 递增 1→6
And   每次都写 payment_attempt(kind=RELEASE, status=FAILED)
And   第 6 次后 guarantee_order.status = FAILED
And   告警被触发 1 次（mock 告警通道断言）
And   第 7 次运行 job 不再尝试（status 已 FAILED）
And   registration.registration_status 仍 = CHECKED_IN（"已核销"状态不被退款失败污染）
```

### D-03 重试成功后半途停止

```gherkin
Given 前 2 次失败，第 3 次成功
Then  status = RELEASED，retry_count = 2，后续 job 不再处理该单
```

---

# E 组：取消（验收 4）

### E-01 活动取消：全额退 + 所有人信用不变

```gherkin
Given 活动有 5 人报名，其中 3 人 HELD 保证金 5000，2 人 NONE 模式
And   其中 1 人已 CHECKED_IN
When  主理人 POST /activities/{id}/cancel
Then  5 条报名全部 CANCELLED_BY_HOST
And   3 张保证金单最终 RELEASED，各退 5000
And   所有用户 credit_ledger 在本次操作中新增 0 条
And   credit_account.score 全部维持 100
And   活动 host 的 cancel_rate 统计 +1（不扣分）
```

### E-02 用户提前取消：12h 外不扣分

```gherkin
Given now = T0-12h-1s
When  U1 POST /registrations/{id}/cancel
Then  registration = CANCELLED_BY_USER
And   guarantee_order → RELEASING → RELEASED（全额 5000）
And   credit_ledger 无 LATE_CANCEL 记录
And   score 仍 100
```

### E-03 用户迟到取消：12h 内扣 2 分

```gherkin
Given now = T0-1h
When  U1 取消
Then  credit_ledger(event_type='LATE_CANCEL', delta=-2) 1 条
And   score = 98
And   guarantee_order → RELEASED 全额 5000
```

### E-04 活动开始后不能自行取消

```gherkin
Given now = T0+10m
When  U1 POST /cancel
Then  HTTP 400，code = ACTIVITY_STARTED_CANNOT_CANCEL
And   状态不变
```

### E-05 取消后释放名额，可重新报名

```gherkin
Given capacity=1，U1 已 CONFIRMED，U2 报名失败（FULL）
When  U1 取消
Then  U2 可成功报名
And   U1 再次报名生成**新记录**（旧记录保持 CANCELLED_BY_USER）
And   (activity_id, user_id) 有效记录仍唯一
```

---

# F 组：爽约分账（验收 6）

### F-01 保证金按到场人数均分，平台不截留

```gherkin
Given 活动 5 人报名，1 人爽约（保证金 5000），4 人核销到场
When  noShowFinalizeJob 判定爽约并分账
Then  forfeit_allocation 生成 4 条
And   sum(amount) = 5000
And   每条 = 1250（5000/4 整除场景）
And   平台账户变动 = 0（断言无平台手续费流水）
```

### F-02 余数处理：余数给最早核销者

```gherkin
Given 保证金 5000，到场 3 人，核销时间分别为 10:01、10:02、10:03
When  分账
Then  金额为 1667 / 1667 / 1666
And   最早核销者（10:01）拿 1667
And   sum = 5000
```

### F-03 除不尽且需要多分 1 分给多个

```gherkin
Given 保证金 5000，到场 3 人 → 5000 = 1666*3 + 2
Then  最早 2 位各 1667，第 3 位 1666，sum = 5000
```

### F-04 无人到场：保证金原路退，仅扣信用

```gherkin
Given 只有 1 人报名并爽约，保证金 HELD 5000，到场 0 人
When  判爽约
Then  guarantee_order → RELEASING → RELEASED（全额 5000 退回本人）
And   forfeit_allocation 0 条
And   credit_ledger NO_SHOW 1 条，score = 90
```

### F-05 免费占位爽约：无保证金，仅扣分

```gherkin
Given guarantee_mode = NONE
When  判爽约
Then  无 guarantee_order 记录
And   credit_ledger NO_SHOW 1 条，score = 90
```

### F-06 多个爽约者，各自独立分账

```gherkin
Given 2 人爽约（各 5000），4 人核销
Then  两个扣除单各自生成 4 条 allocation，各 sum = 5000
And   总额 = 10000
```

---

# G 组：申诉（验收 7）

### G-01 申诉通过：信用加回、保证金回滚

```gherkin
Given R1 = NO_SHOW，score = 90，guarantee_order = FORFEITED
When  管理员 POST /admin/appeals/{id}/review { approved: true }
Then  registration = CHECKED_IN
And   credit_ledger(APPEAL_REVERT, +10) 1 条，score = 100
And   guarantee_order → RELEASING → RELEASED，退 5000
And   FORFEITED 场景下受益人追缴或平台垫付，审计标注 reimbursement_mode
```

### G-02 只能回滚一次

```gherkin
Given 已回滚一次
When  再次审核通过（构造重复请求 / 并发 10 次）
Then  只有 1 条 APPEAL_REVERT 流水
And  只有 1 次 RELEASE
And   其余返回 alreadyProcessed
```

### G-03 申诉窗口 24 小时

```gherkin
Given 活动已结束 24h+1s
When  用户 POST /appeals
Then  HTTP 400，code = APPEAL_WINDOW_CLOSED
```

### G-04 申诉被拒：状态不变，记录原因

```gherkin
When  管理员审核拒绝
Then  registration 仍 NO_SHOW
And   credit_ledger 无 APPEAL_REVERT
And   appeal.review_note 有值，audit_log 有记录
```

### G-05 非本人 / 非 NO_SHOW 单不能申诉

```gherkin
Given U2 尝试对 U1 的报名单申诉 → 403
Given U1 对 CONFIRMED 状态的报名单申诉 → 400 NOT_APPEALABLE
```

---

# H 组：信用分（验收 8）

### H-01 唯一约束生效，重复事件不重复加减

```gherkin
When  直接调用 creditService.add(R1, 'NO_SHOW', -10) 10 次并发
Then  只有 1 次返回 success，9 次返回 alreadyProcessed
And   credit_ledger 1 条，score 90
```

### H-02 分数下限 / 上限钳制

| 场景 | before | nominal_delta | 实际 delta | after |
|------|--------|--------------|-----------|-------|
| 触底 | 5 | -10 | **-5** | 0 |
| 触顶 | 118 | +5 | **+2** | 120 |
| 正常 | 100 | -10 | -10 | 90 |

> **delta 记实际生效值**（`after - before`），`nominal_delta` 另存名义值。这样 `score = 100 + sum(delta)` 恒等式在任何钳制下都成立。DDL 的 `ck_cl_math` + `ck_cl_clamped` 双向约束保证实现写不出错。

### H-02b 触底后申诉回滚语义

```gherkin
Given 用户 score=5，爽约时 nominal_delta=-10 实际 delta=-5，score 变 0
When  申诉通过，按 -nominal_delta = +10 加回
Then  score = 10（而非 100）
And   APPEAL_REVERT.delta = +10，after_score 不超过 120
```

**这是"原样撤销"的正确含义**：补偿掉"这次爽约造成的影响"，而不是把分数重置回爽约之前。

### H-03 对账：account 与流水汇总一致

```gherkin
When  运行 creditReconcileJob
Then  score = 100 + sum(delta)，无差异
Given 人为把 account.score 改成 77（模拟脏数据）
Then  对账发现差异并告警，修复回 90
```

### H-04 成行加分延后结算

```gherkin
Given R1 已 CHECKED_IN，活动尚未 FINISHED
When  运行 creditSettleJob
Then  无 CHECK_IN 流水
Given 活动置 FINISHED
When  再运行 creditSettleJob
Then  credit_ledger(CHECK_IN, +1) 1 条，score 101
```

### H-05 信用门槛拦截报名

```gherkin
Given 活动 min_credit_score = 90，用户 score = 85
When  报名
Then  HTTP 403，code = CREDIT_BELOW_THRESHOLD
And   响应含提示文案
Given score = 90（刚好达标）
Then  报名成功
```

---

# I 组：审计（验收 10）

### I-01 全链路可追溯

```gherkin
Given 走完 "报名→支付→核销→退款" 全流程
Then  按时间序查出 audit_log：
        CREATE_REGISTRATION / PAY_HOLD_SUCCESS / CHECKIN / RELEASE_SUCCESS
And   每条含 operator_type、operator_id、from_state、to_state、payment_ref
```

### I-02 任何状态变更都不得绕过审计

```gherkin
When  代码扫描：所有 UPDATE registration / guarantee_order 的语句
Then  必须伴随同事务的 audit_log INSERT（用测试通过 DB trigger 或服务层装饰器断言）
```

推荐实现：DDL 上加 `AFTER UPDATE` 触发器做兜底，`operator` 从 `SET LOCAL app.operator` 读取；这样即使有人漏写也留痕。

---

# J 组：错误与异常

| 用例 | 输入 | 期望 |
|------|------|------|
| J-01 重复报名 | 同一活动同一用户再次报名（已有有效单） | 409 `DUPLICATE_REGISTRATION` |
| J-02 名额已满 | capacity 占满后报名 | 409 `ACTIVITY_FULL` |
| J-03 报自己的局 | host 报名自己活动 | 400 `CANNOT_REGISTER_OWN_ACTIVITY` |
| J-04 活动已取消报名 | 活动 CANCELLED | 400 `ACTIVITY_CANCELLED` |
| J-05 通道超时 | createHold 超时 | 报名 PENDING_PAYMENT，可重试；15 分钟后自动关单 |
| J-06 参数校验 | guaranteeMode 非法值 | 400 `VALIDATION_ERROR` |

---

# 执行顺序（重要）

```
1. 写 A-01、B-01、C-02 三个用例 —— 此时无实现，全部红
2. 提交红色测试（证明测试真的能捕获 bug）
3. 写 DDL + 迁移
4. 写 GuaranteePaymentService + 幂等层
5. 让 A-01 变绿（唯一约束 + ON CONFLICT）
6. 让 B-01 变绿（行锁 CAS）
7. 让 C-02 变绿（CAS + credit 唯一键）
8. 批量补齐其余用例
```

**验收门禁**：A-01、B-01、C-02 三条未全绿，不允许写任何页面代码。

---

# 覆盖矩阵

| 验收标准 | 对应用例 | 状态 |
|---------|---------|------|
| 1 支付回调重复 10 次 | A-01、A-04 | 待实现 |
| 2 并发核销 10 次 | B-01、B-02、B-03 | 待实现 |
| 3 退款 24h 内 + 重试告警 | D-01、D-02、D-03 | 待实现 |
| 4 活动取消全退且信用不变 | E-01 | 待实现 |
| 5 T0+60/120 判定且只扣一次 | C-01、C-02、C-03、C-04 | 待实现 |
| 6 分账均分、平台不截留 | F-01~F-06 | 待实现 |
| 7 申诉回滚只一次 | G-01、G-02 | 待实现 |
| 8 信用唯一约束 | H-01、H-03 | 待实现 |
| 9 越权/过期/取消后核销 | B-04、B-05、B-06 | 待实现 |
| 10 审计可追溯 | I-01、I-02 | 待实现 |
