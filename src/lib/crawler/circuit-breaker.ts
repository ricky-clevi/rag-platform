export class CircuitBreaker {
  private consecutiveFailures = 0;
  private totalFailures = 0;
  private isOpen = false;
  private lastFailureTime = 0;

  constructor(
    private readonly maxConsecutiveFailures: number = 10,
    private readonly resetTimeMs: number = 30000, // 30 seconds
    private readonly onOpen?: (totalFailures: number) => void
  ) {}

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.isOpen = false;
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.maxConsecutiveFailures && !this.isOpen) {
      this.isOpen = true;
      this.onOpen?.(this.totalFailures);
    }
  }

  canProceed(): boolean {
    if (!this.isOpen) return true;

    // Auto-reset after cooldown period
    if (Date.now() - this.lastFailureTime > this.resetTimeMs) {
      this.isOpen = false;
      this.consecutiveFailures = 0;
      return true;
    }

    return false;
  }

  get stats() {
    return {
      consecutiveFailures: this.consecutiveFailures,
      totalFailures: this.totalFailures,
      isOpen: this.isOpen,
    };
  }
}
