-- ============================================================
-- 博客 / 内容营销：文章 + 分类 + 关联活动
-- ============================================================
CREATE TABLE IF NOT EXISTS blog_category (
  id            VARCHAR(32) PRIMARY KEY,
  name          VARCHAR(32) NOT NULL,
  slug          VARCHAR(48) NOT NULL UNIQUE,
  description   VARCHAR(200),
  sort_no       INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blog_post (
  id            VARCHAR(32) PRIMARY KEY,
  slug          VARCHAR(120) NOT NULL UNIQUE,
  category_id   VARCHAR(32) NOT NULL REFERENCES blog_category(id),
  author_id     VARCHAR(32) NOT NULL REFERENCES app_user(id),
  title         VARCHAR(150) NOT NULL,
  summary       VARCHAR(300),
  content       TEXT        NOT NULL,
  cover_emoji   VARCHAR(8)  NOT NULL DEFAULT '🏔️',
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  -- SEO
  seo_title     VARCHAR(150),
  seo_description VARCHAR(300),
  keywords      VARCHAR(300),
  -- 状态
  status        VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  is_featured   BOOLEAN     NOT NULL DEFAULT false,
  read_count    INTEGER     NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bp_pub ON blog_post(published_at DESC) WHERE status='PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_bp_cat ON blog_post(category_id, published_at DESC) WHERE status='PUBLISHED';

-- 文章关联活动（内容到报名的转化闭环）
CREATE TABLE IF NOT EXISTS blog_post_activity (
  post_id       VARCHAR(32) NOT NULL REFERENCES blog_post(id) ON DELETE CASCADE,
  activity_id   VARCHAR(32) NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, activity_id)
);

INSERT INTO blog_category(id,name,slug,description,sort_no) VALUES
 ('bc_knowledge','户外知识','knowledge','体能、安全、天气、野外常识',1),
 ('bc_gear','装备评测','gear','真实使用反馈，不吹不黑',2),
 ('bc_route','路线攻略','route','怎么走、走多久、哪里补给',3),
 ('bc_story','平台故事','story','我们为什么做组局',4)
ON CONFLICT (id) DO NOTHING;
