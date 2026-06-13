"""BranchChat backend — a thin streaming proxy to Google Gemini.

The frontend sends the assembled root→node message chain; this service holds the
API key (so it never reaches the browser bundle) and streams tokens back over SSE.
"""

import json
import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from google import genai
from google.genai import types

# Load GEMINI_API_KEY from src/backend/.env regardless of the working directory.
load_dotenv(Path(__file__).parent / ".env")

DEFAULT_MODEL = "gemini-2.5-flash-lite"

app = FastAPI(title="BranchChat backend")

# Vite dev server talks to us through its /api proxy (same-origin), but allow the
# direct origins too so the endpoint is testable on its own.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


class Message(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    model: Optional[str] = None


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "model": DEFAULT_MODEL}


@app.post("/api/chat")
def chat(req: ChatRequest) -> StreamingResponse:
    # Gemini takes the system prompt separately and uses role "model" for the
    # assistant; fold any system messages into system_instruction.
    system_parts = [m.content for m in req.messages if m.role == "system"]
    system_text = "\n\n".join(system_parts) or None

    contents = [
        {
            "role": "model" if m.role == "assistant" else "user",
            "parts": [{"text": m.content}],
        }
        for m in req.messages
        if m.role != "system"
    ]

    model = req.model or DEFAULT_MODEL

    def gen():
        try:
            stream = client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(system_instruction=system_text),
            )
            for chunk in stream:
                if chunk.text:
                    yield _sse({"delta": chunk.text})
            yield _sse({"done": True})
        except Exception as exc:  # surface the error to the client instead of 500
            yield _sse({"error": str(exc)})

    return StreamingResponse(gen(), media_type="text/event-stream")


# Production: serve the built frontend if it was bundled into the image. Mounted
# last so the /api/* routes above take precedence. In dev STATIC_DIR is unset and
# Vite serves the frontend instead.
_static_dir = os.environ.get("STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
