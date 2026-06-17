"""Thin, non-streaming Gemini client for the benchmark.

Reuses the backend's setup ([src/backend/main.py](../../src/backend/main.py)):
same library (``google-genai``), same key from src/backend/.env, same message
mapping (system → system_instruction; assistant → role 'model'). Differences:
non-streaming, ``temperature=0`` for reproducibility, and it returns the real
prompt token count from ``usage_metadata``.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import List, Optional, Tuple

from conversation import Message

DEFAULT_MODEL = "gemini-2.5-flash-lite"
_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENV_PATH = _REPO_ROOT / "src" / "backend" / ".env"

_client = None  # lazy singleton


def _get_client():
    global _client
    if _client is not None:
        return _client
    from dotenv import load_dotenv
    from google import genai

    load_dotenv(_ENV_PATH)
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError(
            f"Thiếu GEMINI_API_KEY. Đặt nó trong {_ENV_PATH} (giống khi chạy app)."
        )
    _client = genai.Client(api_key=key)
    return _client


def _to_contents(messages: List[Message]) -> list:
    # assistant → 'model'; everything else → 'user' (same as the backend).
    return [
        {
            "role": "model" if m["role"] == "assistant" else "user",
            "parts": [{"text": m["content"]}],
        }
        for m in messages
        if m["role"] != "system"
    ]


def generate(
    system: str,
    messages: List[Message],
    model: str = DEFAULT_MODEL,
    max_retries: int = 8,
) -> Tuple[str, Optional[int]]:
    """Return ``(text, prompt_token_count)``. Retries with exponential backoff on
    errors (503 overload / 429 rate limit / transient failures)."""
    from google.genai import types

    client = _get_client()
    config = types.GenerateContentConfig(system_instruction=system, temperature=0)

    delay = 2.0
    last_exc: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=_to_contents(messages),
                config=config,
            )
            text = resp.text or ""
            usage = getattr(resp, "usage_metadata", None)
            prompt_tokens = getattr(usage, "prompt_token_count", None) if usage else None
            return text, prompt_tokens
        except Exception as exc:  # noqa: BLE001 — backoff and retry on anything transient
            last_exc = exc
            if attempt < max_retries - 1:
                time.sleep(delay)
                delay = min(delay * 2, 30)
    raise RuntimeError(f"Gemini thất bại sau {max_retries} lần thử: {last_exc}")
