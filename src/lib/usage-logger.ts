import { createServiceClient } from '@/lib/supabase/server';

export type UsageEventType = 'chat' | 'crawl' | 'embed' | 'share_view' | 'agent_created';

export interface UsageEventData {
  agent_id: string;
  event_type: UsageEventType;
  metadata?: Record<string, unknown>;
}

export interface AuditLogData {
  user_id?: string | null;
  agent_id?: string | null;
  action: string;
  details?: Record<string, unknown>;
  ip_address?: string;
}

/**
 * Record a usage event. Fire-and-forget — errors are logged but not thrown.
 */
export async function recordUsageEvent(data: UsageEventData): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('usage_events').insert({
      agent_id: data.agent_id,
      event_type: data.event_type,
      metadata: data.metadata || {},
    });
  } catch (error) {
    console.error('Failed to record usage event:', error);
  }
}

/**
 * Record an audit log entry. Fire-and-forget.
 */
export async function recordAuditLog(data: AuditLogData): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('audit_logs').insert({
      user_id: data.user_id || null,
      agent_id: data.agent_id || null,
      action: data.action,
      details: data.details || {},
      ip_address: data.ip_address || null,
    });
  } catch (error) {
    console.error('Failed to record audit log:', error);
  }
}

/**
 * Batch record multiple usage events.
 */
export async function recordUsageEventsBatch(events: UsageEventData[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const supabase = createServiceClient();
    await supabase.from('usage_events').insert(
      events.map((e) => ({
        agent_id: e.agent_id,
        event_type: e.event_type,
        metadata: e.metadata || {},
      }))
    );
  } catch (error) {
    console.error('Failed to batch record usage events:', error);
  }
}
