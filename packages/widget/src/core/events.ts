type EventMap = {
  open: [];
  close: [];
  message: [{ role: 'user' | 'assistant'; content: string }];
  error: [Error];
  ready: [];
};

type EventHandler<T extends unknown[]> = (...args: T) => void;

export class EventEmitter {
  private handlers: Map<string, Set<EventHandler<unknown[]>>> = new Map();

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const set = this.handlers.get(event)!;
    set.add(handler as EventHandler<unknown[]>);
    // Return unsubscribe function
    return () => set.delete(handler as EventHandler<unknown[]>);
  }

  emit<K extends keyof EventMap>(event: K, ...args: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[AgentForge] Event handler error (${event}):`, err);
      }
    }
  }

  removeAll(): void {
    this.handlers.clear();
  }
}
