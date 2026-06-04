# test_db.py
# Tests for backend/db/db.py
#
# Unit tests for the low-level database helper functions in
# `backend.db.db`. These tests use a temporary SQLite database file
# (created by `make_test_db()`) so that the production database is never
# modified. The seeded data is intentionally small and deterministic so
# assertions can reason about exact counts and top values.
#
# What these tests document for new readers:
# - Why a file-based temporary DB is used (so db.py functions can open
#   their own connections using a path argument).
# - The expected shape of seeded data and how it supports specific
#   endpoint behaviours (e.g., `num_mentions` values support media
#   attention sums).
# - Test grouping reflects the public functions exported by `db.py`.
#
 
import json
import sqlite3
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.db.db import (
    get_event_volume,
    get_event_type,
    get_actor_frequency,
    get_location_frequency,
    get_tone_over_time,
    get_media_attention,
    get_actor_location_graph,
    get_event_count,
    get_recent_events,
    get_saved_graphs,
    save_graph,
    update_graph_visibility,
    delete_graph,
    rate_graph,
    get_graph_ratings,
)


# ---------------------------------------------------------------------------
# Test database setup
# ---------------------------------------------------------------------------

def make_test_db() -> str:
    """
    Create a fully seeded temporary SQLite database and return its path.
    Uses a file path so db.py functions can open their own connections.
    """
    import tempfile
    db_file = tempfile.mktemp(suffix=".db")

    conn = sqlite3.connect(db_file)
    conn.executescript("""
        CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT UNIQUE NOT NULL,
            event_date TEXT,
            cameo_code TEXT,
            cameo_description TEXT,
            actor1 TEXT,
            actor2 TEXT,
            country TEXT,
            location TEXT,
            latitude REAL,
            longitude REAL,
            goldstein_scale REAL,
            num_mentions INTEGER,
            source_url TEXT,
            ingested_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE signals_event_volume (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            period TEXT NOT NULL,
            period_type TEXT NOT NULL,
            event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, period, period_type)
        );
        CREATE TABLE signals_event_type (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            cameo_root TEXT NOT NULL,
            cameo_description TEXT,
            event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, cameo_root)
        );
        CREATE TABLE signals_actor_frequency (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            actor TEXT NOT NULL,
            event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, actor)
        );
        CREATE TABLE signals_location_frequency (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            location TEXT NOT NULL,
            country TEXT,
            event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, location)
        );
        CREATE TABLE signals_tone_over_time (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            period TEXT NOT NULL,
            period_type TEXT NOT NULL,
            avg_goldstein REAL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, period, period_type)
        );
        CREATE TABLE signals_actor_location_graph (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            actor TEXT NOT NULL,
            location TEXT NOT NULL,
            edge_weight INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, actor, location)
        );
        CREATE TABLE saved_graphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            query_text TEXT NOT NULL,
            intent_json TEXT NOT NULL,
            label TEXT,
            visible INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE graph_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            saved_graph_id INTEGER NOT NULL REFERENCES saved_graphs(id),
            rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
            rated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE ingestion_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            run_at TEXT DEFAULT (datetime('now')),
            records_fetched INTEGER,
            records_inserted INTEGER,
            status TEXT,
            notes TEXT
        );
    """)

    # Seed events — num_mentions set on all rows to support media attention tests
    conn.executemany(
        """INSERT INTO events
           (event_id, event_date, cameo_code, actor1, actor2, country, location,
            goldstein_scale, num_mentions, source_url)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        [
            ("E001", "2024-01-01", "190", "SAF", "RSF", "SU", "Khartoum",  -10.0, 5, "http://a.com/1"),
            ("E002", "2024-01-01", "181", "RSF", None,  "SU", "Omdurman",   -7.0, 3, "http://a.com/2"),
            ("E003", "2024-01-02", "140", "SAF", None,  "SU", "Khartoum",   -5.0, 2, "http://a.com/3"),
            ("E004", "2024-01-02", "190", "UN",  "SAF", "SU", "Darfur",    -10.0, 8, "http://a.com/4"),
            ("E005", "2024-01-03", "200", "RSF", None,  "SU", "Khartoum",  -10.0, 4, "http://a.com/5"),
        ]
    )

    conn.executemany(
        "INSERT INTO signals_event_volume (event_config, period, period_type, event_count) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "2024-01-01", "daily",  2),
            ("sudan_2023", "2024-01-02", "daily",  2),
            ("sudan_2023", "2024-01-03", "daily",  1),
            ("sudan_2023", "2024-W01",   "weekly", 5),
        ]
    )

    conn.executemany(
        "INSERT INTO signals_event_type (event_config, cameo_root, cameo_description, event_count) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "19", "Use of force", 2),
            ("sudan_2023", "18", "Assault",      1),
            ("sudan_2023", "14", "Protest",      1),
            ("sudan_2023", "20", "Mass violence",1),
        ]
    )

    conn.executemany(
        "INSERT INTO signals_actor_frequency (event_config, actor, event_count) VALUES (?,?,?)",
        [
            ("sudan_2023", "SAF", 3),
            ("sudan_2023", "RSF", 2),
            ("sudan_2023", "UN",  1),
        ]
    )

    conn.executemany(
        "INSERT INTO signals_location_frequency (event_config, location, country, event_count) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "Khartoum", "SU", 3),
            ("sudan_2023", "Omdurman", "SU", 1),
            ("sudan_2023", "Darfur",   "SU", 1),
        ]
    )

    conn.executemany(
        "INSERT INTO signals_tone_over_time (event_config, period, period_type, avg_goldstein) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "2024-01-01", "daily",   -8.5),
            ("sudan_2023", "2024-01-02", "daily",   -7.5),
            ("sudan_2023", "2024-01-03", "daily",  -10.0),
            ("sudan_2023", "2024-W01",   "weekly",  -8.67),
        ]
    )

    conn.executemany(
        "INSERT INTO signals_actor_location_graph (event_config, actor, location, edge_weight) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "SAF", "Khartoum", 2),
            ("sudan_2023", "SAF", "Darfur",   1),
            ("sudan_2023", "RSF", "Omdurman", 1),
            ("sudan_2023", "UN",  "Darfur",   1),
        ]
    )

    conn.commit()
    conn.close()
    return db_file


# ---------------------------------------------------------------------------
# Tests — event volume
# ---------------------------------------------------------------------------

def test_get_event_volume_daily(db):
    rows = get_event_volume("sudan_2023", period_type="daily", db_path=db)
    assert len(rows) == 3
    assert rows[0]["period"] == "2024-01-01"
    assert rows[0]["event_count"] == 2
    print(f"  PASS — get_event_volume() daily: {len(rows)} rows, first={rows[0]}")


def test_get_event_volume_weekly(db):
    rows = get_event_volume("sudan_2023", period_type="weekly", db_path=db)
    assert len(rows) == 1
    assert rows[0]["period"] == "2024-W01"
    assert rows[0]["event_count"] == 5
    print(f"  PASS — get_event_volume() weekly: {rows[0]}")


# ---------------------------------------------------------------------------
# Tests — event type
# ---------------------------------------------------------------------------

def test_get_event_type(db):
    rows = get_event_type("sudan_2023", db_path=db)
    assert len(rows) == 4
    assert rows[0]["cameo_root"] == "19"
    assert rows[0]["event_count"] == 2
    print(f"  PASS — get_event_type(): {len(rows)} rows, top={rows[0]}")


# ---------------------------------------------------------------------------
# Tests — actor frequency
# ---------------------------------------------------------------------------

def test_get_actor_frequency_default_limit(db):
    rows = get_actor_frequency("sudan_2023", db_path=db)
    assert len(rows) == 3
    assert rows[0]["actor"] == "SAF"
    assert rows[0]["event_count"] == 3
    print(f"  PASS — get_actor_frequency() default limit: {rows}")


def test_get_actor_frequency_with_limit(db):
    rows = get_actor_frequency("sudan_2023", limit=1, db_path=db)
    assert len(rows) == 1
    assert rows[0]["actor"] == "SAF"
    print(f"  PASS — get_actor_frequency() limit=1: {rows[0]}")


# ---------------------------------------------------------------------------
# Tests — location frequency
# ---------------------------------------------------------------------------

def test_get_location_frequency(db):
    rows = get_location_frequency("sudan_2023", db_path=db)
    assert len(rows) == 3
    assert rows[0]["location"] == "Khartoum"
    assert rows[0]["event_count"] == 3
    print(f"  PASS — get_location_frequency(): {len(rows)} rows, top={rows[0]}")


# ---------------------------------------------------------------------------
# Tests — tone over time
# ---------------------------------------------------------------------------

def test_get_tone_over_time_weekly(db):
    rows = get_tone_over_time("sudan_2023", period_type="weekly", db_path=db)
    assert len(rows) == 1
    assert rows[0]["period"] == "2024-W01"
    assert rows[0]["avg_goldstein"] == -8.67
    print(f"  PASS — get_tone_over_time() weekly: {rows[0]}")


def test_get_tone_over_time_daily(db):
    rows = get_tone_over_time("sudan_2023", period_type="daily", db_path=db)
    assert len(rows) == 3
    assert rows[0]["period"] == "2024-01-01"
    print(f"  PASS — get_tone_over_time() daily: {len(rows)} rows")


# ---------------------------------------------------------------------------
# Tests — media attention
# ---------------------------------------------------------------------------

def test_get_media_attention_daily(db):
    rows = get_media_attention("sudan_2023", period_type="daily", db_path=db)
    assert isinstance(rows, list)
    assert len(rows) == 3
    assert rows[0]["period"] == "2024-01-01"
    # E001 (5) + E002 (3) = 8 mentions on 2024-01-01
    assert rows[0]["total_mentions"] == 8
    assert rows[1]["total_mentions"] == 10  # E003 (2) + E004 (8)
    assert rows[2]["total_mentions"] == 4   # E005 (4)
    print(f"  PASS — get_media_attention() daily: {len(rows)} rows, first={rows[0]}")


def test_get_media_attention_weekly(db):
    rows = get_media_attention("sudan_2023", period_type="weekly", db_path=db)
    assert isinstance(rows, list)
    assert len(rows) == 1
    assert "period" in rows[0]
    assert "total_mentions" in rows[0]
    # All 5 events fall in the same week: 5+3+2+8+4 = 22
    assert rows[0]["total_mentions"] == 22
    print(f"  PASS — get_media_attention() weekly: {rows[0]}")


# ---------------------------------------------------------------------------
# Tests — actor location graph
# ---------------------------------------------------------------------------

def test_get_actor_location_graph_structure(db):
    result = get_actor_location_graph("sudan_2023", db_path=db)
    assert "nodes" in result and "edges" in result
    actors = [n for n in result["nodes"] if n["type"] == "actor"]
    locations = [n for n in result["nodes"] if n["type"] == "location"]
    assert len(actors) >= 1
    assert len(locations) >= 1
    assert len(result["edges"]) == 4
    print(f"  PASS — get_actor_location_graph(): {len(actors)} actors, {len(locations)} locations, {len(result['edges'])} edges")


def test_get_actor_location_graph_min_weight(db):
    result = get_actor_location_graph("sudan_2023", min_edge_weight=2, db_path=db)
    assert len(result["edges"]) == 1
    assert result["edges"][0]["source"] == "SAF"
    assert result["edges"][0]["target"] == "Khartoum"
    assert result["edges"][0]["weight"] == 2
    print(f"  PASS — get_actor_location_graph() min_weight=2: {result['edges']}")


# ---------------------------------------------------------------------------
# Tests — dashboard summary queries
# ---------------------------------------------------------------------------

def test_get_event_count(db):
    count = get_event_count("sudan_2023", db_path=db)
    assert count == 5, f"Expected 5, got {count}"
    print(f"  PASS — get_event_count(): {count}")


def test_get_recent_events(db):
    rows = get_recent_events("sudan_2023", limit=3, db_path=db)
    assert len(rows) == 3
    assert rows[0]["event_date"] == "2024-01-03"
    assert "source_url" in rows[0]
    print(f"  PASS — get_recent_events() limit=3: most recent is {rows[0]['event_date']}")


# ---------------------------------------------------------------------------
# Tests — saved graphs
# ---------------------------------------------------------------------------

def test_save_graph_returns_id(db):
    intent = {"chart_type": "line", "signal": "event_volume", "period_type": "daily"}
    graph_id = save_graph("sudan_2023", "Show event volume over time", intent, label="My chart", db_path=db)
    assert graph_id is not None
    assert isinstance(graph_id, int) and graph_id > 0
    print(f"  PASS — save_graph() returned id: {graph_id}")


def test_get_saved_graphs_visible_only(db):
    intent = {"chart_type": "bar", "signal": "actor_frequency"}
    save_graph("sudan_2023", "Top actors", intent, db_path=db)
    rows = get_saved_graphs("sudan_2023", db_path=db)
    assert len(rows) >= 1
    assert all(r["visible"] == 1 for r in rows)
    print(f"  PASS — get_saved_graphs() visible only: {len(rows)} graph(s)")


def test_update_graph_visibility_hide(db):
    intent = {"chart_type": "pie", "signal": "event_type"}
    graph_id = save_graph("sudan_2023", "Event types", intent, db_path=db)
    assert graph_id is not None
    result = update_graph_visibility(graph_id, visible=False, db_path=db)
    assert result is True
    rows = get_saved_graphs("sudan_2023", db_path=db)
    assert not any(r["id"] == graph_id for r in rows)
    all_rows = get_saved_graphs("sudan_2023", include_hidden=True, db_path=db)
    hidden = [r for r in all_rows if r["id"] == graph_id]
    assert len(hidden) == 1 and hidden[0]["visible"] == 0
    print(f"  PASS — update_graph_visibility() hide: graph {graph_id} hidden correctly")


def test_update_graph_visibility_unknown_id(db):
    result = update_graph_visibility(99999, visible=False, db_path=db)
    assert result is False
    print("  PASS — update_graph_visibility() returns False for unknown id")


def test_delete_graph(db):
    intent = {"chart_type": "line", "signal": "tone_over_time"}
    graph_id = save_graph("sudan_2023", "Tone over time", intent, db_path=db)
    assert graph_id is not None
    rate_graph(graph_id, 1, db_path=db)
    result = delete_graph(graph_id, db_path=db)
    assert result is True
    all_rows = get_saved_graphs("sudan_2023", include_hidden=True, db_path=db)
    assert not any(r["id"] == graph_id for r in all_rows)
    print(f"  PASS — delete_graph() removed graph {graph_id} and its ratings")


def test_delete_graph_unknown_id(db):
    result = delete_graph(99999, db_path=db)
    assert result is False
    print("  PASS — delete_graph() returns False for unknown id")


# ---------------------------------------------------------------------------
# Tests — graph ratings
# ---------------------------------------------------------------------------

def test_rate_graph_thumbs_up(db):
    intent = {"chart_type": "bar", "signal": "location_frequency"}
    graph_id = save_graph("sudan_2023", "Top locations", intent, db_path=db)
    assert graph_id is not None
    rating_id = rate_graph(graph_id, 1, db_path=db)
    assert isinstance(rating_id, int) and rating_id > 0
    print(f"  PASS — rate_graph() thumbs up: rating id {rating_id}")


def test_rate_graph_thumbs_down(db):
    intent = {"chart_type": "bar", "signal": "actor_frequency"}
    graph_id = save_graph("sudan_2023", "Actor freq", intent, db_path=db)
    assert graph_id is not None
    rating_id = rate_graph(graph_id, -1, db_path=db)
    assert isinstance(rating_id, int) and rating_id > 0
    print(f"  PASS — rate_graph() thumbs down: rating id {rating_id}")


def test_rate_graph_invalid_rating(db):
    intent = {"chart_type": "line", "signal": "event_volume"}
    graph_id = save_graph("sudan_2023", "Volume", intent, db_path=db)
    assert graph_id is not None
    raised = False
    try:
        rate_graph(graph_id, 0, db_path=db)
    except ValueError:
        raised = True
    assert raised, "Should raise ValueError for rating=0"
    print("  PASS — rate_graph() raises ValueError for invalid rating")


def test_rate_graph_unknown_graph_id(db):
    raised = False
    try:
        rate_graph(99999, 1, db_path=db)
    except ValueError:
        raised = True
    assert raised, "Should raise ValueError for unknown graph id"
    print("  PASS — rate_graph() raises ValueError for unknown saved_graph_id")


def test_get_graph_ratings_summary(db):
    intent = {"chart_type": "network", "signal": "actor_location_graph"}
    graph_id = save_graph("sudan_2023", "Actor graph", intent, db_path=db)
    assert graph_id is not None
    rate_graph(graph_id, 1, db_path=db)
    rate_graph(graph_id, 1, db_path=db)
    rate_graph(graph_id, -1, db_path=db)
    summary = get_graph_ratings(graph_id, db_path=db)
    assert summary["saved_graph_id"] == graph_id
    assert summary["thumbs_up"] == 2
    assert summary["thumbs_down"] == 1
    assert summary["total"] == 3
    print(f"  PASS — get_graph_ratings(): {summary}")


def test_get_graph_ratings_empty(db):
    intent = {"chart_type": "line", "signal": "event_volume"}
    graph_id = save_graph("sudan_2023", "No ratings yet", intent, db_path=db)
    assert graph_id is not None
    summary = get_graph_ratings(graph_id, db_path=db)
    assert summary["thumbs_up"] == 0
    assert summary["thumbs_down"] == 0
    assert summary["total"] == 0
    print(f"  PASS — get_graph_ratings() with no ratings: {summary}")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\nRunning tests for db.py...\n")

    tests = [
        test_get_event_volume_daily,
        test_get_event_volume_weekly,
        test_get_event_type,
        test_get_actor_frequency_default_limit,
        test_get_actor_frequency_with_limit,
        test_get_location_frequency,
        test_get_tone_over_time_weekly,
        test_get_tone_over_time_daily,
        test_get_media_attention_daily,
        test_get_media_attention_weekly,
        test_get_actor_location_graph_structure,
        test_get_actor_location_graph_min_weight,
        test_get_event_count,
        test_get_recent_events,
        test_save_graph_returns_id,
        test_get_saved_graphs_visible_only,
        test_update_graph_visibility_hide,
        test_update_graph_visibility_unknown_id,
        test_delete_graph,
        test_delete_graph_unknown_id,
        test_rate_graph_thumbs_up,
        test_rate_graph_thumbs_down,
        test_rate_graph_invalid_rating,
        test_rate_graph_unknown_graph_id,
        test_get_graph_ratings_summary,
        test_get_graph_ratings_empty,
    ]

    passed = 0
    failed = 0

    for t in tests:
        db = make_test_db()
        try:
            t(db)
            passed += 1
        except Exception as e:
            print(f"  FAIL — {t.__name__}: {e}")
            failed += 1
        finally:
            try:
                os.remove(db)
            except OSError:
                pass

    print(f"\nResults: {passed} passed, {failed} failed out of {len(tests)} tests")