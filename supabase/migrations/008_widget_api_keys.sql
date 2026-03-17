-- =============================================
-- Migration 008: Widget API keys & sessions
-- Embeddable chat widget support with public
-- API keys, session management, and origin control.
-- =============================================

-- =============================================
-- Table: widget_api_keys
-- =============================================

CREATE TABLE widget_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL UNIQUE,
  label TEXT,
  allowed_origins TEXT[] DEFAULT '{}',
  rate_limit_per_minute INT DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_widget_api_keys_public_key ON widget_api_keys(public_key);

-- Reuse the existing update_updated_at trigger function
CREATE TRIGGER update_widget_api_keys_updated_at
  BEFORE UPDATE ON widget_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Table: widget_sessions
-- =============================================

CREATE TABLE widget_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES widget_api_keys(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  session_jti TEXT NOT NULL UNIQUE,
  origin TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_widget_sessions_session_token ON widget_sessions(session_token);
CREATE INDEX idx_widget_sessions_session_jti ON widget_sessions(session_jti);
CREATE INDEX idx_widget_sessions_expires_at ON widget_sessions(expires_at);
CREATE INDEX idx_widget_sessions_agent_id ON widget_sessions(agent_id);

-- =============================================
-- Usage events: expand allowed event types
-- =============================================

ALTER TABLE usage_events
  DROP CONSTRAINT IF EXISTS usage_events_event_type_check;

ALTER TABLE usage_events
  ADD CONSTRAINT usage_events_event_type_check
  CHECK (event_type IN ('chat', 'crawl', 'embed', 'share_view', 'agent_created', 'widget_chat', 'widget_session'));

-- =============================================
-- RLS: widget_api_keys
-- =============================================

ALTER TABLE widget_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent owners can view widget keys"
  ON widget_api_keys FOR SELECT
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

CREATE POLICY "Agent owners can create widget keys"
  ON widget_api_keys FOR INSERT
  WITH CHECK (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

CREATE POLICY "Agent owners can update widget keys"
  ON widget_api_keys FOR UPDATE
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

CREATE POLICY "Agent owners can delete widget keys"
  ON widget_api_keys FOR DELETE
  USING (agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid()));

-- =============================================
-- RLS: widget_sessions (service role only)
-- =============================================

ALTER TABLE widget_sessions ENABLE ROW LEVEL SECURITY;
-- No user-facing policies — only the service role can access widget_sessions.
