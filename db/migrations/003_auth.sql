-- ============================================================
-- 真实用户认证：密码 + Session + 角色 + 帖子审核 + 版块关注
-- ============================================================

-- 用户：密码摘要、角色、状态
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS password_hash VARCHAR(200);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'USER';
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_emoji VARCHAR(8) NOT NULL DEFAULT '🧑‍🌾';
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_role ON app_user(role);

-- Session：只存 token 摘要
CREATE TABLE IF NOT EXISTS user_session (
  id            VARCHAR(32) PRIMARY KEY,
  user_id       VARCHAR(32) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_digest  CHAR(64) NOT NULL UNIQUE,
  user_agent    VARCHAR(255),
  ip            VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_session_user ON user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_expire ON user_session(expires_at) WHERE revoked_at IS NULL;

-- 帖子审核：PENDING / PUBLISHED / REJECTED
ALTER TABLE circle_post ADD COLUMN IF NOT EXISTS review_status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE circle_post ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(32);
ALTER TABLE circle_post ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE circle_post ADD COLUMN IF NOT EXISTS reject_reason VARCHAR(200);
CREATE INDEX IF NOT EXISTS idx_cp_review ON circle_post(review_status, created_at DESC);

-- 版块关注
CREATE TABLE IF NOT EXISTS circle_follow (
  user_id       VARCHAR(32) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  board_id      VARCHAR(32) NOT NULL REFERENCES circle_board(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_id)
);
