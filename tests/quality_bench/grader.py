"""Extract a numeric answer from model output and grade it against GSM8K gold.

GSM8K gold answers are the text after ``####`` (an integer, sometimes with
thousands separators). The model is prompted to end with ``The answer is N.``,
but we fall back to the last number in the text so partial compliance still grades.
"""

from __future__ import annotations

import re
from typing import Optional

# A number possibly with $, thousands commas, decimals, or a leading sign.
_NUMBER = r"-?\$?\s?\d[\d,]*(?:\.\d+)?"
_ANSWER_IS = re.compile(r"answer\s*(?:is|:)\s*\*{0,2}\s*(" + _NUMBER + r")", re.IGNORECASE)
_ALL_NUMBERS = re.compile(_NUMBER)


def normalize_number(raw: str) -> Optional[float]:
    """Parse a loosely-formatted number ('$1,200.0', ' 18.') → float, else None."""
    if raw is None:
        return None
    s = raw.strip().rstrip(".").replace("$", "").replace(",", "").replace(" ", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def gold_number(answer_text: str) -> Optional[float]:
    """The reference value: text after the GSM8K '####' marker."""
    if "####" in answer_text:
        return normalize_number(answer_text.split("####")[-1])
    # Some sources store the bare number already.
    return normalize_number(answer_text)


def extract_pred(text: str) -> Optional[float]:
    """Pull the model's final numeric answer.

    Prefer the last 'answer is N' phrase; otherwise the last number anywhere.
    """
    if not text:
        return None
    matches = _ANSWER_IS.findall(text)
    if matches:
        return normalize_number(matches[-1])
    nums = _ALL_NUMBERS.findall(text)
    if nums:
        return normalize_number(nums[-1])
    return None


def is_correct(pred: Optional[float], gold: Optional[float]) -> bool:
    """Numeric match with a tiny tolerance for float noise."""
    if pred is None or gold is None:
        return False
    return abs(pred - gold) < 1e-4
