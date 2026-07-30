/**
 * Action Executor for Aurelia Android AI Agent.
 * Bridges atomic step payloads to native Android Intents or Accessibility gestures,
 * enforcing confirmation gates and monitoring the floating overlay STOP control.
 */

import {NativeModules} from 'react-native';
import {ActionPayload} from '../api/client';
import {Accessibility} from '../automation/Accessibility';
import {DeviceControl} from '../automation/DeviceControl';
import {MessagingUtility} from '../automation/MessagingUtility';
import {executeAction, AutomationResult} from '../automation/taskAutomation';
import {ExecutionLog} from './ExecutionLog';
import {SafetyGate} from './SafetyGate';
import {StateVerifier} from './StateVerifier';

const OverlayNative = NativeModules.OverlayModule;

export type StepExecutionResult = {
  ok: boolean;
  message: string;
  aborted?: boolean;
  pausedForSecurity?: boolean;
  awaitingConfirmation?: boolean;
  newLayoutJson?: string;
};

class ActionExecutorManager {
  private isAborted = false;

  constructor() {
    // Listen for STOP button taps from floating overlay
    if (OverlayNative) {
      // Subscribed in controller UI
    }
  }

  public abortActiveExecution() {
    this.isAborted = true;
    if (OverlayNative) {
      OverlayNative.updateOverlayStatus('⏹ Stopped by user');
    }
  }

  public resetAbortState() {
    this.isAborted = false;
  }

  public async executeAtomicStep(
    taskTitle: string,
    stepIndex: number,
    action: ActionPayload,
    userConfirmed = false
  ): Promise<StepExecutionResult> {
    if (this.isAborted) {
      ExecutionLog.logStep({
        taskTitle,
        stepIndex,
        actionType: action.type,
        details: 'Execution aborted by user',
        status: 'aborted',
      });
      return {ok: false, message: 'Execution aborted by user', aborted: true};
    }

    // 1. Safety Gate Check
    const confirmation = SafetyGate.requiresConfirmation(action);
    if (confirmation.required && !userConfirmed) {
      const stepLog = ExecutionLog.logStep({
        taskTitle,
        stepIndex,
        actionType: action.type,
        details: `Awaiting user confirmation: ${confirmation.description}`,
        status: 'awaiting_confirmation',
      });
      return {
        ok: false,
        message: confirmation.description || 'Confirmation required',
        awaitingConfirmation: true,
      };
    }

    // 2. Log step start
    const stepLog = ExecutionLog.logStep({
      taskTitle,
      stepIndex,
      actionType: action.type,
      details: `Executing ${action.type}`,
      status: 'pending',
    });

    // 3. Update Floating Overlay status text
    if (OverlayNative) {
      OverlayNative.updateOverlayStatus(`Step ${stepIndex}: ${action.type}`);
    }

    // 4. Capture current layout before execution for state verification
    let initialLayout = '';
    try {
      initialLayout = await Accessibility.dumpLayoutJSON();
    } catch (_) {}

    // 5. Execute action via native intent or Accessibility gesture bridge
    let result: AutomationResult;
    try {
      result = await this.dispatchActionPayload(action);
    } catch (e: any) {
      result = {
        ok: false,
        kind: 'none',
        message: e?.message || String(e),
      };
    }

    if (this.isAborted) {
      ExecutionLog.updateStepStatus(stepLog.id, 'aborted', 'Aborted during action execution');
      return {ok: false, message: 'Execution aborted', aborted: true};
    }

    // 6. Post-Action State Verification & Password Check
    const verification = await StateVerifier.verifyScreenState(initialLayout);
    if (verification.hasSecurityPrompt) {
      ExecutionLog.updateStepStatus(
        stepLog.id,
        'paused',
        'Security/Password prompt detected',
        'Paused agent: Sensitive authentication screen encountered'
      );
      if (OverlayNative) {
        OverlayNative.updateOverlayStatus('🔒 Paused (Password/2FA)');
      }
      return {
        ok: false,
        message: 'Paused for security: Enter password/PIN manually',
        pausedForSecurity: true,
      };
    }

    // 7. Update log status
    if (result.ok) {
      ExecutionLog.updateStepStatus(stepLog.id, 'success', undefined, result.message);
      if (OverlayNative) {
        OverlayNative.updateOverlayStatus(`Step ${stepIndex} Done`);
      }
      return {
        ok: true,
        message: result.message,
        newLayoutJson: verification.layoutJson,
      };
    } else {
      ExecutionLog.updateStepStatus(stepLog.id, 'failed', result.message);
      if (OverlayNative) {
        OverlayNative.updateOverlayStatus(`Step ${stepIndex} Failed`);
      }
      return {
        ok: false,
        message: result.message,
        newLayoutJson: verification.layoutJson,
      };
    }
  }

  private async dispatchActionPayload(action: ActionPayload): Promise<AutomationResult> {
    switch (action.type) {
      case 'dial_call': {
        const ok = await DeviceControl.placeCall(action.number);
        return {
          ok,
          kind: 'none',
          message: `Placed call to ${action.number}`,
        };
      }

      case 'paste_text': {
        const ok = await Accessibility.pasteText(action.view_id ?? null, action.text ?? null);
        return {
          ok,
          kind: 'none',
          message: `Pasted text into field viewId=${action.view_id} text=${action.text} ok=${ok}`,
        };
      }

      case 'insta_scroll': {
        const intervalMs = (action.interval_sec ?? 5) * 1000;
        const totalCount = action.count ?? 10;
        let performed = 0;

        for (let i = 0; i < totalCount; i++) {
          if (this.isAborted) break;
          // Swipe up (scroll down) across Instagram reels screen coordinates
          const scrolled = await Accessibility.swipeCoordinate(500, 1500, 500, 300, 300);
          if (!scrolled) {
            // Fallback to accessibility scroll forward
            await Accessibility.scroll('down');
          }
          performed++;
          if (i < totalCount - 1) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
          }
        }
        return {
          ok: true,
          kind: 'none',
          message: `Insta Scroll completed ${performed}/${totalCount} reel scrolls every ${action.interval_sec ?? 5}s`,
        };
      }

      default:
        return await executeAction(action);
    }
  }
}

export const ActionExecutor = new ActionExecutorManager();
