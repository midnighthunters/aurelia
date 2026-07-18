"""
Aurelia brain — FastAPI service.

POST /reply   transcript + session context → reply text + optional action
POST /session/clear   drop short-term memory for a session (earbud disconnect)
GET  /health
GET  /check-in-prompt  optional spoken line for proactive pings
"""

from __future__ import annotations

import datetime
import json
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from action_schema import ReplyRequest, ReplyResponse
from llm import generate_check_in_prompt, generate_reply
from memory import store

load_dotenv()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: nothing heavy; API key checked lazily on first /reply
    yield
    store.clear_all()


app = FastAPI(title="Aurelia Brain", version="0.1.0", lifespan=lifespan)

# RN metro / emulator may hit this from various hosts during dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClearSessionRequest(BaseModel):
    session_id: str


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "has_api_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "model": os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
    }


@app.get("/check-in-prompt")
def check_in_prompt() -> dict:
    return {"prompt": generate_check_in_prompt()}


@app.post("/reply", response_model=ReplyResponse)
def reply(body: ReplyRequest) -> ReplyResponse:
    history = store.merge_history(body.session_id, body.history)
    reply_text, action = generate_reply(
        transcript=body.transcript,
        history=history,
        client_now_iso=body.client_now_iso,
        client_timezone=body.client_timezone,
        quiet_mode=body.quiet_mode,
        relationships=body.relationships,
    )
    store.append(body.session_id, "user", body.transcript)
    store.append(body.session_id, "assistant", reply_text)
    return ReplyResponse(
        reply_text=reply_text,
        action=action,
        session_id=body.session_id,
    )


@app.post("/session/clear")
def clear_session(body: ClearSessionRequest) -> dict:
    store.clear(body.session_id)
    return {"cleared": True, "session_id": body.session_id}


@app.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    latest_frame: str | None = None
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "screen":
                latest_frame = msg.get("data")
            elif msg_type == "turn":
                transcript = msg.get("transcript", "")
                session_id = msg.get("session_id", "default_ws_session")
                history = msg.get("history", [])
                client_now_iso = msg.get("client_now_iso", datetime.datetime.utcnow().isoformat())
                client_timezone = msg.get("client_timezone", "UTC")
                quiet_mode = msg.get("quiet_mode", False)
                relationships = msg.get("relationships", {})

                # Merge past history with active store
                merged_history = store.merge_history(session_id, history)

                # Process turn via Multimodal LLM
                reply_text, action = generate_reply(
                    transcript=transcript,
                    history=merged_history,
                    client_now_iso=client_now_iso,
                    client_timezone=client_timezone,
                    quiet_mode=quiet_mode,
                    relationships=relationships,
                    screen_base64=latest_frame
                )

                # Record turn in persistent cache
                store.append(session_id, "user", transcript)
                store.append(session_id, "assistant", reply_text)

                # Send structured reply back to client
                await websocket.send_json({
                    "type": "reply",
                    "reply_text": reply_text,
                    "action": action,
                    "session_id": session_id
                })
            elif msg_type == "action_result":
                session_id = msg.get("session_id", "default_ws_session")
                result_text = msg.get("result", "")
                ok = msg.get("ok", True)
                layout = msg.get("layout", "{}")

                # Log the system action result to the session store
                store.append(
                    session_id,
                    "user",
                    f"[System Action Result: {result_text}. Screen layout: {layout}]"
                )

                # Re-run LLM planning based on the new environment state
                reply_text, action = generate_reply(
                    transcript="",
                    history=store.merge_history(session_id, []),
                    client_now_iso=datetime.datetime.utcnow().isoformat(),
                    client_timezone="UTC",
                    screen_base64=latest_frame
                )

                store.append(session_id, "assistant", reply_text)

                await websocket.send_json({
                    "type": "reply",
                    "reply_text": reply_text,
                    "action": action,
                    "session_id": session_id
                })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
