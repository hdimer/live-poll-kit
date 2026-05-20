-- Live poll schema
-- Run this in the Neon SQL Editor (or any Postgres database)
-- Requires Postgres 13+ for gen_random_uuid()

CREATE TABLE IF NOT EXISTS poll_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES poll_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'presenter' CHECK (mode IN ('presenter', 'auto')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES poll_events(id) ON DELETE CASCADE,
  group_id UUID REFERENCES poll_groups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('poll', 'wordcloud')),
  question TEXT NOT NULL,
  options JSONB,
  active BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poll_groups_event ON poll_groups(event_id);
CREATE INDEX IF NOT EXISTS idx_poll_questions_group ON poll_questions(group_id);
CREATE INDEX IF NOT EXISTS idx_poll_questions_event ON poll_questions(event_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_question ON poll_responses(question_id);
