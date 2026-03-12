-- =============================================
-- Migration 007: Advanced retrieval, crawl options,
-- quality scoring, and similar-agent search
-- =============================================

ALTER TABLE agent_settings
  ADD COLUMN IF NOT EXISTS crawl_options JSONB DEFAULT '{}'::jsonb;

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 1.0;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS embedding VECTOR(768);

CREATE INDEX IF NOT EXISTS idx_agents_embedding
  ON agents USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_quality_score
  ON chunks(agent_id, quality_score);

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
  context_prefix TEXT,
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
      c.context_prefix,
      c.rank_weight,
      c.quality_score,
      (1 - (c.embedding <=> query_embedding)) AS sim_score
    FROM chunks c
    WHERE c.agent_id = match_agent_id
      AND (1 - (c.embedding <=> query_embedding)) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  keyword AS (
    SELECT
      c.id,
      ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) AS kw_rank
    FROM chunks c
    WHERE c.agent_id = match_agent_id
      AND c.fts @@ websearch_to_tsquery('english', query_text)
    LIMIT match_count * 3
  )
  SELECT
    s.id,
    s.page_id,
    s.content,
    s.snippet,
    s.heading_path,
    s.language,
    s.context_prefix,
    s.sim_score AS similarity,
    COALESCE(k.kw_rank, 0.0)::FLOAT AS keyword_rank,
    (
      (
        semantic_weight * s.sim_score
        + keyword_weight * COALESCE(k.kw_rank, 0.0)
      )
      * COALESCE(s.rank_weight, 1.0)
      * COALESCE(s.quality_score, 1.0)
    )::FLOAT AS combined_score
  FROM semantic s
  LEFT JOIN keyword k ON k.id = s.id
  ORDER BY (
    (
      semantic_weight * s.sim_score
      + keyword_weight * COALESCE(k.kw_rank, 0.0)
    )
    * COALESCE(s.rank_weight, 1.0)
    * COALESCE(s.quality_score, 1.0)
  ) DESC
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION find_similar_agents(
  p_agent_id UUID,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  description TEXT,
  root_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  source_embedding VECTOR(768);
BEGIN
  SELECT embedding INTO source_embedding
  FROM agents
  WHERE agents.id = p_agent_id;

  IF source_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.slug,
    a.name,
    a.description,
    a.root_url,
    (1 - (a.embedding <=> source_embedding))::FLOAT AS similarity
  FROM agents a
  WHERE a.id <> p_agent_id
    AND a.status = 'ready'
    AND a.visibility = 'public'
    AND a.embedding IS NOT NULL
  ORDER BY a.embedding <=> source_embedding
  LIMIT p_match_count;
END;
$$;
