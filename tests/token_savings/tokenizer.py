"""Offline token counting for the savings harness.

Uses tiktoken's ``o200k_base`` encoding when available; otherwise falls back to a
char/4 heuristic. The savings metric compares branch vs linear with the SAME
counter, so the *ratio* (% saved) is robust to which one is used — tiktoken just
gives more credible absolute numbers.
"""

from __future__ import annotations

import math
from typing import Optional

_FORCED: Optional[str] = None   # set by force(); None = auto-detect
_MODE: Optional[str] = None     # resolved 'tiktoken' | 'heuristic'
_ENCODER = None                 # cached tiktoken encoder


def force(mode: Optional[str]) -> None:
    """Pin the tokenizer (used by the ``--tokenizer`` CLI flag). None = auto."""
    global _FORCED, _MODE, _ENCODER
    _FORCED = mode
    _MODE = None
    _ENCODER = None


def _resolve() -> str:
    global _MODE, _ENCODER
    if _MODE is not None:
        return _MODE
    if _FORCED == "heuristic":
        _MODE = "heuristic"
        return _MODE
    try:
        import tiktoken

        _ENCODER = tiktoken.get_encoding("o200k_base")
        _MODE = "tiktoken"
    except Exception:
        if _FORCED == "tiktoken":
            raise RuntimeError(
                "Đã ép --tokenizer tiktoken nhưng chưa cài. Chạy: pip install tiktoken"
            )
        _MODE = "heuristic"
    return _MODE


def which() -> str:
    """Which counter is active, for the report header."""
    return _resolve()


def count_tokens(text: str) -> int:
    if not text:
        return 0
    if _resolve() == "tiktoken":
        return len(_ENCODER.encode(text))
    # Heuristic: ~4 chars per token, at least 1 for non-empty text.
    return max(1, math.ceil(len(text) / 4))
