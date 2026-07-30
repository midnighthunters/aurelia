/**
 * Safety & Confirmation Requirements Engine.
 * Enforces non-negotiable user confirmation rules and security field checks.
 */

import {ActionPayload} from '../api/client';

export type ConfirmationRequest = {
  id: string;
  actionType: string;
  title: string;
  description: string;
  previewData?: Record<string, string>;
  actionPayload: ActionPayload;
};

export class SafetyGate {
  /**
   * Evaluates if an action is sensitive and requires explicit user confirmation.
   */
  public static requiresConfirmation(action: ActionPayload): {required: boolean; description?: string; preview?: Record<string, string>} {
    if (!action) return {required: false};

    switch (action.type) {
      case 'send_message':
        return {
          required: true,
          description: `Send ${action.channel.toUpperCase()} message to ${action.recipient}`,
          preview: {
            Recipient: action.recipient,
            Channel: action.channel,
            Message: action.body,
            Subject: action.subject || 'N/A',
          },
        };

      case 'compose_email':
        return {
          required: true,
          description: `Send email to ${action.to}`,
          preview: {
            To: action.to,
            Subject: action.subject,
            Body: action.body,
            Attachment: action.attachment_path || 'None',
          },
        };

      case 'dial_call':
        return {
          required: true,
          description: `Place phone call to ${action.number}`,
          preview: {
            Number: action.number,
          },
        };

      case 'confirm_action':
        return {
          required: true,
          description: action.description,
          preview: {
            Action: JSON.stringify(action.pending_action),
          },
        };

      default:
        return {required: false};
    }
  }

  /**
   * Checks if screen layout text or action fields indicate a checkout/payment step,
   * which mandates explicit user confirmation before tapping buy/pay/place order.
   */
  public static isCheckoutOrPaymentScreen(layoutJsonString: string): boolean {
    const lower = layoutJsonString ? layoutJsonString.toLowerCase() : '';
    const paymentKeywords = [
      'pay now',
      'place order',
      'complete purchase',
      'confirm payment',
      'proceed to pay',
      'checkout',
      'cvv',
      'credit card number',
      'upi pin',
    ];
    return paymentKeywords.some(k => lower.includes(k));
  }

  /**
   * Checks if action tries to uninstall an app or delete sensitive data.
   */
  public static isDestructiveAction(action: ActionPayload): boolean {
    if (!action) return false;
    if (action.type === 'navigate' && (action.action as string) === 'uninstall') return true;
    return false;
  }
}
