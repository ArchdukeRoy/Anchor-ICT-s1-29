# db.py
# Query functions for the FastAPI layer.
# Each function opens a connection, queries the relevant table, and returns
# a plain list of dicts that FastAPI can serialise directly to JSON.
# Created, reviewed, tested, and commented by Jesse Ly.

import json
import logging
import sqlite3
from datetime import datetime, timezone

DB_PATH = "anchor.db"

logger = logging.getLogger(__name__)


def _connect(db_path: str = DB_PATH) -> sqlite3.Connection:
    """Return a SQLite connection with row_factory set to return dicts."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------------------------------------------------------------------------
# Signal queries
# ---------------------------------------------------------------------------

def get_event_volume(
    event_name: str,
    period_type: str = "daily",
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return event counts over time for the given event and period type.

    Parameters
    ----------
    event_name : str
        Key from event_config.EVENTS (e.g. "sudan_2023").
    period_type : str
        "daily" or "weekly".

    Returns
    -------
    List of dicts with keys: period, event_count.
    Ordered by period ascending.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT period, event_count
            FROM signals_event_volume
            WHERE event_config = ? AND period_type = ?
            ORDER BY period ASC
            """,
            (event_name, period_type),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_event_type(
    event_name: str,
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return event counts grouped by CAMEO root code for the given event.

    Returns
    -------
    List of dicts with keys: cameo_root, cameo_description, event_count.
    Ordered by event_count descending.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT cameo_root, cameo_description, event_count
            FROM signals_event_type
            WHERE event_config = ?
            ORDER BY event_count DESC
            """,
            (event_name,),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_actor_frequency(
    event_name: str,
    limit: int = 10,
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return the most frequent actors for the given event.

    Parameters
    ----------
    limit : int
        Maximum number of actors to return. Default 10.

    Returns
    -------
    List of dicts with keys: actor, event_count.
    Ordered by event_count descending.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT actor, event_count
            FROM signals_actor_frequency
            WHERE event_config = ?
            ORDER BY event_count DESC
            LIMIT ?
            """,
            (event_name, limit),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_location_frequency(
    event_name: str,
    limit: int = 10,
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return the most frequent locations for the given event.

    Parameters
    ----------
    limit : int
        Maximum number of locations to return. Default 10.

    Returns
    -------
    List of dicts with keys: location, country, event_count.
    Ordered by event_count descending.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT location, country, event_count
            FROM signals_location_frequency
            WHERE event_config = ?
            ORDER BY event_count DESC
            LIMIT ?
            """,
            (event_name, limit),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_tone_over_time(
    event_name: str,
    period_type: str = "weekly",
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return average Goldstein scale over time for the given event.

    Parameters
    ----------
    period_type : str
        "daily" or "weekly". Defaults to weekly for smoother trend lines.

    Returns
    -------
    List of dicts with keys: period, avg_goldstein.
    Ordered by period ascending.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT period, avg_goldstein
            FROM signals_tone_over_time
            WHERE event_config = ? AND period_type = ?
            ORDER BY period ASC
            """,
            (event_name, period_type),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_media_attention(
    event_name: str,
    period_type: str = "daily",
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return total media mentions aggregated by time period.

    The raw events table is event-agnostic, so the event_name parameter is
    preserved for API compatibility but not used in the current schema.
    Queries the raw events table directly as no signal table exists for this.

    Parameters
    ----------
    event_name : str
        Key from event_config.EVENTS (e.g. "sudan_2023").
    period_type : str
        "daily" or "weekly".

    Returns
    -------
    List of dicts with keys: period, total_mentions.
    Ordered by period ascending.
    """
    conn = _connect(db_path)
    try:
        if period_type == "weekly":
            cur = conn.execute(
                """
                SELECT
                    strftime('%Y', event_date) || '-W' ||
                    printf('%02d', (
                        (julianday(date(event_date)) - julianday(
                            strftime('%Y', event_date) || '-01-04'
                        )) / 7 + 1
                    )) AS period,
                    SUM(num_mentions) AS total_mentions
                FROM events
                WHERE num_mentions IS NOT NULL
                GROUP BY period
                ORDER BY period ASC
                """
            )
        else:
            cur = conn.execute(
                """
                SELECT
                    DATE(event_date) AS period,
                    SUM(num_mentions) AS total_mentions
                FROM events
                WHERE num_mentions IS NOT NULL
                GROUP BY period
                ORDER BY period ASC
                """
            )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def get_actor_location_graph(
    event_name: str,
    min_edge_weight: int = 1,
    db_path: str = DB_PATH,
) -> dict:
    """
    Return actor-location graph edges for the given event.

    Parameters
    ----------
    min_edge_weight : int
        Only return edges with weight >= this value. Default 1 (all edges).
        Increase to reduce noise in large graphs.

    Returns
    -------
    Dict with keys:
        nodes  — list of dicts with keys: id, type ("actor" or "location")
        edges  — list of dicts with keys: source, target, weight
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT actor, location, edge_weight
            FROM signals_actor_location_graph
            WHERE event_config = ? AND edge_weight >= ?
            ORDER BY edge_weight DESC
            """,
            (event_name, min_edge_weight),
        )
        rows = cur.fetchall()

        actors = {row["actor"] for row in rows}
        locations = {row["location"] for row in rows}
        nodes = (
            [{"id": a, "type": "actor"} for a in sorted(actors)]
            + [{"id": l, "type": "location"} for l in sorted(locations)]
        )
        edges = [
            {"source": row["actor"], "target": row["location"], "weight": row["edge_weight"]}
            for row in rows
        ]

        return {"nodes": nodes, "edges": edges}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Dashboard summary queries
# ---------------------------------------------------------------------------

def get_event_count(
    event_name: str,
    db_path: str = DB_PATH,
) -> int:
    """
    Return the total number of raw events ingested.

    The raw events table is event-agnostic, so the event_name parameter is
    preserved for API compatibility but not used in the current schema.
    Used for the total count summary card on the dashboard.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute("SELECT COUNT(*) AS count FROM events")
        row = cur.fetchone()
        return row["count"] if row else 0
    finally:
        conn.close()


def get_recent_events(
    event_name: str,
    limit: int = 20,
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return the most recently ingested raw events.

    The raw events table is event-agnostic, so the event_name parameter is
    preserved for API compatibility but not used in the current schema.
    Used for the recent events table on the dashboard.

    Returns
    -------
    List of dicts with keys: event_id, event_date, cameo_code, actor1,
    actor2, country, location, goldstein_scale, num_mentions, source_url.
    Ordered by event_date descending.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT event_id, event_date, cameo_code, actor1, actor2,
                   country, location, goldstein_scale, num_mentions, source_url
            FROM events
            ORDER BY event_date DESC
            LIMIT ?
            """,
            (limit,),
        )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Saved graphs
# ---------------------------------------------------------------------------

def get_saved_graphs(
    event_name: str,
    include_hidden: bool = False,
    db_path: str = DB_PATH,
) -> list[dict]:
    """
    Return saved LLM-generated graphs for the given event.

    Parameters
    ----------
    include_hidden : bool
        If False (default), only return visible graphs (visible = 1).

    Returns
    -------
    List of dicts with keys: id, event_config, query_text, intent_json,
    label, visible, created_at, updated_at.
    Ordered by created_at descending (most recent first).
    """
    conn = _connect(db_path)
    try:
        if include_hidden:
            cur = conn.execute(
                """
                SELECT id, event_config, query_text, intent_json,
                       label, visible, created_at, updated_at
                FROM saved_graphs
                WHERE event_config = ?
                ORDER BY created_at DESC
                """,
                (event_name,),
            )
        else:
            cur = conn.execute(
                """
                SELECT id, event_config, query_text, intent_json,
                       label, visible, created_at, updated_at
                FROM saved_graphs
                WHERE event_config = ? AND visible = 1
                ORDER BY created_at DESC
                """,
                (event_name,),
            )
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def save_graph(
    event_name: str,
    query_text: str,
    intent_json: dict,
    label: str | None = None,
    db_path: str = DB_PATH,
) -> int | None:
    """
    Save a new LLM-generated graph to the database.

    Parameters
    ----------
    intent_json : dict
        The structured JSON intent object returned by the LLM.
        Stored as a JSON string.
    label : str | None
        Optional user-facing label for the saved graph.

    Returns
    -------
    The id of the newly inserted row.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            INSERT INTO saved_graphs (event_config, query_text, intent_json, label)
            VALUES (?, ?, ?, ?)
            """,
            (event_name, query_text, json.dumps(intent_json), label),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def update_graph_visibility(
    graph_id: int,
    visible: bool,
    db_path: str = DB_PATH,
) -> bool:
    """
    Show or hide a saved graph.

    Returns
    -------
    True if a row was updated, False if the graph_id was not found.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            UPDATE saved_graphs
            SET visible = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (1 if visible else 0, graph_id),
        )
        conn.commit()
        return cur.rowcount == 1
    finally:
        conn.close()


def delete_graph(
    graph_id: int,
    db_path: str = DB_PATH,
) -> bool:
    """
    Permanently delete a saved graph and its ratings.

    Returns
    -------
    True if a row was deleted, False if the graph_id was not found.
    """
    conn = _connect(db_path)
    try:
        conn.execute(
            "DELETE FROM graph_ratings WHERE saved_graph_id = ?",
            (graph_id,),
        )
        cur = conn.execute(
            "DELETE FROM saved_graphs WHERE id = ?",
            (graph_id,),
        )
        conn.commit()
        return cur.rowcount == 1
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Graph ratings
# ---------------------------------------------------------------------------

def rate_graph(
    saved_graph_id: int,
    rating: int,
    db_path: str = DB_PATH,
) -> int | None:
    """
    Save a thumbs up (+1) or thumbs down (-1) rating for a saved graph.
    Multiple ratings per graph are allowed (full history is kept).
    Ratings are dev-facing only and hidden from end users.

    Parameters
    ----------
    rating : int
        Must be 1 (thumbs up) or -1 (thumbs down).

    Returns
    -------
    The id of the newly inserted rating row.

    Raises
    ------
    ValueError if rating is not 1 or -1.
    ValueError if saved_graph_id does not exist.
    """
    if rating not in (1, -1):
        raise ValueError(f"rating must be 1 or -1, got {rating}")

    conn = _connect(db_path)
    try:
        cur = conn.execute(
            "SELECT id FROM saved_graphs WHERE id = ?",
            (saved_graph_id,),
        )
        if cur.fetchone() is None:
            raise ValueError(f"saved_graph_id {saved_graph_id} does not exist")

        cur = conn.execute(
            """
            INSERT INTO graph_ratings (saved_graph_id, rating)
            VALUES (?, ?)
            """,
            (saved_graph_id, rating),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_graph_ratings(
    saved_graph_id: int,
    db_path: str = DB_PATH,
) -> dict:
    """
    Return rating summary for a saved graph.
    Dev-facing only.

    Returns
    -------
    Dict with keys: saved_graph_id, thumbs_up, thumbs_down, total.
    """
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            SELECT
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END)  AS thumbs_up,
                SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) AS thumbs_down,
                COUNT(*) AS total
            FROM graph_ratings
            WHERE saved_graph_id = ?
            """,
            (saved_graph_id,),
        )
        row = cur.fetchone()
        return {
            "saved_graph_id": saved_graph_id,
            "thumbs_up":   row["thumbs_up"] or 0,
            "thumbs_down": row["thumbs_down"] or 0,
            "total":       row["total"] or 0,
        }
    finally:
        conn.close()