"""Synthetic conversation trees with controlled per-turn token sizes.

The savings metric only depends on tree shape + token sizes, so fixtures emit
``Node`` objects with chosen sizes directly (no text → tokenizer-independent).
The sizes below are *modelling assumptions* about a "typical" turn — tweak them
to match your own usage.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

from measure import Node

# Modelling assumptions for a "typical" turn (in tokens).
Q_TOKENS = 20    # a user question
A_TOKENS = 300   # an assistant answer


def gen_tree(
    main_len: int,
    branches: Sequence[Tuple[int, int]] = (),
    q_tokens: int = Q_TOKENS,
    a_tokens: int = A_TOKENS,
) -> List[Node]:
    """Build a tree and return its nodes in creation order.

    - A main 'continue' spine of ``main_len`` nodes (m0→m1→…).
    - Each entry in ``branches`` is ``(fork_at, length)``: a 'branch' child off
      main node index ``fork_at`` (0-based), then ``length-1`` 'continue' nodes
      below it.
    - ``created_at`` increases in creation order: the whole main spine first,
      then each branch in the order given.
    """
    nodes: List[Node] = []
    clock = 0

    def add(node_id: str, parent_id, edge_kind: str) -> str:
        nonlocal clock
        clock += 1
        nodes.append(Node(node_id, parent_id, edge_kind, q_tokens, a_tokens, clock))
        return node_id

    # Main spine.
    main_ids: List[str] = []
    prev = None
    for i in range(main_len):
        prev = add(f"m{i}", prev, "continue")
        main_ids.append(prev)

    # Side branches.
    for bi, (fork_at, length) in enumerate(branches):
        parent = main_ids[fork_at]
        for j in range(length):
            parent = add(f"b{bi}_{j}", parent, "branch" if j == 0 else "continue")

    return nodes


def archetypes() -> List[Tuple[str, str, List[Node]]]:
    """Named representative trees as ``(name, description, nodes)``."""
    return [
        (
            "linear_only",
            "10 lượt nối tiếp, không rẽ nhánh (kiểm chứng ~0%)",
            gen_tree(10),
        ),
        (
            "research_with_tangents",
            "main 8 lượt + 3 nhánh lạc đề (dài 3) tách sớm",
            gen_tree(8, branches=[(1, 3), (2, 3), (3, 3)]),
        ),
        (
            "wide_comparison",
            "1 gốc + 6 nhánh ngắn (dài 2) so sánh phương án",
            gen_tree(1, branches=[(0, 2)] * 6),
        ),
        (
            "deep_with_late_branch",
            "main 12 lượt + 2 nhánh tách muộn (dài 4)",
            gen_tree(12, branches=[(9, 4), (10, 4)]),
        ),
    ]
