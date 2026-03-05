-- =============================================
-- Migration 003: Usage event type expansion
-- Adds `agent_created` for lifecycle analytics.
-- =============================================

ALTER TABLE usage_events
  DROP CONSTRAINT IF EXISTS usage_events_event_type_check;

ALTER TABLE usage_events
  ADD CONSTRAINT usage_events_event_type_check
  CHECK (event_type IN ('chat', 'crawl', 'embed', 'share_view', 'agent_created'));
