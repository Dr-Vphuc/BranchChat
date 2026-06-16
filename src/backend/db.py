"""SQLite persistence for BranchChat conversations.

Each conversation is stored as one row: lightweight columns for the history
list/search (title, timestamps, node_count) plus a `data` column holding the full
PersistedState JSON the frontend round-trips (conversation tree + viewport +
activeNodeId). A tiny `app_state` table remembers the last-active conversation.

Single-user for now: every row is scoped by `user_id`, hardcoded to a default in
main.py. That column is the only seam to replace when real accounts arrive.
"""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

# Where the SQLite file lives. In Docker this points at a mounted volume (see
# docker-compose.yml) so data survives `docker compose up --build`.
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "branchchat.db"))


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """A short-lived connection — one per call. Endpoints run in a threadpool, so
    sharing a connection across threads would be unsafe; opening per call is cheap
    for SQLite. WAL keeps the frequent autosave writes from blocking reads."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create the schema if missing. Safe to call on every startup."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
              id          TEXT PRIMARY KEY,
              user_id     TEXT NOT NULL DEFAULT 'local',
              title       TEXT NOT NULL,
              created_at  INTEGER NOT NULL,
              updated_at  INTEGER NOT NULL,
              node_count  INTEGER NOT NULL,
              data        TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_conv_user_updated
              ON conversations(user_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS app_state (
              user_id        TEXT PRIMARY KEY,
              last_active_id TEXT
            );
            """
        )


def _meta(row: sqlite3.Row) -> dict:
    """Map a DB row to the frontend ConversationMeta shape (camelCase keys)."""
    return {
        "id": row["id"],
        "title": row["title"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "nodeCount": row["node_count"],
    }


def list_metas(user: str) -> list[dict]:
    """The history index for one user — metadata only, most-recent first."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at, node_count "
            "FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
            (user,),
        ).fetchall()
    return [_meta(r) for r in rows]


def get_conversation(user: str, cid: str) -> Optional[dict]:
    """Return the full PersistedState for one conversation, or None if absent."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT data FROM conversations WHERE user_id = ? AND id = ?",
            (user, cid),
        ).fetchone()
    return json.loads(row["data"]) if row else None


def upsert_conversation(user: str, state: dict) -> list[dict]:
    """Insert or update one conversation from its PersistedState; return the
    refreshed index so the caller can mirror it into the UI. `created_at` is kept
    from the existing row on update (only set on first insert)."""
    conv = state["conversation"]
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO conversations
              (id, user_id, title, created_at, updated_at, node_count, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title      = excluded.title,
              updated_at = excluded.updated_at,
              node_count = excluded.node_count,
              data       = excluded.data
            """,
            (
                conv["id"],
                user,
                conv.get("title") or "Untitled",
                int(conv["createdAt"]),
                int(conv["updatedAt"]),
                len(conv.get("nodes", [])),
                json.dumps(state, ensure_ascii=False),
            ),
        )
    return list_metas(user)


def delete_conversation(user: str, cid: str) -> list[dict]:
    """Delete one conversation and clear it from last-active if it was current."""
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM conversations WHERE user_id = ? AND id = ?", (user, cid)
        )
        conn.execute(
            "UPDATE app_state SET last_active_id = NULL "
            "WHERE user_id = ? AND last_active_id = ?",
            (user, cid),
        )
    return list_metas(user)


def get_last_active(user: str) -> Optional[str]:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT last_active_id FROM app_state WHERE user_id = ?", (user,)
        ).fetchone()
    return row["last_active_id"] if row else None


def set_last_active(user: str, cid: str) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO app_state (user_id, last_active_id) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET last_active_id = excluded.last_active_id
            """,
            (user, cid),
        )
