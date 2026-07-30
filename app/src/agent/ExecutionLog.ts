/**
 * Execution Log Manager for Aurelia Android AI Agent.
 * Maintains a persistent, user-reviewable log of all actions taken by the agent.
 */

export type ExecutionStepLog = {
  id: string;
  timestamp: number;
  taskTitle: string;
  stepIndex: number;
  actionType: string;
  targetApp?: string;
  details: string;
  status: 'pending' | 'success' | 'failed' | 'paused' | 'aborted' | 'awaiting_confirmation';
  error?: string;
};

class ExecutionLogManager {
  private logs: ExecutionStepLog[] = [];
  private listeners: Array<(logs: ExecutionStepLog[]) => void> = [];

  public logStep(entry: Omit<ExecutionStepLog, 'id' | 'timestamp'>): ExecutionStepLog {
    const fullEntry: ExecutionStepLog = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    this.logs = [fullEntry, ...this.logs].slice(0, 200);
    this.notify();
    return fullEntry;
  }

  public updateStepStatus(
    id: string,
    status: ExecutionStepLog['status'],
    error?: string,
    updatedDetails?: string
  ) {
    const step = this.logs.find(l => l.id === id);
    if (step) {
      step.status = status;
      if (error) step.error = error;
      if (updatedDetails) step.details = updatedDetails;
      this.notify();
    }
  }

  public getLogs(): ExecutionStepLog[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    this.notify();
  }

  public subscribe(listener: (logs: ExecutionStepLog[]) => void): () => void {
    this.listeners.push(listener);
    listener([...this.logs]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    const snapshot = [...this.logs];
    this.listeners.forEach(l => l(snapshot));
  }
}

export const ExecutionLog = new ExecutionLogManager();
