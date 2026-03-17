import { AgentForgeClient } from './client';
import { AgentConfig } from '../types';

const JTI_STORAGE_KEY = (agentId: string) => `af_widget_${agentId}_jti`;
const AGENT_ID_STORAGE_KEY = (apiKey: string) => `af_widget_${apiKey}_agent_id`;
const LEGACY_JTI_STORAGE_KEY = (apiKey: string) =>
  `af_widget_key_${apiKey.slice(0, 12)}_jti`;

export class SessionManager {
  private client: AgentForgeClient;
  private agentConfig: AgentConfig | null = null;
  private apiKey: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.client = new AgentForgeClient({ apiKey, baseUrl });
  }

  private getExistingJti(): string | undefined {
    try {
      const storedAgentId = localStorage.getItem(AGENT_ID_STORAGE_KEY(this.apiKey));
      if (storedAgentId) {
        const canonicalJti = localStorage.getItem(JTI_STORAGE_KEY(storedAgentId));
        if (canonicalJti) {
          return canonicalJti;
        }
      }

      const legacyJti = localStorage.getItem(LEGACY_JTI_STORAGE_KEY(this.apiKey));
      return legacyJti || undefined;
    } catch {
      return undefined;
    }
  }

  private persistSession(agentId: string, sessionJti: string): void {
    try {
      localStorage.setItem(AGENT_ID_STORAGE_KEY(this.apiKey), agentId);
      localStorage.setItem(JTI_STORAGE_KEY(agentId), sessionJti);
      localStorage.removeItem(LEGACY_JTI_STORAGE_KEY(this.apiKey));
    } catch {
      // localStorage not available
    }
  }

  async initialize(): Promise<AgentConfig> {
    const existingJti = this.getExistingJti();
    const { agentConfig, sessionJti } = await this.client.initSession(existingJti);
    this.agentConfig = agentConfig;
    this.persistSession(agentConfig.id, sessionJti);

    return agentConfig;
  }

  getClient(): AgentForgeClient {
    return this.client;
  }

  getAgentConfig(): AgentConfig | null {
    return this.agentConfig;
  }

  destroy(): void {
    // Cleanup if needed
    this.agentConfig = null;
  }
}
