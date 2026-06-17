"""Load real conversations from the BranchChat SQLite DB into measure.Node lists.

Reads the ``conversations`` table written by src/backend/db.py: each row's
``data`` column is the PersistedState JSON, whose ``conversation.nodes`` is the
tree. Each message's content is tokenized via the offline counter.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import List, Optional, Tuple

from measure import Node
from tokenizer import count_tokens

# Mirror db.py's default: env DB_PATH, else <repo>/src/backend/branchchat.db.
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = os.environ.get(
    "DB_PATH", str(_REPO_ROOT / "src" / "backend" / "branchchat.db")
)


def _node_from_json(raw: dict) -> Node:
    prompt = 0
    answer = 0
    created: Optional[int] = None
    for m in raw.get("messages", []):
        toks = count_tokens(m.get("content", "") or "")
        if m.get("role") == "assistant":
            answer += toks
        else:  # user / system both count as prompt
            prompt += toks
        ts = m.get("createdAt")
        if ts is not None:
            created = ts if created is None else min(created, ts)
    return Node(
        id=raw["id"],
        parent_id=raw.get("parentId"),
        edge_kind=raw.get("edgeKind", "continue"),
        prompt_tokens=prompt,
        answer_tokens=answer,
        created_at=created if created is not None else 0,
    )


def load_sessions(db_path: str = DEFAULT_DB) -> List[Tuple[str, List[Node]]]:
    """Return ``(title, nodes)`` for every stored conversation."""
    if not Path(db_path).exists():
        raise FileNotFoundError(f"Không tìm thấy DB: {db_path}")
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute("SELECT data FROM conversations").fetchall()
    finally:
        conn.close()

    sessions: List[Tuple[str, List[Node]]] = []
    for (data,) in rows:
        state = json.loads(data)
        conv = state.get("conversation", {})
        title = conv.get("title") or conv.get("id") or "(untitled)"
        nodes = [_node_from_json(n) for n in conv.get("nodes", [])]
        sessions.append((title, nodes))
    return sessions
