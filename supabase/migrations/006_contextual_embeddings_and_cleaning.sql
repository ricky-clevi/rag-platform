-- =============================================
-- Migration 006: Contextual embeddings, change detection,
-- and extraction metadata
-- =============================================

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS synopsis TEXT,
  ADD COLUMN IF NOT EXISTS change_summary JSONB,
  ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'readability'
    CHECK (extraction_method IN ('readability', 'cheerio', 'llm'));

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS context_prefix TEXT;

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
    ((semantic_weight * s.sim_score + keyword_weight * COALESCE(k.kw_rank, 0.0)) * COALESCE(s.rank_weight, 1.0))::FLOAT AS combined_score
  FROM semantic s
  LEFT JOIN keyword k ON k.id = s.id
  ORDER BY ((semantic_weight * s.sim_score + keyword_weight * COALESCE(k.kw_rank, 0.0)) * COALESCE(s.rank_weight, 1.0)) DESC
  LIMIT match_count;
END;
$$;
