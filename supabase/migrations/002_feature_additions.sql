-- =============================================
-- Migration 002: Feature additions
-- Eval datasets, quotas, custom domains,
-- nightly eval tracking, rank_weight in search
-- =============================================

-- Add eval_dataset to agent_settings (#20)
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS eval_dataset JSONB DEFAULT '[]';

-- Add quota tracking to organizations (#33)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS quota_agents INT DEFAULT 5;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS quota_pages_per_agent INT DEFAULT 500;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS quota_messages_per_month INT DEFAULT 10000;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_month_messages INT DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'active'
  CHECK (billing_status IN ('active', 'suspended', 'cancelled'));

-- Add custom_domain to agents for subdomain/domain routing (#30)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN DEFAULT false;

-- Add previous_markdown to pages for content diff (#26)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS previous_markdown TEXT;

-- Index for custom domain lookups
CREATE INDEX IF NOT EXISTS idx_agents_custom_domain ON agents(custom_domain) WHERE custom_domain IS NOT NULL;

-- Updated hybrid_search with rank_weight support (#11)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding VECTOR(768),
  query_text TEXT,
  match_agent_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 8,
  keyword_weight FLOAT DEFAULT 0.3,
  semantic_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  page_id UUID,
  content TEXT,
  snippet TEXT,
  heading_path TEXT,
  language TEXT,
  similarity FLOAT,
  keyword_rank FLOAT,
  combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT
      c.id,
      c.page_id,
      c.content,
      c.snippet,
      c.heading_path,
      c.language,
      c.rank_weight,
      (1 - (c.embedding <=> query_embedding)) AS sim_score
    FROM chunks c
    WHERE c.agent_id = match_agent_id
      AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword AS (
    SELECT
      c.id,
      ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) AS kw_rank
    FROM chunks c
    WHERE c.agent_id = match_agent_id
      AND c.fts @@ websearch_to_tsquery('english', query_text)
    LIMIT match_count * 2
  )
  SELECT
    s.id,
    s.page_id,
    s.content,
    s.snippet,
    s.heading_path,
    s.language,
    s.sim_score AS similarity,
    COALESCE(k.kw_rank, 0.0)::FLOAT AS keyword_rank,
    ((semantic_weight * s.sim_score + keyword_weight * COALESCE(k.kw_rank, 0.0)) * COALESCE(s.rank_weight, 1.0))::FLOAT AS combined_score
  FROM semantic s
  LEFT JOIN keyword k ON k.id = s.id
  ORDER BY ((semantic_weight * s.sim_score + keyword_weight * COALESCE(k.kw_rank, 0.0)) * COALESCE(s.rank_weight, 1.0)) DESC
  LIMIT match_count;
END;
$$;

-- Analytics helper functions

-- Get chat stats for an agent
CREATE OR REPLACE FUNCTION get_agent_analytics(
  p_agent_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  total_conversations BIGINT,
  total_messages BIGINT,
  avg_confidence FLOAT,
  low_confidence_count BIGINT,
  unique_sessions BIGINT,
  messages_by_day JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT NOW() - (p_days || ' days')::INTERVAL AS start_date
  ),
  conv_stats AS (
    SELECT
      COUNT(DISTINCT c.id) AS total_convs,
      COUNT(DISTINCT c.session_id) AS unique_sess
    FROM conversations c, date_range d
    WHERE c.agent_id = p_agent_id
      AND c.created_at >= d.start_date
  ),
  msg_stats AS (
    SELECT
      COUNT(*) AS total_msgs,
      AVG(m.confidence) FILTER (WHERE m.confidence IS NOT NULL) AS avg_conf,
      COUNT(*) FILTER (WHERE m.confidence IS NOT NULL AND m.confidence < 0.4) AS low_conf
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN date_range d ON TRUE
    WHERE c.agent_id = p_agent_id
      AND m.role = 'assistant'
      AND m.created_at >= d.start_date
  ),
  daily AS (
    SELECT jsonb_agg(
      jsonb_build_object('date', day::DATE, 'count', cnt)
      ORDER BY day
    ) AS by_day
    FROM (
      SELECT DATE_TRUNC('day', m.created_at) AS day, COUNT(*) AS cnt
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN date_range d ON TRUE
      WHERE c.agent_id = p_agent_id
        AND m.created_at >= d.start_date
      GROUP BY DATE_TRUNC('day', m.created_at)
    ) sub
  )
  SELECT
    cs.total_convs,
    ms.total_msgs,
    ms.avg_conf::FLOAT,
    ms.low_conf,
    cs.unique_sess,
    COALESCE(d.by_day, '[]'::JSONB)
  FROM conv_stats cs, msg_stats ms, daily d;
END;
$$;

-- RLS for new columns (already covered by existing agent policies)
