'use client';

import { useCallback, useState } from 'react';
import type { Agent } from '@/types';

export function useAgent(agentId?: string) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${id}`);
      if (!response.ok) throw new Error('Failed to fetch agent');
      const data = await response.json();
      setAgent(data.agent);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateAgent = useCallback(
    async (updates: Partial<Pick<Agent, 'name' | 'description' | 'visibility'>> & { settings?: Record<string, unknown> }) => {
      const id = agentId || agent?.id;
      if (!id) return null;

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/agents/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update agent');
        const data = await response.json();
        setAgent(data.agent);
        return data.agent;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [agentId, agent?.id]
  );

  const deleteAgent = useCallback(
    async (id?: string) => {
      const targetId = id || agentId || agent?.id;
      if (!targetId) return false;

      setLoading(true);
      try {
        const response = await fetch(`/api/agents/${targetId}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete agent');
        setAgent(null);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [agentId, agent?.id]
  );

  const reCrawl = useCallback(
    async (id?: string) => {
      const targetId = id || agentId || agent?.id;
      if (!targetId) return false;

      setLoading(true);
      try {
        const response = await fetch('/api/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: targetId }),
        });
        if (!response.ok) throw new Error('Failed to start re-crawl');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [agentId, agent?.id]
  );

  return {
    agent,
    loading,
    error,
    fetchAgent,
    updateAgent,
    deleteAgent,
    reCrawl,
  };
}
