"""Core metric: input-token cost of branching vs a linear full-history baseline.

A ``Node`` is reduced to two token counts (prompt = user/system, answer =
assistant) plus its tree position and creation time — that's all the savings
metric needs.

Math (see tests/token_savings/README.md):
  branch_input(n) = Σ_{ancestors a}(prompt+answer)(a) + prompt(n)
  linear_input(n) = Σ_{m created before n}(prompt+answer)(m) + prompt(n)
  saved_pct       = (Σ linear − Σ branch) / Σ linear
Output tokens are identical under both models, so they're excluded.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class Node:
    id: str
    parent_id: Optional[str]
    edge_kind: str            # 'continue' | 'branch'
    prompt_tokens: int        # user + system messages
    answer_tokens: int        # assistant message
    created_at: int           # ordering key for the linear baseline


@dataclass
class SessionResult:
    n_nodes: int
    n_branches: int
    max_branch_depth: int
    branch_total: int
    linear_total: int
    saved_tokens: int
    saved_pct: float


def _by_id(nodes: List[Node]) -> Dict[str, Node]:
    return {n.id: n for n in nodes}


def branch_input(node: Node, by_id: Dict[str, Node]) -> int:
    """Input tokens to generate ``node`` under branch-chat: walk root→node.
    Ancestors contribute prompt+answer; ``node`` itself only its prompt (its
    answer doesn't exist yet at call time). Mirrors getChainToRoot in utils.ts."""
    total = node.prompt_tokens
    cur = by_id.get(node.parent_id) if node.parent_id else None
    while cur is not None:
        total += cur.prompt_tokens + cur.answer_tokens
        cur = by_id.get(cur.parent_id) if cur.parent_id else None
    return total


def branch_depth(node: Node, by_id: Dict[str, Node]) -> int:
    """Number of 'branch' edges on the path from ``node`` to root."""
    depth = 0
    cur: Optional[Node] = node
    while cur is not None and cur.parent_id:
        if cur.edge_kind == "branch":
            depth += 1
        cur = by_id.get(cur.parent_id)
    return depth


def measure_session(nodes: List[Node]) -> SessionResult:
    """One conversation tree → its branch vs linear input-token totals.

    The linear baseline is computed cumulatively in creation order: a turn never
    includes its own answer (cum is advanced *after* the turn). Ties on
    ``created_at`` are broken by id for determinism."""
    by_id = _by_id(nodes)
    ordered = sorted(nodes, key=lambda n: (n.created_at, n.id))

    branch_total = 0
    linear_total = 0
    cum = 0  # cumulative prompt+answer of all turns created so far
    for node in ordered:
        branch_total += branch_input(node, by_id)
        linear_total += cum + node.prompt_tokens
        cum += node.prompt_tokens + node.answer_tokens

    saved = linear_total - branch_total
    pct = (saved / linear_total * 100.0) if linear_total else 0.0
    return SessionResult(
        n_nodes=len(nodes),
        n_branches=sum(1 for n in nodes if n.edge_kind == "branch"),
        max_branch_depth=max((branch_depth(n, by_id) for n in nodes), default=0),
        branch_total=branch_total,
        linear_total=linear_total,
        saved_tokens=saved,
        saved_pct=pct,
    )


def measure_corpus(sessions: List[List[Node]]) -> dict:
    """Aggregate many sessions.

    - ``mean_pct``: simple mean of per-session saved% — the "trung bình mỗi
      phiên" headline. Empty sessions are skipped so they don't drag the mean.
    - ``pooled_pct``: Σ saved / Σ linear over the whole corpus — a token-weighted
      view that large sessions dominate.
    """
    results = [measure_session(s) for s in sessions]
    nonempty = [r for r in results if r.n_nodes > 0]
    mean_pct = (sum(r.saved_pct for r in nonempty) / len(nonempty)) if nonempty else 0.0
    sum_saved = sum(r.saved_tokens for r in results)
    sum_linear = sum(r.linear_total for r in results)
    pooled_pct = (sum_saved / sum_linear * 100.0) if sum_linear else 0.0
    return {
        "mean_pct": mean_pct,
        "pooled_pct": pooled_pct,
        "total_saved_tokens": sum_saved,
        "total_linear_tokens": sum_linear,
        "per_session": results,
    }
