/**
 * Task Planner & Orchestrator for Aurelia Android AI Agent.
 * Converts natural-language requests into ordered atomic steps, handles clarifying questions,
 * manages cross-app context and follow-up commands ("now send it", "cancel that").
 */

import {ActionPayload, sendReplyTurn} from '../api/client';
import {ActionExecutor, StepExecutionResult} from './ActionExecutor';
import {AppSkillRegistry} from './AppSkillRegistry';
import {ExecutionLog} from './ExecutionLog';
import {requestTaskPermission, RequiredPermission} from '../permissionsManager';

export type TaskPlanStatus = 'idle' | 'planning' | 'executing' | 'awaiting_clarification' | 'awaiting_confirmation' | 'paused_security' | 'completed' | 'failed' | 'aborted';

export type TaskPlannerListener = (state: {
  status: TaskPlanStatus;
  currentTaskTitle: string;
  clarificationQuestion?: string;
  pendingConfirmation?: {
    description: string;
    preview?: Record<string, string>;
    action: ActionPayload;
  };
  lastMessage?: string;
}) => void;

class TaskPlannerManager {
  private status: TaskPlanStatus = 'idle';
  private currentTaskTitle = '';
  private clarificationQuestion?: string;
  private pendingConfirmationAction?: ActionPayload;
  private pendingConfirmationDetails?: {description: string; preview?: Record<string, string>};
  private lastMessage = '';
  private listeners: TaskPlannerListener[] = [];
  private currentStepIndex = 0;
  private taskHistoryContext: Array<{userPrompt: string; actionTaken: ActionPayload; resultMessage: string}> = [];

  public getStatus() {
    return this.status;
  }

  public subscribe(listener: TaskPlannerListener) {
    this.listeners.push(listener);
    this.emitState();
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emitState() {
    const state = {
      status: this.status,
      currentTaskTitle: this.currentTaskTitle,
      clarificationQuestion: this.clarificationQuestion,
      pendingConfirmation: this.pendingConfirmationAction
        ? {
            description: this.pendingConfirmationDetails?.description || 'Confirm action',
            preview: this.pendingConfirmationDetails?.preview,
            action: this.pendingConfirmationAction,
          }
        : undefined,
      lastMessage: this.lastMessage,
    };
    this.listeners.forEach(l => l(state));
  }

  /**
   * Main entry point: Process natural language prompt (typed or spoken).
   */
  public async executeTask(userPrompt: string, confirmed = false): Promise<void> {
    const trimmed = userPrompt.trim();
    if (!trimmed) return;

    // Handle follow-up commands like "cancel that" or "stop"
    if (['cancel', 'cancel that', 'stop', 'abort'].includes(trimmed.toLowerCase())) {
      ActionExecutor.abortActiveExecution();
      this.status = 'aborted';
      this.lastMessage = 'Task cancelled by user.';
      this.emitState();
      return;
    }

    this.currentTaskTitle = trimmed;
    this.status = 'planning';
    this.lastMessage = `Planning task: "${trimmed}"`;
    this.emitState();
    ActionExecutor.resetAbortState();

    // 1. Contextual Permission Check based on prompt keywords
    await this.ensurePermissionsForPrompt(trimmed);

    // 2. Call backend LLM brain for step plan
    try {
      const sessionId = 'agent_session_' + Date.now();
      const response = await sendReplyTurn(trimmed, sessionId, [], false);

      this.lastMessage = response.reply_text;
      const action = response.action as ActionPayload;

      // 3. Handle Clarifying Question
      if (action.type === 'ask_clarification') {
        this.status = 'awaiting_clarification';
        this.clarificationQuestion = (action as any).question || response.reply_text;
        this.emitState();
        return;
      }

      // 4. Resolve Skill Handler step plan
      const stepSequence = AppSkillRegistry.resolveStepPlan(action);
      this.status = 'executing';
      this.currentStepIndex = 1;
      this.emitState();

      // 5. Execute step sequence
      for (const stepAction of stepSequence) {
        const stepResult: StepExecutionResult = await ActionExecutor.executeAtomicStep(
          this.currentTaskTitle,
          this.currentStepIndex,
          stepAction,
          confirmed
        );

        if (stepResult.aborted) {
          this.status = 'aborted';
          this.lastMessage = 'Task aborted by user.';
          this.emitState();
          return;
        }

        if (stepResult.awaitingConfirmation) {
          this.status = 'awaiting_confirmation';
          this.pendingConfirmationAction = stepAction;
          this.pendingConfirmationDetails = {
            description: stepResult.message,
          };
          this.emitState();
          return;
        }

        if (stepResult.pausedForSecurity) {
          this.status = 'paused_security';
          this.lastMessage = stepResult.message;
          this.emitState();
          return;
        }

        if (!stepResult.ok) {
          this.status = 'failed';
          this.lastMessage = `Step ${this.currentStepIndex} failed: ${stepResult.message}`;
          this.emitState();
          return;
        }

        this.taskHistoryContext.push({
          userPrompt: trimmed,
          actionTaken: stepAction,
          resultMessage: stepResult.message,
        });

        this.currentStepIndex++;
      }

      this.status = 'completed';
      this.lastMessage = response.reply_text || 'Task completed successfully.';
      this.emitState();
    } catch (e: any) {
      this.status = 'failed';
      this.lastMessage = e?.message || 'Task planning failed.';
      this.emitState();
    }
  }

  public async confirmPendingAction(): Promise<void> {
    if (this.pendingConfirmationAction) {
      const actionToRun = this.pendingConfirmationAction;
      this.pendingConfirmationAction = undefined;
      this.pendingConfirmationDetails = undefined;
      await this.executeTask(this.currentTaskTitle, true);
    }
  }

  public rejectPendingAction(): void {
    this.pendingConfirmationAction = undefined;
    this.pendingConfirmationDetails = undefined;
    this.status = 'aborted';
    this.lastMessage = 'Action cancelled by user.';
    this.emitState();
  }

  private async ensurePermissionsForPrompt(prompt: string) {
    const lower = prompt.toLowerCase();
    const checks: Array<{keywords: string[]; perm: RequiredPermission}> = [
      {keywords: ['call', 'dial', 'phone'], perm: 'phone'},
      {keywords: ['sms', 'message', 'text'], perm: 'sms'},
      {keywords: ['email', 'mail', 'gmail'], perm: 'storage'},
      {keywords: ['contact', 'number'], perm: 'contacts'},
      {keywords: ['calendar', 'event', 'meeting'], perm: 'calendar'},
      {keywords: ['photo', 'camera', 'picture'], perm: 'camera'},
      {keywords: ['location', 'directions', 'navigate', 'map', 'job'], perm: 'location'},
    ];

    for (const item of checks) {
      if (item.keywords.some(k => lower.includes(k))) {
        await requestTaskPermission(item.perm);
      }
    }
  }
}

export const TaskPlanner = new TaskPlannerManager();
