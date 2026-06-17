"""CLI: report input-token savings of branch-chat vs a linear full-history chat.

    python run.py                 # synthetic fixtures (default)
    python run.py --db [PATH]     # replay real conversations from SQLite
    python run.py --selftest      # assert the metric matches a hand-computed tree

Run from anywhere; the sibling modules resolve because this script's directory is
on sys.path[0].
"""

from __future__ import annotations

import argparse
import csv as csvmod
import dataclasses
import json as jsonmod
import sys
from typing import List, Tuple

import tokenizer
from measure import Node, SessionResult, measure_corpus, measure_session

# Windows consoles default to cp1252, which can't encode the Vietnamese text and
# the →/✓/box-drawing characters in the report — print UTF-8 instead.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

_SENTINEL = "__DEFAULT__"  # marks "--db with no value" → use loader's default path


# ── Output helpers ────────────────────────────────────────────────────────────

def _fmt_table(labeled: List[Tuple[str, SessionResult]]) -> str:
    header = ("session", "nodes", "branch", "depth", "linear", "branch_in", "saved", "saved%")
    rows = [
        (
            label,
            str(r.n_nodes),
            str(r.n_branches),
            str(r.max_branch_depth),
            str(r.linear_total),
            str(r.branch_total),
            str(r.saved_tokens),
            f"{r.saved_pct:.1f}",
        )
        for label, r in labeled
    ]
    widths = [
        max(len(header[i]), max((len(row[i]) for row in rows), default=0))
        for i in range(len(header))
    ]

    def line(cols):
        return "  ".join(
            c.ljust(widths[i]) if i == 0 else c.rjust(widths[i])
            for i, c in enumerate(cols)
        )

    out = [line(header), line(tuple("-" * w for w in widths))]
    out += [line(r) for r in rows]
    return "\n".join(out)


def _report(title: str, labeled, sessions, args) -> None:
    print(f"\n=== {title} ===")
    print(f"tokenizer: {tokenizer.which()}  |  baseline: tuyến tính full-history")
    print(_fmt_table(labeled))

    agg = measure_corpus(sessions)
    print(f"\nTrung bình mỗi phiên (mean saved%):  {agg['mean_pct']:.1f}%")
    print(f"Gộp toàn bộ (pooled saved%):         {agg['pooled_pct']:.1f}%")
    print(
        f"Tổng token tiết kiệm:                "
        f"{agg['total_saved_tokens']:,} / {agg['total_linear_tokens']:,} (linear)"
    )

    if args.json:
        payload = {
            "tokenizer": tokenizer.which(),
            "mean_pct": agg["mean_pct"],
            "pooled_pct": agg["pooled_pct"],
            "total_saved_tokens": agg["total_saved_tokens"],
            "total_linear_tokens": agg["total_linear_tokens"],
            "sessions": [
                {"label": label, **dataclasses.asdict(r)} for label, r in labeled
            ],
        }
        print("\n" + jsonmod.dumps(payload, ensure_ascii=False, indent=2))

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csvmod.writer(f)
            w.writerow(
                ["label", "n_nodes", "n_branches", "max_branch_depth",
                 "branch_total", "linear_total", "saved_tokens", "saved_pct"]
            )
            for label, r in labeled:
                w.writerow(
                    [label, r.n_nodes, r.n_branches, r.max_branch_depth,
                     r.branch_total, r.linear_total, r.saved_tokens, f"{r.saved_pct:.2f}"]
                )
        print(f"\nĐã ghi CSV: {args.csv}")


# ── Modes ───────────────────────────────────────────────────────────────────--

def run_fixtures(args) -> None:
    from fixtures import archetypes

    arches = archetypes()
    labeled = [(name, measure_session(nodes)) for name, _desc, nodes in arches]
    sessions = [nodes for _name, _desc, nodes in arches]
    _report("FIXTURE (cây tổng hợp)", labeled, sessions, args)
    print("\nMô tả các kịch bản:")
    for name, desc, _nodes in arches:
        print(f"  • {name}: {desc}")


def run_db(args) -> None:
    from loader import DEFAULT_DB, load_sessions

    path = DEFAULT_DB if args.db == _SENTINEL else args.db
    try:
        sessions_labeled = load_sessions(path)
    except FileNotFoundError as e:
        print(e)
        print(
            "Gợi ý: app lưu DB trong Docker volume. Lấy ra rồi trỏ --db tới nó:\n"
            "  docker compose cp app:/app/data/branchchat.db ./bc.db\n"
            "  python tests/token_savings/run.py --db ./bc.db"
        )
        return
    if not sessions_labeled:
        print(f"DB không có conversation nào: {path}")
        return
    labeled = [(title[:32], measure_session(nodes)) for title, nodes in sessions_labeled]
    sessions = [nodes for _title, nodes in sessions_labeled]
    _report(f"DB THẬT ({path})", labeled, sessions, args)


def run_selftest() -> None:
    """Assert the metric matches a hand-computed tree.

    Tree: main A→B→C, branch off A: A→D→E (created A,B,C,D,E), all turns
    prompt=20 / answer=300. Worked out by hand:
      branch_total = 11·20 + 6·300 = 2020
      linear_total = 15·20 + 10·300 = 3300
      saved        = 4·20 + 4·300  = 1280  (38.8%)
    """
    nodes = [
        Node("A", None, "continue", 20, 300, 1),
        Node("B", "A", "continue", 20, 300, 2),
        Node("C", "B", "continue", 20, 300, 3),
        Node("D", "A", "branch", 20, 300, 4),
        Node("E", "D", "continue", 20, 300, 5),
    ]
    r = measure_session(nodes)
    assert r.branch_total == 2020, r.branch_total
    assert r.linear_total == 3300, r.linear_total
    assert r.saved_tokens == 1280, r.saved_tokens
    assert (r.n_nodes, r.n_branches, r.max_branch_depth) == (5, 1, 1), r

    # A pure 'continue' spine must save nothing (branch == linear).
    from fixtures import gen_tree

    lin = measure_session(gen_tree(6))
    assert lin.saved_tokens == 0, lin.saved_tokens

    print("selftest: OK")
    print("  cây A→B→C + nhánh A→D→E: branch=2020, linear=3300, saved=1280 (38.8%) ✓")
    print("  cây thẳng gen_tree(6):   saved=0 ✓")


# ── Entry point ───────────────────────────────────────────────────────────────

def main(argv=None) -> None:
    p = argparse.ArgumentParser(
        description="Đo % tiết kiệm input-token: rẽ nhánh vs tuyến tính."
    )
    p.add_argument(
        "--db", nargs="?", const=_SENTINEL, default=None,
        help="Replay phiên thật từ SQLite (không truyền giá trị = dùng đường dẫn mặc định).",
    )
    p.add_argument(
        "--tokenizer", choices=["tiktoken", "heuristic"], default=None,
        help="Ép bộ đếm token (mặc định: tiktoken nếu cài, nếu không thì heuristic).",
    )
    p.add_argument("--json", action="store_true", help="In thêm kết quả dạng JSON.")
    p.add_argument("--csv", metavar="PATH", help="Ghi bảng per-session ra file CSV.")
    p.add_argument(
        "--selftest", action="store_true",
        help="Chạy assert kiểm chứng công thức rồi thoát.",
    )
    args = p.parse_args(argv)

    if args.tokenizer:
        tokenizer.force(args.tokenizer)

    if args.selftest:
        run_selftest()
    elif args.db is not None:
        run_db(args)
    else:
        run_fixtures(args)


if __name__ == "__main__":
    main()
