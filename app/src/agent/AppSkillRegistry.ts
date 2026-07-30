/**
 * App Skill & Handler Registry for Aurelia Android AI Agent.
 * Provides a standardized interface for app-specific integrations with generic UI automation fallback.
 */

import {ActionPayload} from '../api/client';
import {DeviceControl} from '../automation/DeviceControl';
import {MessagingUtility} from '../automation/MessagingUtility';

export interface AppSkillHandler {
  appName: string;
  packageNames: string[];
  canHandle(action: ActionPayload, targetApp?: string): boolean;
  createStepPlan(action: ActionPayload, layoutJson?: string): ActionPayload[];
}

// 1. Phone & Calling Skill
export const PhoneSkillHandler: AppSkillHandler = {
  appName: 'Phone',
  packageNames: ['com.google.android.dialer', 'com.samsung.android.dialer'],
  canHandle(action, targetApp) {
    return (
      action.type === 'dial_call' ||
      targetApp?.toLowerCase() === 'phone' ||
      targetApp?.toLowerCase() === 'dialer'
    );
  },
  createStepPlan(action) {
    if (action.type === 'dial_call') {
      return [{type: 'dial_call', number: action.number}];
    }
    return [{type: 'none'}];
  },
};

// 2. SMS & Messaging Skill (Messages, WhatsApp, Telegram)
export const MessagingSkillHandler: AppSkillHandler = {
  appName: 'Messaging',
  packageNames: ['com.google.android.apps.messaging', 'com.whatsapp', 'org.telegram.messenger'],
  canHandle(action, targetApp) {
    return (
      action.type === 'send_message' ||
      ['whatsapp', 'messages', 'telegram', 'sms'].includes(targetApp?.toLowerCase() || '')
    );
  },
  createStepPlan(action) {
    if (action.type === 'send_message') {
      return [{type: 'send_message', channel: action.channel, recipient: action.recipient, body: action.body, subject: action.subject}];
    }
    return [{type: 'none'}];
  },
};

// 3. Email Skill (Gmail & generic)
export const EmailSkillHandler: AppSkillHandler = {
  appName: 'Gmail',
  packageNames: ['com.google.android.gm'],
  canHandle(action, targetApp) {
    return (
      action.type === 'compose_email' ||
      ['gmail', 'email', 'mail'].includes(targetApp?.toLowerCase() || '')
    );
  },
  createStepPlan(action) {
    if (action.type === 'compose_email') {
      return [
        {
          type: 'send_message',
          channel: 'email',
          recipient: action.to,
          body: action.body,
          subject: action.subject,
        },
      ];
    }
    return [{type: 'none'}];
  },
};

// 4. Web & Job Search Skill (Chrome, LinkedIn, Indeed, Naukri)
export const WebJobSearchSkillHandler: AppSkillHandler = {
  appName: 'WebJobSearch',
  packageNames: ['com.android.chrome', 'com.linkedin.android', 'com.indeed.android.jobsearch'],
  canHandle(action, targetApp) {
    return (
      action.type === 'search_web' ||
      action.type === 'job_search' ||
      ['chrome', 'linkedin', 'indeed', 'naukri', 'browser'].includes(targetApp?.toLowerCase() || '')
    );
  },
  createStepPlan(action) {
    if (action.type === 'search_web') {
      const url = action.url || `https://www.google.com/search?q=${encodeURIComponent(action.query)}`;
      return [
        {type: 'launch_app', app_name: 'Chrome'},
        {type: 'wait', ms: 1000},
        {type: 'type_text', view_id: 'com.android.chrome:id/url_bar', value: url},
        {type: 'click', text: 'Go'},
      ];
    }
    if (action.type === 'job_search') {
      const loc = action.location || '';
      const query = `${action.keywords} ${loc}`.trim();
      const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(action.keywords)}&location=${encodeURIComponent(loc)}`;
      return [
        {type: 'launch_app', app_name: action.platform || 'LinkedIn'},
        {type: 'wait', ms: 1000},
        {type: 'type_text', text: 'Search jobs', value: query},
        {type: 'click', text: 'Search'},
      ];
    }
    return [{type: 'none'}];
  },
};

// 5. Contacts Skill
export const ContactsSkillHandler: AppSkillHandler = {
  appName: 'Contacts',
  packageNames: ['com.google.android.contacts', 'com.samsung.android.app.contacts'],
  canHandle(action, targetApp) {
    return (
      action.type === 'contact_action' ||
      targetApp?.toLowerCase() === 'contacts'
    );
  },
  createStepPlan(action) {
    if (action.type === 'contact_action') {
      return [
        {type: 'launch_app', app_name: 'Contacts'},
        {type: 'wait', ms: 800},
        {type: 'type_text', text: 'Search contacts', value: action.name},
      ];
    }
    return [{type: 'none'}];
  },
};

// 6. Calendar & Alarms Skill
export const CalendarSkillHandler: AppSkillHandler = {
  appName: 'Calendar',
  packageNames: ['com.google.android.calendar'],
  canHandle(action, targetApp) {
    return (
      action.type === 'create_calendar_event' ||
      action.type === 'set_alarm' ||
      action.type === 'set_timer' ||
      ['calendar', 'clock', 'alarm'].includes(targetApp?.toLowerCase() || '')
    );
  },
  createStepPlan(action) {
    if (action.type === 'create_calendar_event') {
      return [{type: 'create_calendar_event', title: action.title, start_iso: action.start_iso, end_iso: action.end_iso, notes: action.notes, all_day: action.all_day}];
    }
    if (action.type === 'set_alarm') {
      return [{type: 'set_alarm', hour: action.hour, minute: action.minute, message: action.message}];
    }
    if (action.type === 'set_timer') {
      return [{type: 'set_timer', seconds: action.seconds, message: action.message}];
    }
    return [{type: 'none'}];
  },
};

// 7. System Control Skill
export const SystemSkillHandler: AppSkillHandler = {
  appName: 'SystemSettings',
  packageNames: ['com.android.settings'],
  canHandle(action) {
    return [
      'toggle_radio',
      'set_volume',
      'set_brightness',
      'set_dnd',
      'navigate',
      'read_notifications',
    ].includes(action.type);
  },
  createStepPlan(action) {
    return [action];
  },
};

// 8. Insta Scroll Skill
export const InstaScrollSkillHandler: AppSkillHandler = {
  appName: 'Instagram',
  packageNames: ['com.instagram.android'],
  canHandle(action, targetApp) {
    return (
      action.type === 'insta_scroll' ||
      ['instagram', 'reels', 'insta', 'feed scroll'].includes(targetApp?.toLowerCase() || '')
    );
  },
  createStepPlan(action) {
    const sec = action.type === 'insta_scroll' ? action.interval_sec ?? 5 : 5;
    const count = action.type === 'insta_scroll' ? action.count ?? 10 : 10;
    return [
      {type: 'launch_app', app_name: 'Instagram'},
      {type: 'wait', ms: 1500},
      {type: 'insta_scroll', interval_sec: sec, count: count},
    ];
  },
};

// Master App Skill Registry Manager
class AppSkillRegistryManager {
  private handlers: AppSkillHandler[] = [
    PhoneSkillHandler,
    MessagingSkillHandler,
    EmailSkillHandler,
    WebJobSearchSkillHandler,
    ContactsSkillHandler,
    CalendarSkillHandler,
    SystemSkillHandler,
    InstaScrollSkillHandler,
  ];

  public registerHandler(handler: AppSkillHandler) {
    this.handlers.unshift(handler);
  }

  public getHandler(action: ActionPayload, targetApp?: string): AppSkillHandler | null {
    return this.handlers.find(h => h.canHandle(action, targetApp)) || null;
  }

  public resolveStepPlan(action: ActionPayload, targetApp?: string, layoutJson?: string): ActionPayload[] {
    const handler = this.getHandler(action, targetApp);
    if (handler) {
      return handler.createStepPlan(action, layoutJson);
    }
    // Generic UI automation fallback for unknown apps
    if (action.type === 'launch_app') {
      return [{type: 'launch_app', app_name: action.app_name}];
    }
    return [action];
  }
}

export const AppSkillRegistry = new AppSkillRegistryManager();
