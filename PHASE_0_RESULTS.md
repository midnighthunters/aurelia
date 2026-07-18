# Phase 0 technical spike — results

**Gate:** Do not treat Phase 1 as production-validated until this spike passes on a real Android device with Bluetooth earbuds.

This document is the verification record required by masterplan Section 9. Automated tests are intentionally not used.

## What the spike implements

| Requirement | Implementation |
|---|---|
| Detect BT earbud connect/disconnect | `BluetoothSessionModule.kt` — ACL + headset profile + AudioManager device scan; JS events `bluetoothHeadsetConnected` / `Disconnected` |
| Survive ≥30 min backgrounded via foreground service | `ForegroundSchedulerService.kt` with ongoing notification channel `aurelia_companion` |
| Speak a scheduled message unprompted after idle | Service fires `proactiveCheckIn` + headless JS task `AureliaCheckIn` → Android TTS |
| Log battery drain | Native append to app-private `phase0_battery.log`; UI “Dump logs” + `phase0BatterySample` events |

**How to run the spike in the app:** open Aurelia → **Start Phase 0** (uses a **10 minute** probe interval so a 30+ minute window produces multiple samples without waiting an hour).

## Manual verification checklist

Run on a physical Android phone (emulator BT headset routing is unreliable).

1. Install a debug build; grant mic, notifications, Bluetooth, calendar permissions when prompted.
2. Put on Bluetooth earbuds; confirm UI shows **Earbuds connected**.
3. Tap **Start Phase 0**. Confirm persistent notification: “Phase 0 spike running”.
4. Press Home; leave the phone idle with earbuds on for **≥30 minutes**.
5. Confirm at least one unprompted spoken probe through the earbuds after ~10 minutes (and again near 20/30).
6. Return to the app → **Dump logs**. Copy battery lines into the table below.
7. Disconnect earbuds; confirm UI shows disconnected and session memory is cleared (Phase 1 behavior; also validates BT path).

## Measured results (fill in after device run)

| Field | Value |
|---|---|
| Device / Android version | _pending device run_ |
| Earbud model | _pending_ |
| Spike wall-clock duration | _e.g. 32 min_ |
| Probes heard unprompted | _e.g. 3 / 3 expected_ |
| Battery % at start | _pending_ |
| Battery % at end | _pending_ |
| Approx. drain % / hour | _pending_ |
| App killed by OS? | _yes / no_ |
| **Pass / Fail** | **PENDING_MANUAL** |

### Battery log sample format

```
<epoch_ms>,service_start,battery_pct=87,interval_ms=600000
<epoch_ms>,tick,battery_pct=86,interval_ms=600000
<epoch_ms>,checkin_fire,battery_pct=85,interval_ms=600000
```

## Gotchas observed during implementation (pre-device)

- **Foreground notification is mandatory** on modern Android for a reliable long-running loop; there is no silent background alternative that survives Doze for 30+ minutes for our use case.
- **Exact alarms** may require user-granted “Alarms & reminders” on Android 12+; the service also uses a Handler tick as a backup cadence.
- **Foreground service types** declared: `microphone|connectedDevice` — keep the manifest types aligned with what the service actually does or Android 14+ will crash on `startForeground`.
- **Bluetooth permissions** split by API: legacy `BLUETOOTH` / `BLUETOOTH_ADMIN` (≤30) vs `BLUETOOTH_CONNECT` / `BLUETOOTH_SCAN` (31+).
- **TTS audio route** follows the system communication/media route; SCO is not forced for every utterance in MVP (A2DP is usually enough for TTS). If a device only routes call audio to buds, revisit SCO.
- **Emulators** are insufficient for this gate — always use physical buds + phone.

## Gate decision

| Outcome | Action |
|---|---|
| Pass, drain acceptable (roughly &lt;5–8%/hr idle with probes) | Proceed with Phase 1 manual demos on the same stack (already implemented in-repo). |
| Fail (process killed, no speech, or severe drain) | Stop and reassess: shorter sessions, user-visible “companion active” screen, or WorkManager-only pings without continuous FGS. |

**Status at commit time:** Implementation of the spike is complete in code; **pass/fail metrics require a human device run** and should be edited into this file after that run. Phase 1 MVP code is present so the same build exercises the full loop once Phase 0 is confirmed.
