-- =============================================
-- Migration 005: Fix chunks FTS trigger for locale codes
--
-- Root cause: app stores language as locale codes ('en', 'ko')
-- but the trigger cast them directly to regconfig, which expects
-- Postgres text search config names ('english', 'simple', etc.).
-- This caused: "text search configuration "en" does not exist"
-- and silently prevented all chunk inserts.
-- =============================================

-- Replace the trigger function with a safe locale-to-regconfig mapping
CREATE OR REPLACE FUNCTION chunks_fts_trigger()
RETURNS TRIGGER AS $$
DECLARE
  lang TEXT;
  cfg  REGCONFIG;
BEGIN
  lang := LOWER(COALESCE(NULLIF(TRIM(NEW.language), ''), 'en'));

  -- Map locale codes to Postgres text search configurations
  cfg := CASE
    WHEN lang = 'english' THEN 'english'::regconfig
    WHEN lang LIKE 'en%'  THEN 'english'::regconfig
    WHEN lang LIKE 'ko%'  THEN 'simple'::regconfig
    WHEN lang LIKE 'ja%'  THEN 'simple'::regconfig
    WHEN lang LIKE 'zh%'  THEN 'simple'::regconfig
    WHEN lang LIKE 'de%'  THEN 'german'::regconfig
    WHEN lang LIKE 'fr%'  THEN 'french'::regconfig
    WHEN lang LIKE 'es%'  THEN 'spanish'::regconfig
    WHEN lang LIKE 'pt%'  THEN 'portuguese'::regconfig
    WHEN lang LIKE 'it%'  THEN 'italian'::regconfig
    WHEN lang LIKE 'nl%'  THEN 'dutch'::regconfig
    WHEN lang LIKE 'ru%'  THEN 'russian'::regconfig
    WHEN lang LIKE 'sv%'  THEN 'swedish'::regconfig
    WHEN lang LIKE 'da%'  THEN 'danish'::regconfig
    WHEN lang LIKE 'fi%'  THEN 'finnish'::regconfig
    WHEN lang LIKE 'no%'  THEN 'norwegian'::regconfig
    WHEN lang LIKE 'tr%'  THEN 'turkish'::regconfig
    WHEN lang LIKE 'hu%'  THEN 'hungarian'::regconfig
    WHEN lang LIKE 'ro%'  THEN 'romanian'::regconfig
    ELSE 'simple'::regconfig  -- safe fallback for any unknown locale
  END;

  NEW.fts := to_tsvector(cfg, NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
