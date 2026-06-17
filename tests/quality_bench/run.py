"""Benchmark: does branch-chat's clean context beat a linear, distractor-polluted
context on answer quality? Sweep the number of off-topic turns ``k`` and report
accuracy + real prompt-token cost.

    python run.py --selftest          # offline: grader + builders, no API
    python run.py --n 10 --k 0,4      # smoke (~20 calls)
    python run.py                     # full default: N=200, k=0,2,4,8,16

k=0 is the branch (clean) baseline; k>0 is the linear chat accumulating pollution.

Run from anywhere; sibling modules resolve via sys.path[0].
"""

from __future__ import annotations

import argparse
import csv as csvmod
import json as jsonmod
import sys
from pathlib import Path
from typing import Dict, List, Optional

# Windows consoles default to cp1252 — print UTF-8 for the Vietnamese report.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

from conversation import SYSTEM, build_messages
from dataset import DATA_DIR, load_problems
from distractors import build_distractors
from grader import extract_pred, is_correct

CACHE_PATH = DATA_DIR / ".cache" / "results.jsonl"


# ── Cache ─────────────────────────────────────────────────────────────────────

def _cache_key(model: str, mode: str, k: int, index: int) -> str:
    return f"{model}|{mode}|{k}|{index}"


def _load_cache() -> Dict[str, dict]:
    if not CACHE_PATH.exists():
        return {}
    out: Dict[str, dict] = {}
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rec = jsonmod.loads(line)
                out[rec["key"]] = rec
    return out


def _append_cache(rec: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "a", encoding="utf-8") as f:
        f.write(jsonmod.dumps(rec, ensure_ascii=False) + "\n")


# ── Reporting ───────────────────────────────────────────────────────────────--

def _aggregate(records: List[dict], ks: List[int]) -> List[dict]:
    rows = []
    for k in ks:
        items = [r for r in records if r["k"] == k]
        n = len(items)
        correct = sum(1 for r in items if r["correct"])
        toks = [r["prompt_tokens"] for r in items if r["prompt_tokens"] is not None]
        rows.append(
            {
                "k": k,
                "n": n,
                "accuracy": (correct / n * 100) if n else 0.0,
                "mean_prompt_tokens": (sum(toks) / len(toks)) if toks else 0.0,
            }
        )
    return rows


def _report(title: str, rows: List[dict], args) -> None:
    base_acc = rows[0]["accuracy"] if rows else 0.0
    base_tok = rows[0]["mean_prompt_tokens"] if rows else 0.0

    header = ("k", "loại", "n", "accuracy%", "lợi thế(pp)", "mean_tok", "token thừa")
    table = []
    for i, r in enumerate(rows):
        kind = "rẽ nhánh" if r["k"] == 0 else "tuyến tính"
        table.append(
            (
                str(r["k"]),
                kind,
                str(r["n"]),
                f"{r['accuracy']:.1f}",
                "—" if i == 0 else f"{base_acc - r['accuracy']:+.1f}",
                f"{r['mean_prompt_tokens']:.0f}",
                "—" if i == 0 else f"+{r['mean_prompt_tokens'] - base_tok:.0f}",
            )
        )
    widths = [max(len(header[c]), max((len(row[c]) for row in table), default=0)) for c in range(len(header))]

    def line(cols):
        return "  ".join(c.ljust(widths[i]) if i in (0, 1) else c.rjust(widths[i]) for i, c in enumerate(cols))

    print(f"\n=== {title} ===")
    print(f"model: {args.model}  |  distractor: {args.distractor}  |  temperature=0")
    print(line(header))
    print(line(tuple("-" * w for w in widths)))
    for row in table:
        print(line(row))

    if len(rows) > 1:
        worst = rows[-1]
        print(
            f"\nTại k={worst['k']}: rẽ nhánh đúng {base_acc:.1f}% vs tuyến tính {worst['accuracy']:.1f}% "
            f"→ lợi thế {base_acc - worst['accuracy']:+.1f} điểm, "
            f"tiết kiệm ~{worst['mean_prompt_tokens'] - base_tok:.0f} token/câu."
        )

    if args.json:
        print("\n" + jsonmod.dumps({"model": args.model, "distractor": args.distractor, "rows": rows},
                                   ensure_ascii=False, indent=2))
    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csvmod.writer(f)
            w.writerow(["k", "n", "accuracy", "mean_prompt_tokens"])
            for r in rows:
                w.writerow([r["k"], r["n"], f"{r['accuracy']:.2f}", f"{r['mean_prompt_tokens']:.1f}"])
        print(f"\nĐã ghi CSV: {args.csv}")


# ── Main benchmark ──────────────────────────────────────────────────────────--

def run_bench(args) -> None:
    from client import generate

    ks = sorted(set(int(x) for x in args.k.split(",")))
    problems = load_problems(args.n)
    max_k = max(ks)
    cache = {} if args.no_cache else _load_cache()

    records: List[dict] = []
    failures = 0
    total = len(problems) * len(ks)
    done = 0
    for p in problems:
        distractors = build_distractors(p, problems, args.distractor, max_k)
        for k in ks:
            done += 1
            key = _cache_key(args.model, args.distractor, k, p.index)
            if key in cache:
                records.append(cache[key])
                print(f"\r[{done}/{total}] index={p.index} k={k} (cache)   ", end="", file=sys.stderr)
                continue
            messages = build_messages(p.question, distractors[:k])
            try:
                text, prompt_tokens = generate(SYSTEM, messages, model=args.model)
            except Exception as exc:  # noqa: BLE001 — transient (503/quota): skip, resume on rerun
                failures += 1
                print(f"\n  ! bỏ qua index={p.index} k={k}: {exc}", file=sys.stderr)
                continue
            pred = extract_pred(text)
            rec = {
                "key": key, "k": k, "index": p.index,
                "pred": pred, "gold": p.gold,
                "correct": is_correct(pred, p.gold),
                "prompt_tokens": prompt_tokens,
            }
            if not args.no_cache:
                _append_cache(rec)
                cache[key] = rec
            records.append(rec)
            print(f"\r[{done}/{total}] index={p.index} k={k}      ", end="", file=sys.stderr)
    print("", file=sys.stderr)

    if failures:
        print(
            f"\n⚠️  {failures} lượt thất bại (thường do 503/quota tạm thời). "
            f"Đã giữ {len(records)} kết quả trong cache — chạy lại đúng lệnh để lấp các lượt còn thiếu.",
            file=sys.stderr,
        )
        if not records:
            print("Chưa có kết quả nào để báo cáo. Hãy chạy lại sau ít phút.", file=sys.stderr)
            return

    rows = _aggregate(records, ks)
    _report(f"CONTEXT POLLUTION (GSM8K, N={len(problems)})", rows, args)


# ── Selftest (offline) ─────────────────────────────────────────────────────--

def run_selftest() -> None:
    from grader import gold_number, normalize_number

    # Grader.
    assert extract_pred("Work...\nThe answer is 42.") == 42.0
    assert extract_pred("first 1,200 then finally 18") == 18.0
    assert extract_pred("The answer is $1,234.50") == 1234.5
    assert extract_pred("no numbers here") is None
    assert gold_number("blah blah\n#### 1,234") == 1234.0
    assert is_correct(18.0, 18.0) and not is_correct(18.0, 19.0)
    assert normalize_number(" 7. ") == 7.0

    # Conversation shapes.
    clean = build_messages("Q?", [])
    assert len(clean) == 1 and clean[0]["role"] == "user"
    polluted = build_messages("Q?", [("a", "b"), ("c", "d"), ("e", "f"), ("g", "h")])
    assert len(polluted) == 9 and polluted[-1] == {"role": "user", "content": "Q?"}
    assert polluted[0]["role"] == "user" and polluted[1]["role"] == "assistant"

    # Distractors: deterministic + nested (prefix property) across k levels.
    from dataset import Problem
    pool = [Problem(i, f"q{i}", f"sol{i}\n#### {i}", float(i)) for i in range(6)]
    near4 = build_distractors(pool[0], pool, "near", 4)
    near2 = build_distractors(pool[0], pool, "near", 2)
    assert near4[:2] == near2, "near distractors phải nested"
    assert all(p[0] != "q0" for p in near4), "không tự lấy chính target làm distractor"
    off3 = build_distractors(pool[0], pool, "off", 3)
    assert len(off3) == 3 and all(isinstance(t[0], str) for t in off3)
    mix4 = build_distractors(pool[0], pool, "mix", 4)
    assert mix4[0] == near4[0] and mix4[1] == off3[0], "mix phải xen kẽ near/off"

    print("selftest: OK")
    print("  grader trích số đúng (answer-is / số cuối / $,) ✓")
    print("  conversation: clean=1 turn, polluted k=4 → 9 message ✓")
    print("  distractors: nested theo k, không trùng target, mix xen kẽ ✓")


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description="Benchmark chất lượng: context sạch (rẽ nhánh) vs bị nhiễu (tuyến tính).")
    p.add_argument("--n", type=int, default=200, help="Số bài GSM8K (mặc định 200).")
    p.add_argument("--k", default="0,2,4,8,16", help="Các mức số câu lạc đề, phân tách bằng dấu phẩy.")
    p.add_argument("--distractor", choices=["near", "off", "mix"], default="mix",
                   help="Loại nhiễu: near (bài toán khác), off (lạc đề), mix (xen kẽ).")
    p.add_argument("--model", default="gemini-2.5-flash-lite", help="Model Gemini.")
    p.add_argument("--json", action="store_true", help="In thêm kết quả JSON.")
    p.add_argument("--csv", metavar="PATH", help="Ghi bảng theo k ra CSV.")
    p.add_argument("--no-cache", action="store_true", help="Không đọc/ghi cache (gọi lại toàn bộ).")
    p.add_argument("--selftest", action="store_true", help="Chạy assert offline rồi thoát (không gọi API).")
    args = p.parse_args(argv)

    if args.selftest:
        run_selftest()
    else:
        run_bench(args)


if __name__ == "__main__":
    main()
