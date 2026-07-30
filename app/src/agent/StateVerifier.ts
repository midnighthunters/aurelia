/**
 * State Verifier & Popup Handler.
 * Verifies post-action screen state, auto-dismisses popups/ads, and detects password fields.
 */

import {Accessibility} from '../automation/Accessibility';

export type VerificationResult = {
  ok: boolean;
  screenChanged: boolean;
  hasSecurityPrompt: boolean;
  dismissedPopup: boolean;
  layoutJson: string;
  error?: string;
};

export class StateVerifier {
  /**
   * Verifies screen state after an action.
   */
  public static async verifyScreenState(previousLayout: string): Promise<VerificationResult> {
    try {
      // 1. Check for password or 2FA prompt
      const hasSecurity = await Accessibility.hasSensitiveField();
      if (hasSecurity) {
        return {
          ok: false,
          screenChanged: true,
          hasSecurityPrompt: true,
          dismissedPopup: false,
          layoutJson: '',
          error: 'Security prompt / password / 2FA field detected. Agent paused for user safety.',
        };
      }

      // 2. Dump current layout
      const currentLayout = await Accessibility.dumpLayoutJSON();
      const screenChanged = previousLayout !== currentLayout && currentLayout.length > 5;

      // 3. Check for common popups/permission dialogs to auto-dismiss
      const dismissed = await this.autoDismissPopups(currentLayout);

      return {
        ok: true,
        screenChanged: screenChanged || dismissed,
        hasSecurityPrompt: false,
        dismissedPopup: dismissed,
        layoutJson: currentLayout,
      };
    } catch (e: any) {
      return {
        ok: false,
        screenChanged: false,
        hasSecurityPrompt: false,
        dismissedPopup: false,
        layoutJson: '{}',
        error: e?.message || String(e),
      };
    }
  }

  /**
   * Detects and auto-dismisses system permission popups, update prompts, low battery warnings, or ad close buttons.
   */
  private static async autoDismissPopups(layoutJson: string): Promise<boolean> {
    const lower = layoutJson.toLowerCase();
    const dismissableTexts = [
      'allow',
      'while using the app',
      'only this time',
      'got it',
      'remind me later',
      'close',
      'dismiss',
      'not now',
      'no thanks',
      'skip',
    ];

    for (const text of dismissableTexts) {
      if (lower.includes(text)) {
        // Attempt a click on the dismiss button
        const success = await Accessibility.click(null, text);
        if (success) {
          // Wait briefly for dismissal to process
          await new Promise(res => setTimeout(res, 500));
          return true;
        }
      }
    }
    return false;
  }
}
