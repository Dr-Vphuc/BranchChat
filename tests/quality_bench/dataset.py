"""Load GSM8K problems from the vendored JSONL sample.

Each line is ``{"question": ..., "answer": "...#### 18"}`` (the official GSM8K
format). We keep the full answer text (for use as a distractor) and the parsed
gold number (for grading). Runs fully offline — fetch_data.py creates the file.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from grader import gold_number

DATA_DIR = Path(__file__).resolve().parent / "data"
GSM8K_PATH = DATA_DIR / "gsm8k_sample.jsonl"


@dataclass
class Problem:
    index: int
    question: str
    answer_text: str      # full GSM8K solution incl. the '#### N' marker
    gold: Optional[float]  # parsed reference number


def load_problems(n: Optional[int] = None, path: Path = GSM8K_PATH) -> List[Problem]:
    if not path.exists():
        raise FileNotFoundError(
            f"Không tìm thấy dataset: {path}\n"
            "Tải mẫu GSM8K một lần bằng:\n"
            "  python tests/quality_bench/fetch_data.py"
        )
    problems: List[Problem] = []
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            raw = json.loads(line)
            problems.append(
                Problem(
                    index=i,
                    question=raw["question"],
                    answer_text=raw["answer"],
                    gold=gold_number(raw["answer"]),
                )
            )
            if n is not None and len(problems) >= n:
                break
    return problems
