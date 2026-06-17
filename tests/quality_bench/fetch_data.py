"""One-off downloader for the GSM8K test split (MIT-licensed).

Pulls the official JSONL from the openai/grade-school-math GitHub repo and writes
a sample to data/gsm8k_sample.jsonl. Uses only the stdlib (urllib) — no extra deps.

    python tests/quality_bench/fetch_data.py            # 250 problems (default)
    python tests/quality_bench/fetch_data.py --count 1319  # the full test split
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

# Windows consoles default to cp1252 — print the Vietnamese messages as UTF-8.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

GSM8K_URL = (
    "https://raw.githubusercontent.com/openai/grade-school-math/"
    "master/grade_school_math/data/test.jsonl"
)
OUT_PATH = Path(__file__).resolve().parent / "data" / "gsm8k_sample.jsonl"


def main() -> None:
    ap = argparse.ArgumentParser(description="Tải mẫu GSM8K test split về data/gsm8k_sample.jsonl")
    ap.add_argument("--count", type=int, default=250, help="Số bài lưu lại (mặc định 250).")
    ap.add_argument("--url", default=GSM8K_URL, help="Nguồn JSONL (mặc định: repo chính thức).")
    args = ap.parse_args()

    print(f"Đang tải GSM8K từ:\n  {args.url}")
    with urllib.request.urlopen(args.url) as resp:  # noqa: S310 — fixed trusted URL
        raw = resp.read().decode("utf-8")

    lines = [ln for ln in raw.splitlines() if ln.strip()]
    sample = lines[: args.count]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("\n".join(sample) + "\n", encoding="utf-8")
    print(f"Đã ghi {len(sample)} bài → {OUT_PATH}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"Tải thất bại: {exc}", file=sys.stderr)
        sys.exit(1)
