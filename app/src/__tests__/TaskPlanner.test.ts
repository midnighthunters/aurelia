import {AppSkillRegistry} from '../agent/AppSkillRegistry';
import {SafetyGate} from '../agent/SafetyGate';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('TaskPlanner & SkillRegistry Unit Tests', () => {
  it('correctly maps phone call actions to PhoneSkillHandler', () => {
    const action = {type: 'dial_call' as const, number: '+15551234567'};
    const handler = AppSkillRegistry.getHandler(action);
    expect(handler).toBeDefined();
    expect(handler?.appName).toBe('Phone');
  });

  it('correctly maps send message actions to MessagingSkillHandler', () => {
    const action = {type: 'send_message' as const, channel: 'whatsapp' as const, recipient: 'Raj', body: 'Hello'};
    const handler = AppSkillRegistry.getHandler(action);
    expect(handler).toBeDefined();
    expect(handler?.appName).toBe('Messaging');
  });

  it('enforces safety confirmation gate on send message', () => {
    const action = {type: 'send_message' as const, channel: 'sms' as const, recipient: 'Mom', body: 'Hi'};
    const check = SafetyGate.requiresConfirmation(action);
    expect(check.required).toBe(true);
    expect(check.preview?.Recipient).toBe('Mom');
  });

  it('enforces safety confirmation gate on placing call', () => {
    const action = {type: 'dial_call' as const, number: '911'};
    const check = SafetyGate.requiresConfirmation(action);
    expect(check.required).toBe(true);
  });

  it('detects payment/checkout screen keywords for confirmation gate', () => {
    const layoutSample = '{"children":[{"text":"Complete Purchase"},{"text":"Pay Now $49.99"}]}';
    const isPayment = SafetyGate.isCheckoutOrPaymentScreen(layoutSample);
    expect(isPayment).toBe(true);
  });

  it('correctly maps insta_scroll action to InstaScrollSkillHandler', () => {
    const action = {type: 'insta_scroll' as const, interval_sec: 5, count: 10};
    const handler = AppSkillRegistry.getHandler(action);
    expect(handler).toBeDefined();
    expect(handler?.appName).toBe('Instagram');

    const steps = AppSkillRegistry.resolveStepPlan(action);
    expect(steps.length).toBe(3);
    expect(steps[0].type).toBe('launch_app');
    expect(steps[2].type).toBe('insta_scroll');
  });
});
