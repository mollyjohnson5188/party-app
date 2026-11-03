# 组局 · 白领户外活动平台 MVP

保证金制的白领户外组局平台。核心解决一个问题：**报名了不来**。

保证金只是承诺，不是收入。到场核销，钱原路全额退回；真的没来，这笔钱会分给那些按时到了的人，平台一分不留。

---

## 三条硬约束

这三条是产品底线，代码实现围绕它们展开：

| # | 约束 | 落地方式 |
|---|------|---------|
| 1 | 平台不代收活动费用，只处理保证金 | 活动费完全由主理人线下收取，系统内无相关字段 |
| 2 | 保证金走持牌通道冻结/预授权，禁止二清 | `PayChannel` 抽象接口，业务层不接触资金账户 |
| 3 | 平台不截留保证金与违约扣款 | `compensation_ledger` 强制平台留存为 0，有测试断言 |

---

## 快速开始

### 1. 准备数据库

```bash
# PostgreSQL 14+
createdb party
psql -d party -v ON_ERROR_STOP=1 -f db/migrations/001_init.sql
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少修改 DATABASE_URL 与三个密钥
```

### 3. 启动

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:3000

### 4. 灌演示数据

```bash
curl -X POST http://127.0.0.1:3000/api/dev/seed
```

页面右上角可切换 6 个演示身份（含主理人、管理员、有爽约记录的用户）。

---

## 测试

```bash
# 需要独立的测试库
createdb party_test
npm test
```

**41 个用例，全部连接真实 PostgreSQL。** 刻意不 mock 数据库——本项目的幂等保证全部落在数据库唯一约束上，mock 掉 DB 等于把被测对象删了。

### 三条红线测试

资金逻辑最容易写歪的地方，这三条测试**先于实现存在**：

| 用例 | 验证什么 |
|------|---------|
| `A-01` | 支付回调并发 20 次，保证金只入账一次 |
| `B-01` | 并发核销 10 次，只核销一次、只发起一次退款 |
| `C-02` | 爽约定时任务跑 10 遍，只扣一次信用、一次保证金 |

### 一个值得记录的经验

最初 A-01 用 10 并发时，**故意写错的无锁实现竟然通过了**。原因是并发度低于数据库连接池（20），事务被串行化，第二个请求拿到连接时第一个已提交，`if (status === 'PAYING')` 恰好读到新值。

把并发提到 20 后 bug 立刻现形——10 次重复入账。

> 教训：并发测试的并发度必须突破连接池上限，否则测的不是并发，是排队。

---

## 核心设计

### 幂等靠数据库，不靠 if

所有"只许成功一次"的判定，统一手法：

```sql
-- 用影响行数裁决谁成功，而不是先 SELECT 再判断
UPDATE registration
   SET checkin_status = 'CHECKED_IN'
 WHERE id = $1
   AND checkin_status IN ('UNUSED', 'NO_SHOW_CANDIDATE')
RETURNING checkin_at
```

`rowCount = 0` 即"别人已处理"，走幂等分支返回成功。

四层兜底，任一层单独失效都不会造成重复扣款：

| 层 | 约束 |
|---|------|
| 1 | `UPDATE ... WHERE 前态` 的影响行数 |
| 2 | `payment_attempt(kind, idempotency_key)` 唯一 |
| 3 | `credit_ledger(registration_id, event_type)` 唯一 |
| 4 | `forfeit_allocation(no_show_reg_id, beneficiary_reg_id)` 唯一 |

### 状态机

三张状态机彼此独立，任何字段变更只能由"唯一写入者"发起：

- 报名单 `registration_status`
- 保证金单 `status` —— 资金唯一真相源
- 核销 `checkin_status`

完整转换表见 [`docs/02-state-machine.md`](docs/02-state-machine.md)。

### 信用分的两个 delta

这是实测中发现并修正的设计冲突：

| 字段 | 含义 | 用途 |
|------|------|------|
| `nominal_delta` | 规则名义值（爽约恒为 -10） | 申诉按 `-nominal_delta` 原样撤销 |
| `delta` | 钳制后实际值（`after - before`） | 唯一对账依据 |

例：用户 5 分时爽约，实际只扣 5 分；申诉通过加回 10 分，最终 10 分而非 100 分。

这样 `score = 100 + sum(delta)` 在任何钳制下都成立，DDL 用 `ck_cl_math` + `ck_cl_clamped` 双向兜底。

### 时间基准

| 节点 | 含义 |
|------|------|
| `T0` | 活动集合时间 `startAt` |
| `T0 - 12h` | 迟到取消线，之后取消扣 2 分 |
| `T0 - 60m` | 核销窗口开启 |
| `T0 + 60m` | 进入爽约候选 |
| `T0 + 120m` | 判爽约，扣信用 + 扣划保证金；核销窗口关闭 |
| `活动结束 + 24h` | 申诉窗口关闭 |

所有时间判断走可注入的 `Clock`，业务代码禁止直接 `new Date()`——否则边界测试无法精确验证。

---

## 目录结构

```
app/
  api/                    接口路由
    registrations/        创建报名、用户取消
    payments/guarantee/   支付回调（幂等入口）
    host/checkin/         扫码 / 手动核销
    activities/           活动列表、详情、取消
    credit/               信用分与流水
    appeals/              申诉提交与审核
    cron/[job]/           定时任务触发
    dev/                  演示用（生产须删除）
  page.tsx                发现组局
  activity/[id]/          活动详情与报名
  mine/                   我的报名
  credit/                 信用中心
  host/                   主理人台
lib/
  db/                     连接池与事务
  clock.ts                可注入时钟 + 业务时间常量
  checkin-code.ts         核销码（HMAC token + AES-GCM 6 位码）
  domain/forfeit-split.ts 爽约分账算法
  services/               业务服务
    guarantee-payment.service.ts   资金唯一入口
    checkin.service.ts            核销 CAS
    credit.service.ts             信用流水
    appeal.service.ts             申诉回滚
    activity.service.ts           批量退款
  jobs/                   定时任务
db/migrations/            数据库迁移
docs/                     DDL / 状态机 / 测试用例
tests/                    验收测试
```

---

## 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/registrations` | 创建报名，返回支付参数 |
| POST | `/api/payments/guarantee/notify` | 支付回调（幂等） |
| POST | `/api/registrations/{id}/cancel` | 用户取消 |
| POST | `/api/activities/{id}/cancel` | 主理人取消，批量退款 |
| POST | `/api/host/checkin/scan` | 扫码核销 |
| POST | `/api/host/checkin/manual` | 手动核销 |
| GET | `/api/credit/me` | 信用分与统计 |
| GET | `/api/credit/ledger` | 信用流水 |
| POST | `/api/appeals` | 提交申诉 |
| POST | `/api/admin/appeals/{id}/review` | 管理员审核 |
| POST | `/api/cron/{job}` | 定时任务 |

**定时任务**：`noShowCandidateJob`、`noShowFinalizeJob`、`creditSettleJob`、`paymentRetryJob`

---

## 上线前必做

- [ ] 更换 `.env` 中三个密钥（`CHECKIN_TOKEN_SECRET`、`CHECKIN_CODE_KEY`、`PAY_CALLBACK_SECRET`）
- [ ] 删除 `/api/dev/seed` 与 `/api/dev/sign-and-notify`
- [ ] 实现真实 `PayChannel`（微信/支付宝冻结与预授权），在 `pay-channel.registry.ts` 注册
- [ ] 将请求头 `X-User-Id` 换成 JWT/Session 鉴权
- [ ] 配置定时任务调度器（Cron），设置 `CRON_SECRET`
- [ ] 补充补偿打款流程：`forfeit_allocation` 目前是 `PENDING`，需实现线下打款回写

---

## 已知限制

- **补偿分账是"平台垫付"模式**：微信/支付宝分账要求收款方为已进件商户，个人用户无法直接作为分账接收方。当前实现是扣划全额进平台补偿专户，由平台按 `forfeit_allocation` 明细线下打款，账务如实记账。接口已预留 `beneficiaryPayments[]`，通道支持后换实现即可。
- **支付通道为 Mock**：`MockPayChannel` 只模拟成功/失败，不产生真实资金动作。
- **MVP 不做主理人信用分**：取消率仅在主理人页面展示。

---

## SiteGround 入口页

若你的主站托管在 SiteGround 共享套餐（无法运行 Node），可用 `siteground-entry/` 目录里的引导页或 301 规则做入口。详见该目录 README。

## 文档

- [`docs/01-schema.sql`](docs/01-schema.sql) — 数据库 DDL
- [`docs/02-state-machine.md`](docs/02-state-machine.md) — 状态转换表
- [`docs/03-test-cases.md`](docs/03-test-cases.md) — 测试用例与覆盖矩阵
