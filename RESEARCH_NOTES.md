# Research Notes — Architecture Choices Borrowed from Open Source

Written before any application code (masterplan Step 0). Licenses were reviewed at a high level; **no third-party source was copied wholesale**. Patterns below are architectural inspiration only.

## Voice loop & session shape

### BasedHardware/omi (Flutter + Python/FastAPI backend)
- **Borrowed:** Split between a mobile client that owns the audio/Bluetooth session and a thin Python backend that does STT→LLM orchestration. Omi’s backend-as-brain model (keys server-side, session-oriented HTTPS) maps cleanly to our FastAPI `/reply` endpoint.
- **Not borrowed:** Proprietary BLE wearable protocol, continuous always-on capture, Flutter stack. We use standard Android headset-audio profile (SCO/ACL) with consumer earbuds instead of a custom device.
- **Why:** Closest product-shaped analog for “phone does the heavy lifting, wearable is just the interface.”

### dscripka/openWakeWord
- **Borrowed:** The idea of **gating** activation (keyword score + voice-activity check) to cut false positives. For Phase 1 we only ship tap-to-talk, but the STT path is structured so a Porcupine/openWakeWord gate can sit in front of `SpeechRecognizer` later without rewriting the pipeline.
- **Not borrowed:** The model runtime itself (Phase 2 uses Picovoice Porcupine per assumptions).

### Open-LLM-VTuber/Open-LLM-VTuber
- **Borrowed:** Clean **swappable module boundaries** for STT / LLM / TTS. Our app exposes `SttEngine`, `TtsEngine`, and `BrainClient` as separate modules with thin interfaces so platform STT can be swapped for cloud STT later without touching automation or memory.
- **Borrowed (design only):** Interruption/barge-in as a first-class concern — `AudioIOManager` is prepared to abandon TTS playback when a new listen starts.

### Shaunwei/RealChar
- **Borrowed:** Bias toward **low latency from end-of-speech to first audio**. We log round-trip latency to a local file on every turn and stream the reply to TTS as soon as the backend returns text (no multi-step UI round trips).

### DasterProkio/awesome-ai-companion → proactive chat scheduling pattern
- **Borrowed:** Proactive check-in scheduling concepts: configurable cadence, last-contacted timestamps, and a quiet/DND flag that immediately suppresses outbound pings.
- **Not borrowed:** Text-chat platform plugin code; we port the *logic* into an Android foreground service + JS scheduler state.

## Device task automation

### yashab-cyber/opendroid
- **Borrowed:** Conceptual split of **plan → execute → verify** and the idea that some actions need an accessibility service when no public API exists. Also the notion of per-channel “automators” (calendar vs messaging).
- **Not borrowed:** Accessibility service, screen-scraping, or any Tier 2 hands-free send. License text referenced a non-standard “Apache 2.5” — treated as a signal to use architecture ideas only, not dependency or copy.
- **Why deferred:** Masterplan Tier 2 is gated on explicit user go-ahead (fragility + ToS + broad permission).

### droidrun/mobilerun (MIT)
- **Borrowed:** Clean separation of **planning (LLM decides)** vs **execution (thin on-device primitives)**. Backend emits a structured action payload; the RN `automation` module only executes known primitives (calendar write, open intent).
- **Not borrowed:** Python-side control loop or companion Portal app.

### orailnoor/private-agent
- **Borrowed:** Confirmation that continuous read-screen → decide → execute loops are viable on Android via Accessibility Service — reinforcing that this is a **Phase 2+** path, not MVP.
- **Not built in this pass.**

## Tier framing we locked in
- **Tier 1 (shipped):** Calendar via ContentProvider (silent); WhatsApp/SMS/email via Intents (pre-filled, user taps send); local relationships map for contact resolution.
- **Tier 2 (not built):** Accessibility Service for automatic send — requires explicit go-ahead per masterplan Section 7.

## Summary of concrete choices for this codebase
| Concern | Choice | Source of inspiration |
|---|---|---|
| Backend shape | FastAPI `/reply` + Claude, keys server-side | omi |
| STT/LLM/TTS boundaries | Separate modules, swappable | Open-LLM-VTuber |
| Latency logging | Per-turn local metrics file | RealChar spirit |
| Check-in cadence / quiet mode | Timer + lastContact + quiet flag | proactive_chat pattern |
| Actions | Structured payload → thin executors | mobilerun / opendroid (Tier 1 only) |
| Wake word | Stub native module; tap-to-talk for MVP | openWakeWord gating pattern (future) |
