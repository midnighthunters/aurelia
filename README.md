# Aurelia

Audio-only AI companion for **Android** (React Native) + **Python/FastAPI** brain.

Put on Bluetooth earbuds → the agent is present. Tap to talk, get spoken replies, optional device actions (calendar, pre-filled WhatsApp/SMS/email), and periodic proactive check-ins — without staring at a screen.

> **Hard constraints (this repo):** Android only · no automated tests · Tier 1 automation only · Claude API key never in the client.  
> Full brief: [`masterplan.md`](./masterplan.md) · Research: [`RESEARCH_NOTES.md`](./RESEARCH_NOTES.md) · Phase 0 gate: [`PHASE_0_RESULTS.md`](./PHASE_0_RESULTS.md)

---

## Repo layout

```
/app                  React Native app (Android target)
  /src
    /voice            STT/TTS + tap-to-talk conversation loop
    /bluetooth        JS wrapper for native BT session monitor
    /scheduler        Check-in timer state ↔ foreground service
    /automation       Calendar + WhatsApp/SMS/email Tier 1
    /memory           Local short-term session memory
    /api              FastAPI client
  /android/.../nativemodules
    BluetoothSessionModule.kt
    ForegroundSchedulerService.kt
    SpeechModule.kt
    CalendarModule.kt
    SchedulerModule.kt
    WakeWordModule.kt          (Phase 2 stub)
/backend              Python + FastAPI
  main.py             /reply, /session/clear, /health, /check-in-prompt
  llm.py              Claude wrapper
  memory.py           Server-side short-term cache
  action_schema.py    Structured actions
```

---

## Prerequisites

- Node 18+, JDK 17, Android SDK, physical phone with Bluetooth earbuds (for real validation)
- Python 3.11+
- Anthropic API key

---

## Backend setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env   # then set ANTHROPIC_API_KEY
python main.py
# → http://0.0.0.0:8000  ·  docs at /docs
```

---

## Android app setup

```bash
cd app
npm install
# Point the brain URL at your machine:
# - Emulator: default http://10.0.2.2:8000 (already in src/config.ts)
# - Physical device: edit src/config.ts backendBaseUrl to http://<LAN-IP>:8000
npx react-native start
# other terminal:
npx react-native run-android
```

### First-run permissions

Mic · notifications · Bluetooth connect · calendar read/write.  
Accessibility Service is **not** requested (Tier 2 deferred).

### Relationships (for “text my wife”)

In-app **Relationships** card: alias → E.164 phone or email. Stored only on device.

---

## Phase 0 spike (mandatory gate)

1. Wear earbuds, open app, confirm connected.
2. Tap **Start Phase 0**.
3. Background the app ≥30 minutes.
4. Confirm unprompted spoken probes; **Dump logs** for battery lines.
5. Record results in [`PHASE_0_RESULTS.md`](./PHASE_0_RESULTS.md).

Do not trust battery/latency numbers until this passes on hardware.

---

## Phase 1 manual demo checklist

| Step | Check |
|---|---|
| Bluetooth | Connect buds → UI “connected”; disconnect → “disconnected” + session cleared |
| Tap-to-talk | Tap → speak → transcript logged |
| STT→LLM→TTS | Reply spoken through buds; latency logged (target &lt;~2s) |
| Calendar | “Add dentist Thursday at 3pm” → event in Calendar app |
| Message | “Text my wife I’ll be late” → WhatsApp/SMS pre-filled; agent says hit send |
| Check-in | Backgrounded; spoken ping near configured 45–90 min interval |
| Quiet mode | Toggle or say “quiet mode” / “not now” → no check-ins |
| Session memory | Mention a fact, ask later same session → remembered; disconnect → forgotten |

**MVP done when:** earbuds on → walk away → unprompted check-in → tap to respond → calendar + text actions work → quiet mode kills outbound pings.

---

## Guardrails

- Claude key only in `backend/.env`
- No audio capture until tap-to-talk
- No automated tests (masterplan scope cut)
- No Tier 2 accessibility send without explicit go-ahead
- Message actions always announce that the user must tap send; calendar is silent by design

---

## Phase 2+ (not built)

Wake word (Porcupine) · long-term memory · context-aware check-ins · interruption on call/music · Tier 2 accessibility automation.

Stop after MVP and report latency, battery, and automation accuracy before expanding.
