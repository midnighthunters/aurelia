# Audio-Only AI Companion Agent — Full Build Spec (Android, React Native)

This is a single, complete implementation brief. Paste it into Claude Code as your opening instruction. It merges the original masterplan, the build-order instructions, and research into existing open source projects to build from — nothing is split across files anymore.

**Hard constraints for this build, stated up front so nothing downstream contradicts them:**
- **Platform: Android only.** Do not write any iOS code, iOS permissions, or iOS-specific abstractions in this pass. Where the architecture needs to stay portable for a future iOS port, note it in a comment — don't build it now.
- **Framework: React Native**, with native Kotlin modules where RN has no direct binding (Bluetooth route detection, foreground service, accessibility service).
- **No automated tests.** Do not write unit tests, integration tests, or E2E tests at any phase. Verify everything via the manual checklists in this document instead. This is a deliberate scope cut to move faster — don't reintroduce testing infrastructure unless explicitly asked.

---

## 1. Vision

A general-purpose AI assistant you *wear* instead of *look at*. Once Bluetooth earbuds connect, the agent is "present": you can talk to it anytime, and every so often it talks to you first (a thought, a reminder, a nudge, a question) without opening an app or tapping anything.

The phone does the heavy lifting (Bluetooth, mic, network, AI brain, and now device actions). The earbuds are just the interface. Zero hardware cost — it works with whatever Bluetooth earbuds the user already owns, using the phone's standard headset-audio profile (the same mechanism used for phone calls or Siri/Google Assistant) — no pairing with any proprietary device.

---

## 2. Core User Experience Loop

```
1. User puts on Bluetooth earbuds
        ↓
2. Phone detects earbud connection (standard Android Bluetooth headset profile) → app wakes up in background
        ↓
3. Agent greets softly (optional, configurable) or stays silent
        ↓
4. LISTEN MODE: user can speak anytime (wake word or tap-to-talk)
        ↓
5. Agent transcribes → sends to LLM brain → LLM decides: reply in speech, and/or trigger a device action → agent speaks the reply (and performs the action if one was requested)
        ↓
6. Between conversations: agent runs a background "check-in" timer
        ↓
7. At intervals, agent proactively speaks (a check-in, reminder, or observation)
        ↓
8. User can respond, ignore, or say "not now" / "quiet mode"
        ↓
9. User removes earbuds → agent detects disconnect → goes to sleep, saves session memory
```

Step 5 is new versus the original plan: this build adds **device task automation** (e.g. "text my wife I'll be 20 minutes late," "add a dentist appointment Thursday at 3," "draft an email to Raj about the delay") as a first-class capability, not an afterthought. See Section 6.

---

## 3. Reference open source projects — study these before writing code

Don't copy code wholesale. Read these for architecture patterns, check each repo's license before reusing any snippet directly, and write a short `RESEARCH_NOTES.md` (a few paragraphs) stating which specific choices you borrowed from which repo and why, before starting Step 1 below.

### For the voice loop (Bluetooth, wake word, STT/LLM/TTS)

| Repo | What to extract |
|---|---|
| [BasedHardware/omi](https://github.com/BasedHardware/omi) | Closest analog for the overall shape: mobile app + BLE audio session + backend doing STT→LLM. It's Flutter, not React Native, so treat it as an architecture reference (how it manages a persistent Bluetooth audio session, background capture, and backend orchestration), not a code source. |
| [dscripka/openWakeWord](https://github.com/dscripka/openWakeWord) | On-device wake word + VAD gating pattern (combine keyword score with a voice-activity check to cut false positives), even if you end up using Porcupine instead of this library. |
| [Open-LLM-VTuber/Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | Clean module boundaries for STT / LLM / TTS as swappable interfaces, plus interruption/barge-in handling — mirror this separation so platform STT can be swapped for cloud STT later without touching the rest of the pipeline. |
| [Shaunwei/RealChar](https://github.com/Shaunwei/RealChar) | Low-latency streaming pattern from end-of-speech to first audio played back. |
| [DasterProkio/awesome-ai-companion](https://github.com/DasterProkio/awesome-ai-companion) (see the `astrbot_plugin_proactive_chat` pattern it indexes) | Proactive-messaging scheduling logic — do-not-disturb windows, cadence state, "last contacted" timestamps. Port the *scheduling logic*, not the code (it's built for text chat platforms). |

### For device task automation (new in this version) — "open WhatsApp and text this," "set a calendar event," "draft an email"

| Repo | What to extract | Caveats |
|---|---|---|
| [yashab-cyber/opendroid](https://github.com/yashab-cyber/opendroid) | This is the closest single-project analog to *everything* in this spec combined: a native Android agent with wake word + STT + TTS, an LLM planning layer, and — critically — a `JarvisAccessibilityService` plus per-app "automators" that drive WhatsApp, SMS, and calls by reading the screen and simulating taps when no direct API exists. Study its `accessibility/` and `actions/` module split and its plan → execute → verify → replan loop. | Very new and small (single-digit stars, one release). Its LICENSE file references "Apache License, Version 2.5," which isn't a real Apache license version — treat that as a sign to read the actual license text yourself rather than assume standard Apache-2.0 terms, and generally review its code with more scrutiny than a mature, widely-used project. Use it for architecture ideas, not as a dependency. |
| [droidrun/mobilerun](https://github.com/droidrun/mobilerun) | MIT-licensed, more established framework: a Python-side agent controls Android via a companion "Portal" app using the accessibility tree (or vision mode via screenshots when no a11y tree is available). Good reference for a clean split between "planning" (LLM decides what to do) and "execution" (a thin on-device layer that just executes primitive actions: tap, type, scroll, launch app). |
| [orailnoor/private-agent](https://github.com/orailnoor/private-agent) | Flutter + Android Accessibility Service + an LLM, driven by voice or remote text commands, with a continuous read-screen → decide-action → execute → repeat loop. Useful as a second reference for the accessibility-service action loop specifically. |

**Important framing before you design this module:** Android does **not** provide any public API to silently send a WhatsApp message or send an email on the user's behalf — this is a deliberate OS/app restriction, not a technical gap. There are two real tiers of automation, and they have very different risk profiles:

- **Tier 1 — Intent-based (safe, MVP-eligible):** Use standard Android Intents to *open* WhatsApp/email/SMS with content pre-filled, and use the Calendar Content Provider to *silently write* calendar events (this one **can** be fully automatic — no accessibility service needed, see Section 6). For WhatsApp/email/SMS, the user still has to tap "send" themselves — Android and WhatsApp both block programmatic sending via Intents by design.
- **Tier 2 — Accessibility-Service-based (Phase 2+, higher risk):** To get a fully hands-free "text my wife" with no tap required, you need an Accessibility Service that reads WhatsApp's screen and simulates the tap on its send button, the way OpenDroid and private-agent do. This is fragile (breaks whenever WhatsApp changes its UI layout), requires the user to grant a broad and sensitive permission, and sits close to what WhatsApp's terms discourage around automated message sending. Don't build this in Phase 1. Flag it to the user as a deliberate later decision, not a default.

---

## 4. Assumptions (stated explicitly — override if you disagree)

- **Mobile framework: React Native** (per your instruction), with a small set of native Kotlin modules for the things RN has no binding for: Bluetooth headset route detection, a persistent foreground service, wake word integration, and (Phase 2+) the accessibility service.
- **Backend: Python + FastAPI.** Thin service, holds the Claude API key server-side, exposes one endpoint that takes a transcript + session context and returns a reply (and, once Section 6 lands, a structured "action" the app should perform).
- **Wake word: Porcupine (Picovoice)** for MVP — free tier is fine for a prototype.
- **STT/TTS: Android platform-native** (`SpeechRecognizer`, Android TTS) for MVP. No cloud STT/TTS yet.
- **Storage: local device storage only** for MVP — session memory lives in the app, cleared when earbuds disconnect.
- **Calendar automation ships in Phase 1** (Tier 1, silent, low-risk). **WhatsApp/email/SMS automation ships in two stages:** Tier 1 (open pre-filled, manual send) in Phase 1; Tier 2 (fully hands-free via accessibility service) is explicitly deferred to Phase 2+ per the caveats above.

If you disagree with any of these, stop and ask before proceeding — don't silently override an explicit instruction.

---

## 5. Full Feature Set

**Must-have (MVP — Phase 1):**
- Detect Bluetooth earbuds connect/disconnect automatically (Android headset audio profile)
- Voice activation: tap-to-talk first; wake word added once tap-to-talk is proven (see Phase 2)
- Speech-to-text → LLM → text-to-speech round trip, low latency
- One proactive check-in type: periodic "how's it going" ping on a timer (45–90 min, configurable)
- Basic short-term memory within a session (remembers what you said a few minutes ago)
- Mute / quiet-mode toggle (spoken command or in-app)
- **Device task automation, Tier 1:** silently create calendar events; open WhatsApp/SMS/email pre-filled with the right recipient and message for the user to tap send

**Nice-to-have (Phase 2+):**
- Long-term memory across sessions (preferences, ongoing projects, recurring topics)
- Context-aware check-ins (time of day, calendar, location, activity via phone sensors)
- Multiple check-in "personalities" (coach, friend, assistant, quiet-mode-by-default)
- Interruption handling (agent pauses if you're on a call or playing music)
- Smart triggers instead of pure timers (e.g. check in after you've been still a while)
- Wake word ("Hey [name]") instead of tap-to-talk
- **Device task automation, Tier 2:** fully hands-free WhatsApp/SMS/email sending via accessibility service, modeled on OpenDroid/private-agent's approach — ship only after an explicit go-ahead, given the fragility and ToS caveats above

**Explicitly out of scope for now:**
- iOS, entirely
- Custom hardware
- Multi-user / social features
- Visual companion app UI beyond basic settings
- Automated tests of any kind

---

## 6. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     ANDROID APP (React Native)                    │
│                                                                     │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────┐         │
│  │ Bluetooth   │   │  Audio I/O    │   │  Background      │         │
│  │ Session     │──▶│  Manager      │◀─▶│  Scheduler       │         │
│  │ Monitor     │   │ (mic + TTS)   │   │  (check-in timer)│         │
│  │ (native mod)│   └──────┬───────┘   │  (native service) │         │
│  └────────────┘          │            └─────────────────┘         │
│                    ┌──────▼───────┐                                │
│                    │  Wake Word /  │                                │
│                    │  Tap Trigger  │                                │
│                    └──────┬───────┘                                │
│                    ┌──────▼───────┐                                │
│                    │  STT Engine   │                                │
│                    └──────┬───────┘                                │
│                           │  text                                  │
└───────────────────────────┼─────────────────────────────────────────┘
                             ▼
                  ┌────────────────────────┐
                  │   Backend / Brain        │
                  │  (Claude API call)        │
                  │  + memory store            │
                  │  + action decision (what,  │
                  │    if any, device action    │
                  │    to request)               │
                  └──────────┬─────────────────┘
                             │  response text + optional action payload
┌────────────────────────────┼─────────────────────────────────────────┐
│                    ┌────────▼───────┐         ┌──────────────────┐    │
│                    │  TTS Engine    │         │  Task Automation   │    │
│                    └────────┬───────┘         │  Module            │    │
│                             │                  │  Tier 1: Intents/  │    │
│                             ▼                  │  Calendar Provider │    │
│                     Spoken to earbuds           │  Tier 2 (later):   │    │
│                                                  │  Accessibility Svc │    │
│                                                  └──────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component breakdown

| Component | Job | Implementation notes |
|---|---|---|
| **Bluetooth Session Monitor** | Detects earbud connect/disconnect | Native Kotlin module wrapping `BluetoothAdapter` + `AudioManager` broadcasts (`ACTION_ACL_CONNECTED`/`DISCONNECTED`, `AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED`), bridged to RN via a `NativeModule` + `DeviceEventEmitter`. |
| **Audio I/O Manager** | Owns mic input / speaker output, manages ducking | Native module; must coexist with music/calls without stealing focus permanently. |
| **Wake Word / Tap Trigger** | Decides when the user is addressing the agent | MVP: a tap-to-talk button/gesture. Phase 2: Porcupine Android SDK via a native module. |
| **STT Engine** | Speech → text | Android `SpeechRecognizer` for MVP; revisit cloud STT later if accuracy is insufficient. |
| **Background Scheduler** | Runs the check-in timer while backgrounded | Android **foreground service** with a persistent notification (required for reliability — there is no way around the visible notification on Android). This is the hardest technical problem — see Section 7. |
| **Backend / Brain** | Calls Claude API, manages memory, decides on any device action | Python/FastAPI. Never call the LLM API directly from the RN client with an embedded key. |
| **Memory Store** | Session memory (MVP), long-term later | Local device storage (e.g. `AsyncStorage` or a small SQLite file) for MVP. |
| **TTS Engine** | Text reply → speech | Android native TTS for MVP. |
| **Task Automation Module (new)** | Executes device actions the LLM requests | Tier 1 (Phase 1): Calendar events via `CalendarContract` ContentProvider (silent, no UI); WhatsApp/SMS/email via `Linking`/Intents (opens pre-filled, user taps send). Tier 2 (Phase 2+, gated): Accessibility Service for hands-free send, modeled on OpenDroid's `JarvisAccessibilityService` pattern — do not build until Tier 1 is validated and the user explicitly asks for it. |

---

## 7. Task Automation Module — Detailed Design

This is the newest and riskiest addition, so it gets its own detailed breakdown.

### Tier 1 (Phase 1 — build this now)

- **Calendar event creation (fully silent):**
  - Request `WRITE_CALENDAR` / `READ_CALENDAR` runtime permission once, during onboarding or on first use.
  - Use the `react-native-calendar-events` library (or an equivalent thin native module wrapping `CalendarContract.Events` / `ContentResolver.insert`) to create events directly — no user confirmation UI needed after permission is granted, since this is a first-party content provider write, not a cross-app action.
  - The LLM's action payload should specify: title, start time, end time (or duration), and optional notes — parsed from natural language on the backend (e.g. "Thursday at 3" → resolved to an absolute timestamp using the phone's current date/timezone, sent from the client so the backend doesn't have to guess timezone).
- **WhatsApp / SMS / email — pre-filled, manual send:**
  - WhatsApp: use `Linking.openURL` with the `whatsapp://send?phone=<E.164 number>&text=<encoded message>` scheme. This opens the chat with the message typed in; the user taps send.
  - SMS: use `Linking.openURL('sms:<number>?body=<encoded message>')`.
  - Email: use `Linking.openURL('mailto:<address>?subject=<encoded subject>&body=<encoded body>')`.
  - In all three cases, the agent should say something like "I've opened WhatsApp with the message ready — just hit send" so the user isn't surprised that it didn't send automatically.
- **Contact resolution:** for "text my wife," you'll need to resolve "wife" → a phone number. For MVP, keep this simple: a small user-editable "relationships" map stored locally (name → contact), set up during onboarding or on first use ("who's your wife?" once, then remembered). Don't attempt full contacts-list fuzzy matching in Phase 1.

### Tier 2 (Phase 2+ — do not build without explicit go-ahead)

- A `NativeAccessibilityService` (Kotlin) that, once enabled by the user in Android's Accessibility settings, can read WhatsApp's view hierarchy and simulate the tap on the send button after Tier 1 has pre-filled the message.
- Study OpenDroid's `accessibility/` module and private-agent's screen-reading loop for the pattern (parse the accessibility node tree for clickable/editable elements, locate the target, dispatch a click via `AccessibilityNodeInfo.performAction`).
- Before building this, explicitly re-confirm with the user that they understand: (a) it requires granting a very broad Android permission, (b) it will break whenever WhatsApp updates its UI, and (c) fully automated message-sending sits close to behavior that messaging platforms' terms of service discourage. This isn't a reason to refuse to build it — it's a reason to make sure it's a deliberate choice, not a default.

---

## 8. Repo Structure

```
/app                  React Native app (Android target only for now)
  /src
    /voice             STT/TTS wrappers, tap-to-talk UI, (later) wake word
    /bluetooth          JS-side wrapper around the native BT session module
    /scheduler          Check-in timer UI/state (native service does the actual backgrounding)
    /automation         Task automation module: calendar, WhatsApp/SMS/email intents
    /memory             Local session memory
    /api                Client for the FastAPI backend
  /android
    /app/src/main/java/.../nativemodules
      BluetoothSessionModule.kt
      ForegroundSchedulerService.kt
      WakeWordModule.kt        (Phase 2)
      AccessibilityAutomationService.kt   (Phase 2+, gated)
/backend               Python + FastAPI
  main.py               /reply endpoint: transcript + context in, reply + optional action out
  llm.py                Claude API call wrapper
  memory.py             Session memory handling
  action_schema.py      Defines the structured action payload (calendar/message/none)
RESEARCH_NOTES.md       Written in Step 0, before any code
PHASE_0_RESULTS.md      Written after the Phase 0 spike, before Phase 1 begins
```

---

## 9. Step 1 — Phase 0 technical spike (mandatory gate)

Build a throwaway prototype (not production code) that proves, **on Android only**:

1. The app detects Bluetooth earbud connect and disconnect reliably.
2. The app survives in the background via a foreground service (with its required persistent notification) for at least 30 minutes without being killed.
3. After that 30+ minute idle period, it can still speak a scheduled message through the earbuds unprompted.
4. Rough battery drain over that window is logged.

**Do not proceed to Phase 1 until this passes.** If it fails or battery cost is too high, stop and report back — the roadmap may need to shift toward a foreground-only model rather than a persistent background loop.

Write `PHASE_0_RESULTS.md`: pass/fail, measured battery drain, any gotchas. No automated tests for this — manual verification only (run it, wear the earbuds, time it with a stopwatch).

---

## 10. Step 2 — Phase 1 MVP, in build order

Each step should have a working manual demo before moving to the next. No automated tests at any point — verify manually using the checklist under each step.

1. **Bluetooth Session Monitor**
   - Build `BluetoothSessionModule.kt`, emit connect/disconnect events to JS.
   - Manual check: connect earbuds → app UI reflects "connected"; disconnect → reflects "disconnected."
2. **Tap-to-talk loop**
   - Simple UI affordance (or a hardware media-button binding if the earbuds expose one) to start/stop recording.
   - Manual check: tap, speak, release → transcript appears (log it, no UI needed yet).
3. **STT → Claude API → TTS round trip**
   - Wire the FastAPI `/reply` endpoint: transcript + minimal session context in, reply text out.
   - Client plays the reply via Android TTS through the earbuds.
   - Manual check: time the gap from end-of-speech to start-of-spoken-reply; target under ~2 seconds; log every round trip's latency to a local file for now.
4. **Calendar automation (Tier 1)**
   - Wire the `action_schema.py` "create_calendar_event" action; backend parses natural language date/time (given the client's current date/timezone) into an absolute timestamp; client writes it via `react-native-calendar-events`.
   - Manual check: say "add a dentist appointment Thursday at 3pm," confirm the event appears correctly in the Android Calendar app.
5. **WhatsApp/SMS/email automation (Tier 1)**
   - Wire the "send_message" action (channel + recipient-name + body); resolve recipient name via the local relationships map; open the right app pre-filled via `Linking`.
   - Manual check: say "text my wife I'll be late," confirm WhatsApp opens with the correct chat and message text, agent says the message is ready to send.
6. **One fixed-interval check-in**
   - Background scheduler fires every 45–90 minutes (configurable), speaks a lightweight prompt through the earbuds.
   - Manual check: leave the app backgrounded, confirm it speaks unprompted at roughly the configured interval.
7. **Quiet mode**
   - Spoken command or in-app toggle, suppresses check-ins immediately.
   - Manual check: trigger quiet mode, confirm no check-in fires until it's turned off.
8. **Basic session memory**
   - Short-term only; cleared on earbud disconnect.
   - Manual check: mention something, ask about it a few minutes later in the same session, confirm it's remembered; disconnect/reconnect, confirm it's forgotten.

**MVP is done when:** you can put the earbuds in, walk away from the phone, get a proactive check-in unprompted at the configured interval, tap to respond, ask it to set a calendar event and text someone, and have both work correctly — with quiet mode able to shut everything off at any point.

---

## 11. Guardrails (apply throughout)

- **Never embed the Claude API key in the client.** All LLM calls go through the FastAPI backend.
- **Default to not recording or transmitting audio** until tap-to-talk fires.
- **No automated tests.** Verify manually per the checklists above. Don't add a test framework, test files, or CI test steps unless explicitly asked later.
- **No Tier 2 automation without explicit go-ahead** — Tier 1 only in this pass.
- Log latency and battery metrics from the first working build, not as an afterthought.
- Be upfront in the UI whenever the agent has opened another app on the user's behalf (per Section 7's "message is ready" framing) — don't let device actions happen silently and unexplained, except for the calendar case where silence is the intended (and lower-risk) behavior.

---

## 12. Success Metrics

- **Reliability:** % of sessions where check-ins fire as scheduled without the app being force-killed.
- **Latency:** end-of-speech to start-of-response (target under ~2 seconds for MVP).
- **Task automation accuracy:** % of calendar events created with correct date/time/title; % of message-drafts opened with correct recipient/content.
- **Retention:** % of users still wearing/using it daily after 1 week, 1 month.
- **Engagement quality:** ratio of check-ins responded to vs. dismissed.
- **Battery impact:** % drain per hour of "on" time.

---

## 13. After MVP

Stop and report back with: what works, current latency numbers, battery drain, task-automation accuracy, and anything from Phase 0/1 that suggests the Phase 2+ roadmap needs to change — including whether Tier 2 automation is worth the fragility/ToS tradeoff before building it. Don't proceed into Phase 2 automatically; treat this as a deliberate checkpoint.
