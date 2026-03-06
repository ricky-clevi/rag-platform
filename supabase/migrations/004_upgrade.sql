-- =============================================
-- Migration 004: Sprint 6 — Production polish
-- Feedback, conversation summary, structured data,
-- company profile, and performance indexes
-- =============================================

-- Sprint 5: Feedback on messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback TEXT
  CHECK (feedback IS NULL OR feedback IN ('positive', 'negative'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback_text TEXT;

-- Sprint 3: Conversation summary for memory management
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT;

-- Sprint 1: Structured data from crawled pages
ALTER TABLE pages ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT '{}';

-- Sprint 5: Company profile in agent settings
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS company_profile JSONB DEFAULT '{}';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks(content_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_agent_content_hash ON chunks(agent_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_pages_agent_status ON pages(agent_id, crawl_status);
CREATE INDEX IF NOT EXISTS idx_messages_feedback ON messages(conversation_id, feedback) WHERE feedback IS NOT NULL;

-- Usage events index for analytics queries
CREATE INDEX IF NOT EXISTS idx_usage_events_type_created ON usage_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_agent_type ON usage_events(agent_id, event_type, created_at);
