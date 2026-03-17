import { ChatMessage } from '../types';

const CONV_KEY = (agentId: string) => `af_widget_${agentId}_conv`;
const MSGS_KEY = (agentId: string) => `af_widget_${agentId}_msgs`;

export class ConversationStorage {
  private agentId: string;
  private persist: boolean;

  constructor(agentId: string, persist: boolean = false) {
    this.agentId = agentId;
    this.persist = persist;
  }

  getConversationId(): string | null {
    try {
      // Check sessionStorage first (current tab)
      const sessionVal = sessionStorage.getItem(CONV_KEY(this.agentId));
      if (sessionVal) return sessionVal;

      // If persist mode, also check localStorage
      if (this.persist) {
        const localVal = localStorage.getItem(CONV_KEY(this.agentId));
        if (localVal) {
          // Copy to sessionStorage for this tab
          sessionStorage.setItem(CONV_KEY(this.agentId), localVal);
          return localVal;
        }
      }
    } catch {
      // Storage not available
    }
    return null;
  }

  setConversationId(conversationId: string): void {
    try {
      sessionStorage.setItem(CONV_KEY(this.agentId), conversationId);
      if (this.persist) {
        localStorage.setItem(CONV_KEY(this.agentId), conversationId);
      }
    } catch {
      // Storage not available
    }
  }

  getMessages(): ChatMessage[] {
    try {
      const raw = sessionStorage.getItem(MSGS_KEY(this.agentId));
      if (raw) return JSON.parse(raw);

      if (this.persist) {
        const localRaw = localStorage.getItem(MSGS_KEY(this.agentId));
        if (localRaw) {
          sessionStorage.setItem(MSGS_KEY(this.agentId), localRaw);
          return JSON.parse(localRaw);
        }
      }
    } catch {
      // Parse error or storage not available
    }
    return [];
  }

  setMessages(messages: ChatMessage[]): void {
    try {
      const raw = JSON.stringify(messages);
      sessionStorage.setItem(MSGS_KEY(this.agentId), raw);
      if (this.persist) {
        localStorage.setItem(MSGS_KEY(this.agentId), raw);
      }
    } catch {
      // Storage not available
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(CONV_KEY(this.agentId));
      sessionStorage.removeItem(MSGS_KEY(this.agentId));
      if (this.persist) {
        localStorage.removeItem(CONV_KEY(this.agentId));
        localStorage.removeItem(MSGS_KEY(this.agentId));
      }
    } catch {
      // Storage not available
    }
  }
}
