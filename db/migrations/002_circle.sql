-- ============================================================
-- 圈子（论坛）：版块 / 帖子 / 回复 / 点赞
-- ============================================================
CREATE TABLE IF NOT EXISTS circle_board (
  id            VARCHAR(32) PRIMARY KEY,
  name          VARCHAR(32) NOT NULL,
  slug          VARCHAR(32) NOT NULL UNIQUE,
  emoji         VARCHAR(8)  NOT NULL DEFAULT '💬',
  description   VARCHAR(200),
  sort_no       INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS circle_post (
  id            VARCHAR(32) PRIMARY KEY,
  board_id      VARCHAR(32) NOT NULL REFERENCES circle_board(id),
  author_id     VARCHAR(32) NOT NULL REFERENCES app_user(id),
  title         VARCHAR(120) NOT NULL,
  content       TEXT        NOT NULL,
  activity_id   VARCHAR(32) REFERENCES activity(id),
  like_count    INTEGER     NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  reply_count   INTEGER     NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  is_pinned     BOOLEAN     NOT NULL DEFAULT false,
  status        VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_board ON circle_post(board_id, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_created ON circle_post(created_at DESC);

CREATE TABLE IF NOT EXISTS circle_reply (
  id            VARCHAR(32) PRIMARY KEY,
  post_id       VARCHAR(32) NOT NULL REFERENCES circle_post(id) ON DELETE CASCADE,
  author_id     VARCHAR(32) NOT NULL REFERENCES app_user(id),
  content       TEXT        NOT NULL,
  parent_id     VARCHAR(32) REFERENCES circle_reply(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_post ON circle_reply(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS circle_like (
  post_id       VARCHAR(32) NOT NULL REFERENCES circle_post(id) ON DELETE CASCADE,
  user_id       VARCHAR(32) NOT NULL REFERENCES app_user(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

INSERT INTO circle_board(id,name,slug,emoji,description,sort_no) VALUES
 ('bd_outdoor','户外畅聊','outdoor','🏔️','路线、装备、天气，出发前的一切讨论',1),
 ('bd_partner','找搭子','partner','🤝','招人、拼车、组队，缺一个怎样的你',2),
 ('bd_gear','装备讨论','gear','🎒','踩过的坑和真香款，都值得被记录',3),
 ('bd_after','活动回顾','after','📸','复盘一场好局，留下照片和故事',4),
 ('bd_city','城市生活','city','🌆','下班后的第二生活，不止户外',5)
ON CONFLICT (id) DO NOTHING;
