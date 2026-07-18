"""
Aurelia brain — FastAPI service.

POST /reply   transcript + session context → reply text + optional action
POST /session/clear   drop short-term memory for a session (earbud disconnect)
GET  /health
GET  /check-in-prompt  optional spoken line for proactive pings
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
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


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
