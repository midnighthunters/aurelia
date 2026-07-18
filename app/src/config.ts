/**
 * App-wide configuration.
 * Backend URL: Android emulator uses 10.0.2.2 to reach host localhost.
 * Physical device: set to your machine's LAN IP (e.g. http://192.168.1.10:8000).
 */
export const CONFIG = {
  /** FastAPI brain base URL — never put Claude API keys in the client */
  backendBaseUrl: 'http://10.0.2.2:8000',

  /** Default proactive check-in interval (ms). Masterplan: 45–90 min configurable */
  defaultCheckInIntervalMs: 60 * 60 * 1000,

  minCheckInIntervalMs: 45 * 60 * 1000,
  maxCheckInIntervalMs: 90 * 60 * 1000,

  /** Phase 0 spike uses a shorter probe so survival can be verified without waiting an hour */
  phase0ProbeIntervalMs: 10 * 60 * 1000,

  storageKeys: {
    quietMode: '@aurelia/quietMode',
    checkInIntervalMs: '@aurelia/checkInIntervalMs',
    relationships: '@aurelia/relationships',
    sessionId: '@aurelia/sessionId',
    sessionHistory: '@aurelia/sessionHistory',
    lastLatencyMs: '@aurelia/lastLatencyMs',
  },
} as const;
