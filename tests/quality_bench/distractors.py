"""Build ordered lists of distractor (Q, A) turns to pollute a linear context.

Two flavours:
  - ``near``: other GSM8K problems (the hard case — same domain, in-distribution
    numbers the model may try to fold in). The assistant turn is the real worked
    solution with the '#### N' marker rewritten to a natural 'The answer is N.'.
  - ``off``:  unrelated chit-chat / trivia from data/offtopic.json.
  - ``mix``:  alternates near, off, near, off, …

Selection is deterministic per target index, and **nested**: the first ``k``
distractors at level k are a prefix of those at any larger level, so accuracy is
swept against a monotonically growing context.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import List, Sequence, Tuple

from dataset import DATA_DIR, Problem

OFFTOPIC_PATH = DATA_DIR / "offtopic.json"

Turn = Tuple[str, str]  # (user content, assistant content)

_HASH_MARKER = re.compile(r"####\s*(.+)\s*$")


def _gsm8k_as_turn(p: Problem) -> Turn:
    """A solved GSM8K problem presented as a natural user/assistant exchange."""
    answer = _HASH_MARKER.sub(lambda m: f"The answer is {m.group(1).strip()}.", p.answer_text)
    return (p.question, answer)


def _load_offtopic() -> List[Turn]:
    raw = json.loads(Path(OFFTOPIC_PATH).read_text(encoding="utf-8"))
    return [(item["q"], item["a"]) for item in raw]


def build_distractors(
    target: Problem,
    pool: Sequence[Problem],
    mode: str,
    max_k: int,
) -> List[Turn]:
    """Ordered list of up to ``max_k`` distractor turns for ``target``.

    ``pool`` is the full problem set (used as the near-topic source, excluding
    the target itself). The list is deterministic given ``target.index``.
    """
    near_pool = [p for p in pool if p.index != target.index]
    off_pool = _load_offtopic()

    def near(j: int) -> Turn:
        # Walk the pool starting just after the target, wrapping around.
        src = near_pool[(target.index + 1 + j) % len(near_pool)]
        return _gsm8k_as_turn(src)

    def off(j: int) -> Turn:
        return off_pool[(target.index + j) % len(off_pool)]

    turns: List[Turn] = []
    for j in range(max_k):
        if mode == "near":
            turns.append(near(j))
        elif mode == "off":
            turns.append(off(j))
        elif mode == "mix":
            turns.append(near(j // 2) if j % 2 == 0 else off(j // 2))
        else:
            raise ValueError(f"distractor mode không hợp lệ: {mode}")
    return turns
