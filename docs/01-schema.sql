-- =============================================================================
-- 白领户外组局平台 · MVP 数据库 DDL v1.0
-- 目标数据库：PostgreSQL 14+（MySQL 8 差异见文末附录 A）
-- 设计原则：
--   1) 资金安全优先：所有"只允许成功一次"的动作，靠数据库唯一约束兜底，
--      不依赖应用层 if 判断。应用层判断只是优化，约束才是保证。
--   2) 金额单位统一为"分"（BIGINT），浮点一律禁止。
--   3) 所有状态流转写入 audit_log，任何字段变更可追溯。
--   4) 时间统一 TIMESTAMPTZ，服务端存储 UTC，展示层转 Asia/Shanghai。
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
-- CREATE EXTENSION IF NOT EXISTS btree_gist;  -- 若需 (activity_id,user_id) 部分唯一索引不需要

-- -----------------------------------------------------------------------------
-- 0. 枚举类型
-- -----------------------------------------------------------------------------
CREATE TYPE registration_status AS ENUM (
  'PENDING_PAYMENT',     -- 待支付保证金（NONE 模式不会停留在此状态）
  'CONFIRMED',           -- 报名确认，占位成功
  'CHECKED_IN',          -- 已核销到场
  'NO_SHOW',             -- 爽约
  'CANCELLED_BY_USER',   -- 用户取消
  'CANCELLED_BY_HOST',   -- 主理人取消活动导致
  'CANCELLED_BY_SYSTEM', -- 系统取消（支付超时 / 天气预警 / 申诉失败前置等）
  'REFUNDED'             -- 保留态：报名单层面已完结退款（MVP 主要用保证金单表达退款，此态备用）
);

CREATE TYPE guarantee_mode AS ENUM ('NONE', 'GUARANTEE');

CREATE TYPE checkin_status AS ENUM (
  'UNUSED',              -- 未核销
  'NO_SHOW_CANDIDATE',   -- T0+60min 未核销，爽约候选
  'CHECKED_IN',          -- 已核销
  'NO_SHOW'              -- T0+120min 判定爽约
);

CREATE TYPE guarantee_order_status AS ENUM (
  'CREATED',         -- 已建单未发起支付
  'PAYING',          -- 已调通道，等待结果
  'HELD',            -- 资金已冻结/预授权成功
  'RELEASING',       -- 退款中（原路退）
  'RELEASED',        -- 已全额原路退回
  'FORFEIT_PENDING', -- 待扣划分账
  'FORFEITED',       -- 已扣划完成并分账给到场者
  'CANCELLED',       -- 未支付超时关闭
  'FAILED'           -- 通道失败且超过重试上限，转人工
);

CREATE TYPE credit_event_type AS ENUM (
  'INIT',           -- 首次注册初始化 100
  'CHECK_IN',       -- 成行 +1
  'NO_SHOW',        -- 爽约 -10
  'LATE_CANCEL',    -- 迟到取消 -2
  'APPEAL_REVERT',  -- 申诉成功加回 +10
  'ADMIN_ADJUST'    -- 管理员调整（可为正负）
);

CREATE TYPE activity_status AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'ONGOING',
  'FINISHED',
  'CANCELLED'
);

CREATE TYPE appeal_status AS ENUM (
  'SUBMITTED',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE payment_attempt_kind AS ENUM (
  'HOLD',        -- 冻结/预授权
  'RELEASE',     -- 退款
  'FORFEIT'      -- 扣划分账
);

CREATE TYPE payment_attempt_status AS ENUM (
  'PENDING',
  'SUCCESS',
  'FAILED'
);

-- -----------------------------------------------------------------------------
-- 1. 用户 / 信用账户
-- -----------------------------------------------------------------------------
CREATE TABLE app_user (
  id            VARCHAR(32)  PRIMARY KEY,
  nickname      VARCHAR(64)  NOT NULL,
  phone         VARCHAR(32),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_app_user_phone ON app_user(phone) WHERE phone IS NOT NULL;

-- 信用账户是"缓存"，以 credit_ledger 汇总为准，每日对账修正（见 3.3）
CREATE TABLE credit_account (
  user_id     VARCHAR(32) PRIMARY KEY REFERENCES app_user(id),
  score       INTEGER     NOT NULL DEFAULT 100,
  level       VARCHAR(16) NOT NULL DEFAULT 'NORMAL',  -- EXCELLENT / NORMAL / LIMITED
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_credit_score_range CHECK (score >= 0 AND score <= 120),
  CONSTRAINT ck_credit_level CHECK (level IN ('EXCELLENT','NORMAL','LIMITED'))
);

-- -----------------------------------------------------------------------------
-- 2. 活动
-- -----------------------------------------------------------------------------
CREATE TABLE activity (
  id              VARCHAR(32)  PRIMARY KEY,
  host_id         VARCHAR(32)  NOT NULL REFERENCES app_user(id),
  title           VARCHAR(128) NOT NULL,
  description     TEXT,
  location        VARCHAR(255),
  start_at        TIMESTAMPTZ  NOT NULL,          -- T0
  end_at          TIMESTAMPTZ  NOT NULL,
  capacity        INTEGER      NOT NULL,
  status          activity_status NOT NULL DEFAULT 'PUBLISHED',
  guarantee_mode  guarantee_mode  NOT NULL DEFAULT 'NONE',
  guarantee_amount INTEGER     NOT NULL DEFAULT 0, -- 分；GUARANTEE 模式下 > 0
  min_credit_score INTEGER     NOT NULL DEFAULT 0, -- 门槛 0/80/90
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   VARCHAR(255),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_activity_time   CHECK (end_at > start_at),
  CONSTRAINT ck_activity_cap    CHECK (capacity > 0),
  CONSTRAINT ck_activity_amount CHECK (guarantee_amount >= 0),
  CONSTRAINT ck_activity_gmode  CHECK (
    (guarantee_mode = 'NONE'      AND guarantee_amount = 0) OR
    (guarantee_mode = 'GUARANTEE' AND guarantee_amount > 0)
  ),
  CONSTRAINT ck_activity_mincredit CHECK (min_credit_score IN (0, 80, 90))
);
CREATE INDEX idx_activity_start_at ON activity(start_at) WHERE status IN ('PUBLISHED','ONGOING');
CREATE INDEX idx_activity_host     ON activity(host_id);

-- -----------------------------------------------------------------------------
-- 3. 报名单
-- -----------------------------------------------------------------------------
CREATE TABLE registration (
  id                VARCHAR(32)  PRIMARY KEY,
  activity_id       VARCHAR(32)  NOT NULL REFERENCES activity(id),
  user_id           VARCHAR(32)  NOT NULL REFERENCES app_user(id),
  host_id           VARCHAR(32)  NOT NULL REFERENCES app_user(id),  -- 冗余，便于主理人侧查询
  registration_status registration_status NOT NULL,
  guarantee_mode    guarantee_mode NOT NULL,
  guarantee_amount  INTEGER      NOT NULL DEFAULT 0,
  checkin_status    checkin_status NOT NULL DEFAULT 'UNUSED',
  checkin_code_hash VARCHAR(128),        -- HMAC(activityId|registrationId|expireAt) 的 hash，不存明文
  checkin_code_expire_at TIMESTAMPTZ,    -- token 过期时间（=T0+120min）
  checkin_code_short VARCHAR(8),         -- 6 位数字码（加密存储或哈希后比对，见说明）
  checkin_code_short_hash VARCHAR(128),  -- 6 位码的加盐哈希，避免明文落库
  checkin_at        TIMESTAMPTZ,
  checkin_by        VARCHAR(32) REFERENCES app_user(id),
  no_show_candidate_at TIMESTAMPTZ,      -- 进入候选的时间，用于定时任务幂等
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     VARCHAR(255),
  payment_expire_at TIMESTAMPTZ,         -- 创建时间 + 15 分钟，支付超时基准
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_reg_amount CHECK (guarantee_amount >= 0),
  CONSTRAINT ck_reg_gmode  CHECK (
    (guarantee_mode = 'NONE'      AND guarantee_amount = 0) OR
    (guarantee_mode = 'GUARANTEE' AND guarantee_amount > 0)
  ),
  CONSTRAINT ck_reg_no_self_host CHECK (user_id <> host_id)  -- 主理人不能报自己的局
);

-- 关键约束：同一用户在同一活动下，只能存在一条"有效"报名。
-- 取消后可重新报名 —— MVP 采用"新建记录"，取消记录保留为历史。
-- 用部分唯一索引实现"仅有效报名唯一"，历史记录不冲突。
CREATE UNIQUE INDEX uq_reg_active
  ON registration(activity_id, user_id)
  WHERE registration_status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','NO_SHOW');

CREATE INDEX idx_reg_activity_status ON registration(activity_id, registration_status);
CREATE INDEX idx_reg_user            ON registration(user_id);
CREATE INDEX idx_reg_host            ON registration(host_id);

-- 核销窗口扫描索引（定时任务 noShowCandidateJob / noShowFinalizeJob）
CREATE INDEX idx_reg_scan_candidate
  ON registration(activity_id, checkin_status)
  WHERE checkin_status = 'UNUSED' AND registration_status = 'CONFIRMED';

CREATE INDEX idx_reg_scan_finalize
  ON registration(activity_id, checkin_status)
  WHERE checkin_status = 'NO_SHOW_CANDIDATE';

-- 席位计数索引（已核销到场者，用于爽约补偿分账计算）
CREATE INDEX idx_reg_checked_in
  ON registration(activity_id)
  WHERE checkin_status = 'CHECKED_IN';

-- -----------------------------------------------------------------------------
-- 4. 保证金单
-- -----------------------------------------------------------------------------
CREATE TABLE guarantee_order (
  id               VARCHAR(32)  PRIMARY KEY,
  registration_id  VARCHAR(32)  NOT NULL REFERENCES registration(id),
  amount           INTEGER      NOT NULL,
  status           guarantee_order_status NOT NULL DEFAULT 'CREATED',
  payment_channel  VARCHAR(32)  NOT NULL,          -- wechat_epay / alipay_papay / mock
  channel_hold_id  VARCHAR(64),                    -- 通道冻结单号 / 预授权单号
  release_id       VARCHAR(64),                    -- 退款单号
  forfeit_id       VARCHAR(64),                    -- 扣划/分账单号
  retry_count      INTEGER      NOT NULL DEFAULT 0,
  next_retry_at    TIMESTAMPTZ,                    -- 下次重试时间，paymentRetryJob 依据
  last_error       VARCHAR(512),
  held_at          TIMESTAMPTZ,
  released_at      TIMESTAMPTZ,
  forfeited_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_go_amount CHECK (amount > 0),
  CONSTRAINT ck_go_retry  CHECK (retry_count >= 0)
);

-- 一份报名单只允许一张保证金单
CREATE UNIQUE INDEX uq_go_registration ON guarantee_order(registration_id);
-- 通道单号唯一，防同一冻结单被重复落账
CREATE UNIQUE INDEX uq_go_channel_hold ON guarantee_order(payment_channel, channel_hold_id)
  WHERE channel_hold_id IS NOT NULL;
-- 重试任务扫描索引
CREATE INDEX idx_go_retry ON guarantee_order(next_retry_at)
  WHERE status IN ('RELEASING','FORFEIT_PENDING');
CREATE INDEX idx_go_status ON guarantee_order(status);

-- -----------------------------------------------------------------------------
-- 5. 支付流水（幂等核心表）
--    每一次与支付通道的交互都落一行，业务回调必须先在此表 INSERT，
--    ON CONFLICT DO NOTHING 决定"本次是否真正处理"，从数据库层杜绝重复入账。
-- -----------------------------------------------------------------------------
CREATE TABLE payment_attempt (
  id               VARCHAR(32)  PRIMARY KEY,
  guarantee_order_id VARCHAR(32) NOT NULL REFERENCES guarantee_order(id),
  kind             payment_attempt_kind NOT NULL,
  attempt_no       INTEGER      NOT NULL,
  channel          VARCHAR(32)  NOT NULL,
  channel_txn_id   VARCHAR(64),                    -- 通道侧流水号
  channel_event_id VARCHAR(128),                   -- 通道回调事件 ID（幂等键）
  idempotency_key  VARCHAR(128) NOT NULL,          -- 我方幂等键
  amount           INTEGER      NOT NULL,
  status           payment_attempt_status NOT NULL DEFAULT 'PENDING',
  raw_request      JSONB,
  raw_response     JSONB,
  error_code       VARCHAR(64),
  error_message    VARCHAR(512),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_pa_amount CHECK (amount > 0),
  CONSTRAINT ck_pa_attempt_no CHECK (attempt_no >= 1)
);

-- 幂等键全局唯一：同一 (kind, idempotency_key) 只成功写入一次
CREATE UNIQUE INDEX uq_pa_idempotency ON payment_attempt(kind, idempotency_key);
-- 通道事件唯一：防止同一回调 body 被处理多次
CREATE UNIQUE INDEX uq_pa_channel_event ON payment_attempt(channel, channel_event_id)
  WHERE channel_event_id IS NOT NULL;
CREATE UNIQUE INDEX uq_pa_channel_txn ON payment_attempt(channel, kind, channel_txn_id)
  WHERE channel_txn_id IS NOT NULL;
CREATE INDEX idx_pa_go ON payment_attempt(guarantee_order_id);

-- -----------------------------------------------------------------------------
-- 6. 爽约补偿分账明细
--    平台不截留：sum(amount) 必须等于被扣划保证金总额（余数给最早核销者）。
-- -----------------------------------------------------------------------------
CREATE TABLE forfeit_allocation (
  id                 VARCHAR(32) PRIMARY KEY,
  guarantee_order_id VARCHAR(32) NOT NULL REFERENCES guarantee_order(id),
  activity_id        VARCHAR(32) NOT NULL REFERENCES activity(id),
  beneficiary_reg_id VARCHAR(32) NOT NULL REFERENCES registration(id),  -- 到场受益人
  no_show_reg_id     VARCHAR(32) NOT NULL REFERENCES registration(id),  -- 被扣划的爽约单
  amount             INTEGER     NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_fa_amount CHECK (amount >= 0)
);
-- 同一张爽约单对同一受益人只分一次
CREATE UNIQUE INDEX uq_fa_pair ON forfeit_allocation(no_show_reg_id, beneficiary_reg_id);
CREATE INDEX idx_fa_go ON forfeit_allocation(guarantee_order_id);
CREATE INDEX idx_fa_activity ON forfeit_allocation(activity_id);

-- -----------------------------------------------------------------------------
-- 7. 信用流水（唯一约束保证同一事件只记一次）
-- -----------------------------------------------------------------------------
CREATE TABLE credit_ledger (
  id              VARCHAR(32)  PRIMARY KEY,
  user_id         VARCHAR(32)  NOT NULL REFERENCES app_user(id),
  registration_id VARCHAR(32)  REFERENCES registration(id),  -- INIT / ADMIN_ADJUST 可为空
  event_type      credit_event_type NOT NULL,
  -- delta        = 实际生效的变动值（after - before），对账公式唯一依据
  -- nominal_delta= 规则规定的名义变动值（如爽约固定 -10）；触底时会大于 |delta|
  --               申诉回滚按 -nominal_delta 加回，保证"原样撤销"
  delta           INTEGER      NOT NULL,
  nominal_delta   INTEGER      NOT NULL,
  before_score    INTEGER      NOT NULL,
  after_score     INTEGER      NOT NULL,
  reason          VARCHAR(255),
  operator        VARCHAR(64)  NOT NULL,   -- 'SYSTEM' / 'ADMIN:<id>'
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ck_cl_delta      CHECK (delta BETWEEN -120 AND 120),
  CONSTRAINT ck_cl_nominal    CHECK (nominal_delta BETWEEN -120 AND 120),
  CONSTRAINT ck_cl_before     CHECK (before_score BETWEEN 0 AND 120),
  CONSTRAINT ck_cl_after      CHECK (after_score BETWEEN 0 AND 120),
  -- 核心：delta 必须是钳制后的实际值，保证 sum(delta) 对账恒等
  CONSTRAINT ck_cl_math       CHECK (delta = after_score - before_score),
  -- 实际变动幅度不得超过名义幅度（钳制只会压缩，不会放大）
  CONSTRAINT ck_cl_clamped    CHECK (abs(delta) <= abs(nominal_delta))
);
-- 核心唯一键：同一报名单的同一事件只记一次
CREATE UNIQUE INDEX uq_cl_reg_event ON credit_ledger(registration_id, event_type)
  WHERE registration_id IS NOT NULL;
-- 用户级 INIT 只允许一次
CREATE UNIQUE INDEX uq_cl_init_user ON credit_ledger(user_id, event_type)
  WHERE event_type = 'INIT';
-- ADMIN_ADJUST 允许同一报名单多次，故用 id 兜底，不参与上面的唯一键
CREATE INDEX idx_cl_user_time ON credit_ledger(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 8. 审计日志（所有状态变更）
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id              BIGSERIAL    PRIMARY KEY,
  entity_type     VARCHAR(32)  NOT NULL,   -- registration / guarantee_order / credit_account / activity / appeal
  entity_id       VARCHAR(32)  NOT NULL,
  action          VARCHAR(64)  NOT NULL,   -- e.g. CHECKIN, CANCEL, RELEASE, FORFEIT, CREDIT_CHANGE
  from_state      VARCHAR(32),
  to_state        VARCHAR(32),
  reason          VARCHAR(255),
  operator_type   VARCHAR(16)  NOT NULL,   -- SYSTEM / HOST / USER / ADMIN
  operator_id     VARCHAR(32),
  payment_ref     VARCHAR(128),            -- 关联支付单号 / 通道流水号
  trace_id        VARCHAR(64),
  extra           JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_time   ON audit_log(created_at DESC);

-- -----------------------------------------------------------------------------
-- 9. 申诉
-- -----------------------------------------------------------------------------
CREATE TABLE appeal (
  id              VARCHAR(32)  PRIMARY KEY,
  registration_id VARCHAR(32)  NOT NULL REFERENCES registration(id),
  user_id         VARCHAR(32)  NOT NULL REFERENCES app_user(id),
  status          appeal_status NOT NULL DEFAULT 'SUBMITTED',
  evidence_urls   JSONB,                    -- 凭证图片
  statement       TEXT,                     -- 申诉说明
  review_note     VARCHAR(512),
  reviewed_by     VARCHAR(32)  REFERENCES app_user(id),
  reviewed_at     TIMESTAMPTZ,
  expire_at       TIMESTAMPTZ  NOT NULL,    -- 活动结束 + 24h，过期不可提
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- 同一报名单只允许一次申诉，也只允许回滚一次（业务上"只回滚一次"由 credit_ledger 唯一键兜底）
CREATE UNIQUE INDEX uq_appeal_reg ON appeal(registration_id);
CREATE INDEX idx_appeal_status ON appeal(status, created_at);

-- -----------------------------------------------------------------------------
-- 10. 通知（站内信 / 待发队列，异步任务用）
-- -----------------------------------------------------------------------------
CREATE TABLE notification (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     VARCHAR(32)  NOT NULL REFERENCES app_user(id),
  type        VARCHAR(48)  NOT NULL,
  payload     JSONB,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_noti_user ON notification(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 11. 定时任务执行记录（幂等 + 可观测）
-- -----------------------------------------------------------------------------
CREATE TABLE job_run (
  id          BIGSERIAL    PRIMARY KEY,
  job_name    VARCHAR(64)  NOT NULL,
  lock_key    VARCHAR(128),                -- 例如 no_show_finalize:{registration_id}
  status      VARCHAR(16)  NOT NULL,       -- RUNNING / SUCCESS / SKIPPED / FAILED
  affected    INTEGER      NOT NULL DEFAULT 0,
  error       TEXT,
  started_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
-- 同一 lock_key 同时只允许一个 RUNNING
CREATE UNIQUE INDEX uq_job_lock ON job_run(lock_key) WHERE status = 'RUNNING' AND lock_key IS NOT NULL;
CREATE INDEX idx_job_name_time ON job_run(job_name, started_at DESC);

-- =============================================================================
-- 附录 A：MySQL 8 差异
--   1) ENUM -> ENUM('A','B',...) 或 VARCHAR + CHECK。
--   2) 部分索引（WHERE 子句）不支持，需用"生成列 + 唯一索引"模拟：
--      ALTER TABLE registration ADD COLUMN active_flag TINYINT
--        GENERATED ALWAYS AS (CASE WHEN registration_status IN
--          ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','NO_SHOW') THEN 1 ELSE NULL END) STORED;
--      CREATE UNIQUE INDEX uq_reg_active ON registration(activity_id, user_id, active_flag);
--   3) TIMESTAMPTZ -> DATETIME(3) + 应用层统一 UTC。
--   4) JSONB -> JSON。
--   5) BIGSERIAL -> BIGINT AUTO_INCREMENT。
--
-- 附录 B：索引设计意图（对应验收标准）
--   uq_reg_active        -> 禁止同一活动重复报名（并发重复提交）
--   uq_go_registration   -> 一份报名单只有一张保证金单
--   uq_pa_idempotency    -> 验收 1：支付回调重复 10 次只入账一次
--   uq_pa_channel_event  -> 验收 1：通道重投同一事件被唯一约束拦截
--   uq_cl_reg_event      -> 验收 5、8：信用只扣一次、不重复加减
--   ck_cl_math           -> 验收 8：delta 恒等于实际差值，sum(delta) 对账不被钳制破坏
--   uq_fa_pair           -> 验收 6：分账不重复给同一受益人
--   idx_reg_checked_in   -> 验收 6：到场人数快速统计
--   uq_job_lock          -> 验收 5：定时任务重复执行被锁拦截
-- =============================================================================
