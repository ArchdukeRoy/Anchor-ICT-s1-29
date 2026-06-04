# test_api.py
# Tests for backend/api/main.py
#
# This test module exercises the FastAPI routes exposed by
# `backend.api.main`. Tests use FastAPI's `TestClient` and a small,
# seeded temporary SQLite database created by `make_test_db()` so the
# suite does not require a running server. The tests are written to be
# deterministic and self-contained — they create and tear down a
# database file for each run and patch the database functions so the
# application code reads from the temporary file.
#
# Commenting style and purpose:
# - Top-level helpers (DB seeding and TestClient wiring) are documented
#   to explain why they patch `__defaults__` and how the test DB is used.
# - Tests are grouped by API area (health, signals, dashboard, graphs)
#   with brief notes describing the assertions and why they validate the
#   behaviour under test.
#
# These comments are designed to help new contributors
# understand test intent and fixture setup.

import json
import os
import sqlite3
import sys
import tempfile
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

import backend.db.db as db_module
import backend.api.main as main_module
from backend.api.main import app


# ---------------------------------------------------------------------------
# Test database setup
# ---------------------------------------------------------------------------

def make_test_db() -> str:
    """Create and seed a temporary SQLite database. Returns the file path."""
    db_file = tempfile.mktemp(suffix=".db")
    conn = sqlite3.connect(db_file)
    conn.executescript("""
        CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT UNIQUE NOT NULL,
            event_date TEXT, cameo_code TEXT, cameo_description TEXT,
            actor1 TEXT, actor2 TEXT, country TEXT, location TEXT,
            latitude REAL, longitude REAL, goldstein_scale REAL,
            num_mentions INTEGER, source_url TEXT,
            ingested_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE signals_event_volume (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL, period TEXT NOT NULL,
            period_type TEXT NOT NULL, event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, period, period_type)
        );
        CREATE TABLE signals_event_type (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL, cameo_root TEXT NOT NULL,
            cameo_description TEXT, event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, cameo_root)
        );
        CREATE TABLE signals_actor_frequency (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL, actor TEXT NOT NULL,
            event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, actor)
        );
        CREATE TABLE signals_location_frequency (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL, location TEXT NOT NULL,
            country TEXT, event_count INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, location)
        );
        CREATE TABLE signals_tone_over_time (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL, period TEXT NOT NULL,
            period_type TEXT NOT NULL, avg_goldstein REAL,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, period, period_type)
        );
        CREATE TABLE signals_actor_location_graph (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL, actor TEXT NOT NULL,
            location TEXT NOT NULL, edge_weight INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, actor, location)
        );
        CREATE TABLE saved_graphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL, query_text TEXT NOT NULL,
            intent_json TEXT NOT NULL, label TEXT,
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
            records_fetched INTEGER, records_inserted INTEGER,
            status TEXT, notes TEXT
        );
    """)

    # Seed events — num_mentions populated to support media attention endpoint tests
    conn.executemany(
        """INSERT INTO events
           (event_id, event_date, cameo_code, actor1, country, location,
            goldstein_scale, num_mentions, source_url)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        [
            ("E001", "2024-01-01", "190", "SAF", "SU", "Khartoum", -10.0, 5, "http://a.com/1"),
            ("E002", "2024-01-01", "181", "RSF", "SU", "Omdurman",  -7.0, 3, "http://a.com/2"),
            ("E003", "2024-01-02", "140", "SAF", "SU", "Khartoum",  -5.0, 2, "http://a.com/3"),
        ]
    )
    conn.executemany(
        "INSERT INTO signals_event_volume (event_config, period, period_type, event_count) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "2024-01-01", "daily",  2),
            ("sudan_2023", "2024-01-02", "daily",  1),
            ("sudan_2023", "2024-W01",   "weekly", 3),
        ]
    )
    conn.executemany(
        "INSERT INTO signals_event_type (event_config, cameo_root, cameo_description, event_count) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "19", "Use of force", 3),
            ("sudan_2023", "18", "Assault",      1),
            ("sudan_2023", "14", "Protest",      1),
        ]
    )
    conn.executemany(
        "INSERT INTO signals_actor_frequency (event_config, actor, event_count) VALUES (?,?,?)",
        [("sudan_2023", "SAF", 2), ("sudan_2023", "RSF", 1)]
    )
    conn.executemany(
        "INSERT INTO signals_location_frequency (event_config, location, country, event_count) VALUES (?,?,?,?)",
        [("sudan_2023", "Khartoum", "SU", 2), ("sudan_2023", "Omdurman", "SU", 1)]
    )
    conn.executemany(
        "INSERT INTO signals_tone_over_time (event_config, period, period_type, avg_goldstein) VALUES (?,?,?,?)",
        [
            ("sudan_2023", "2024-01-01", "daily",  -8.5),
            ("sudan_2023", "2024-W01",   "weekly", -8.0),
        ]
    )
    conn.executemany(
        "INSERT INTO signals_actor_location_graph (event_config, actor, location, edge_weight) VALUES (?,?,?,?)",
        [("sudan_2023", "SAF", "Khartoum", 2), ("sudan_2023", "RSF", "Omdurman", 1)]
    )
    conn.commit()
    conn.close()
    return db_file


def get_client(db_path: str) -> TestClient:
    """
    Return a TestClient with DB_PATH patched on every db.py function.
    db.py functions use DB_PATH as a default argument, so patching the
    module attribute alone is not enough — we must patch each function's
    __defaults__ tuple so calls without an explicit db_path use the test db.
    """
    import backend.db.db as _db
    _db.DB_PATH = db_path
    for fn in [
        _db.get_event_volume, _db.get_event_type, _db.get_actor_frequency,
        _db.get_location_frequency, _db.get_tone_over_time, _db.get_media_attention,
        _db.get_actor_location_graph, _db.get_event_count, _db.get_recent_events,
        _db.get_saved_graphs, _db.save_graph, _db.update_graph_visibility,
        _db.delete_graph, _db.rate_graph, _db.get_graph_ratings,
    ]:
        if fn.__defaults__:
            defaults = list(fn.__defaults__)
            defaults[-1] = db_path
            fn.__defaults__ = tuple(defaults)
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# Tests — health and config
# ---------------------------------------------------------------------------

def test_health(db):
    client = get_client(db)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    print("  PASS — GET /health")


def test_get_events(db):
    client = get_client(db)
    r = client.get("/events")
    assert r.status_code == 200
    data = r.json()
    assert "events" in data and "default" in data
    assert "sudan_2023" in data["events"]
    print(f"  PASS — GET /events: {data}")


# ---------------------------------------------------------------------------
# Tests — signal endpoints
# ---------------------------------------------------------------------------

def test_get_llm_models(db):
    client = get_client(db)
    r = client.get("/llm/models")
    assert r.status_code == 200
    data = r.json()
    assert data["default"] == "phi3:mini"
    assert "phi3:mini" in data["models"]
    assert "gemma3:4b" in data["models"]
    print(f"  PASS - GET /llm/models: {data}")


def test_event_volume_daily(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/event-volume?period_type=daily")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["period"] == "2024-01-01"
    print(f"  PASS — GET /signals/sudan_2023/event-volume?period_type=daily: {len(data)} rows")


def test_event_volume_weekly(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/event-volume?period_type=weekly")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["period"] == "2024-W01"
    print(f"  PASS — GET /signals/sudan_2023/event-volume?period_type=weekly: {data[0]}")


def test_event_volume_invalid_period_type(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/event-volume?period_type=monthly")
    assert r.status_code == 422
    print("  PASS — GET /signals/sudan_2023/event-volume?period_type=monthly returns 422")


def test_event_type(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/event-type")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    assert data[0]["cameo_root"] == "19"
    print(f"  PASS — GET /signals/sudan_2023/event-type: {len(data)} rows, top={data[0]['cameo_root']}")


def test_actor_frequency(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/actor-frequency?limit=1")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["actor"] == "SAF"
    print(f"  PASS — GET /signals/sudan_2023/actor-frequency?limit=1: {data[0]}")


def test_location_frequency(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/location-frequency")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["location"] == "Khartoum"
    print(f"  PASS — GET /signals/sudan_2023/location-frequency: {len(data)} rows")


def test_tone_over_time(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/tone-over-time?period_type=weekly")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["period"] == "2024-W01"
    print(f"  PASS — GET /signals/sudan_2023/tone-over-time?period_type=weekly: {data[0]}")


def test_media_attention_daily(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/media-attention?period_type=daily")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["period"] == "2024-01-01"
    # E001 (5) + E002 (3) = 8 on 2024-01-01
    assert data[0]["total_mentions"] == 8
    print(f"  PASS — GET /signals/sudan_2023/media-attention?period_type=daily: {len(data)} rows, first={data[0]}")


def test_media_attention_weekly(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/media-attention?period_type=weekly")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert "period" in data[0]
    assert "total_mentions" in data[0]
    # E001 (5) + E002 (3) + E003 (2) = 10
    assert data[0]["total_mentions"] == 10
    print(f"  PASS — GET /signals/sudan_2023/media-attention?period_type=weekly: {data[0]}")


def test_media_attention_invalid_period_type(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/media-attention?period_type=monthly")
    assert r.status_code == 422
    print("  PASS — GET /signals/sudan_2023/media-attention?period_type=monthly returns 422")


def test_actor_location_graph(db):
    client = get_client(db)
    r = client.get("/signals/sudan_2023/actor-location-graph")
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data and "edges" in data
    assert len(data["edges"]) == 2
    print(f"  PASS — GET /signals/sudan_2023/actor-location-graph: {len(data['edges'])} edges")


def test_unknown_event_returns_404(db):
    client = get_client(db)
    r = client.get("/signals/nonexistent/event-volume")
    assert r.status_code == 404
    print("  PASS — GET /signals/nonexistent/event-volume returns 404")


# ---------------------------------------------------------------------------
# Tests — dashboard endpoints
# ---------------------------------------------------------------------------

def test_dashboard_summary(db):
    client = get_client(db)
    r = client.get("/dashboard/sudan_2023/summary")
    assert r.status_code == 200
    data = r.json()
    expected_keys = {
        "event_count", "event_volume", "event_type",
        "top_actors", "top_locations", "tone_over_time", "recent_events"
    }
    assert expected_keys == set(data.keys())
    assert data["event_count"] == 3
    assert len(data["top_actors"]) >= 1
    print(f"  PASS — GET /dashboard/sudan_2023/summary: all keys present, event_count={data['event_count']}")


def test_recent_events(db):
    client = get_client(db)
    r = client.get("/dashboard/sudan_2023/recent-events?limit=2")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert data[0]["event_date"] == "2024-01-02"
    print(f"  PASS — GET /dashboard/sudan_2023/recent-events?limit=2: most recent is {data[0]['event_date']}")


# ---------------------------------------------------------------------------
# Tests — saved graphs
# ---------------------------------------------------------------------------

def test_create_and_list_saved_graph(db):
    client = get_client(db)
    payload = {
        "query_text": "Show event volume over time",
        "intent_json": {"chart_type": "line", "signal": "event_volume"},
        "label": "My chart",
    }
    r = client.post("/graphs/sudan_2023", json=payload)
    assert r.status_code == 200
    created = r.json()
    assert "id" in created and created["status"] == "saved"

    r2 = client.get("/graphs/sudan_2023")
    assert r2.status_code == 200
    graphs = r2.json()
    assert any(g["id"] == created["id"] for g in graphs)
    print(f"  PASS — POST /graphs/sudan_2023 and GET /graphs/sudan_2023: id={created['id']}")


def test_hide_saved_graph(db):
    client = get_client(db)
    payload = {"query_text": "Top actors", "intent_json": {"signal": "actor_frequency"}}
    r = client.post("/graphs/sudan_2023", json=payload)
    graph_id = r.json()["id"]

    r2 = client.patch(f"/graphs/{graph_id}/visibility", json={"visible": False})
    assert r2.status_code == 200
    assert r2.json()["visible"] is False

    r3 = client.get("/graphs/sudan_2023")
    assert not any(g["id"] == graph_id for g in r3.json())
    print(f"  PASS — PATCH /graphs/{graph_id}/visibility: graph hidden")


def test_delete_saved_graph(db):
    client = get_client(db)
    payload = {"query_text": "Tone over time", "intent_json": {"signal": "tone_over_time"}}
    r = client.post("/graphs/sudan_2023", json=payload)
    graph_id = r.json()["id"]

    r2 = client.delete(f"/graphs/{graph_id}")
    assert r2.status_code == 200
    assert r2.json()["status"] == "deleted"

    r3 = client.get("/graphs/sudan_2023", params={"include_hidden": True})
    assert not any(g["id"] == graph_id for g in r3.json())
    print(f"  PASS — DELETE /graphs/{graph_id}")


def test_delete_unknown_graph_returns_404(db):
    client = get_client(db)
    r = client.delete("/graphs/99999")
    assert r.status_code == 404
    print("  PASS — DELETE /graphs/99999 returns 404")


# ---------------------------------------------------------------------------
# Tests — ratings
# ---------------------------------------------------------------------------

def test_rate_graph(db):
    client = get_client(db)
    payload = {"query_text": "Actor graph", "intent_json": {"signal": "actor_location_graph"}}
    r = client.post("/graphs/sudan_2023", json=payload)
    graph_id = r.json()["id"]

    r2 = client.post(f"/graphs/{graph_id}/rate", json={"rating": 1})
    assert r2.status_code == 200
    assert r2.json()["rating"] == 1

    r3 = client.post(f"/graphs/{graph_id}/rate", json={"rating": -1})
    assert r3.status_code == 200

    r4 = client.get(f"/graphs/{graph_id}/ratings")
    assert r4.status_code == 200
    summary = r4.json()
    assert summary["thumbs_up"] == 1
    assert summary["thumbs_down"] == 1
    assert summary["total"] == 2
    print(f"  PASS — POST /graphs/{graph_id}/rate and GET /graphs/{graph_id}/ratings: {summary}")


def test_invalid_rating_returns_400(db):
    client = get_client(db)
    payload = {"query_text": "Test", "intent_json": {"signal": "event_volume"}}
    r = client.post("/graphs/sudan_2023", json=payload)
    graph_id = r.json()["id"]

    r2 = client.post(f"/graphs/{graph_id}/rate", json={"rating": 0})
    assert r2.status_code == 400
    print("  PASS — Invalid rating returns 400")


# ---------------------------------------------------------------------------
# Tests — LLM query endpoint
# ---------------------------------------------------------------------------

def test_query_empty_string_returns_400(db):
    client = get_client(db)
    r = client.post("/query", json={"query": "   "})
    assert r.status_code == 400
    print("  PASS — POST /query with empty string returns 400")


def test_query_llm_unavailable_returns_503(db):
    client = get_client(db)
    with patch("backend.api.main._call_llm", side_effect=ConnectionError("Ollama unavailable")):
        r = client.post("/query", json={"query": "Show event volume over time"})
    assert r.status_code == 503
    assert "LLM service unavailable" in r.json()["detail"]
    print("  PASS — POST /query with LLM unavailable returns 503")


def test_query_unknown_event_returns_404(db):
    client = get_client(db)
    r = client.post("/query", json={"query": "Show volume", "event_name": "nonexistent"})
    assert r.status_code == 404
    print("  PASS — POST /query with unknown event returns 404")


def test_query_unknown_model_returns_400(db):
    client = get_client(db)
    r = client.post("/query", json={"query": "Show volume", "model": "unknown:model"})
    assert r.status_code == 400
    assert "Unsupported model" in r.json()["detail"]
    print("  PASS - POST /query with unknown model returns 400")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\nRunning tests for main.py...\n")

    tests = [
        test_health,
        test_get_events,
        test_get_llm_models,
        test_event_volume_daily,
        test_event_volume_weekly,
        test_event_volume_invalid_period_type,
        test_event_type,
        test_actor_frequency,
        test_location_frequency,
        test_tone_over_time,
        test_media_attention_daily,
        test_media_attention_weekly,
        test_media_attention_invalid_period_type,
        test_actor_location_graph,
        test_unknown_event_returns_404,
        test_dashboard_summary,
        test_recent_events,
        test_create_and_list_saved_graph,
        test_hide_saved_graph,
        test_delete_saved_graph,
        test_delete_unknown_graph_returns_404,
        test_rate_graph,
        test_invalid_rating_returns_400,
        test_query_empty_string_returns_400,
        test_query_llm_unavailable_returns_503,
        test_query_unknown_event_returns_404,
        test_query_unknown_model_returns_400,
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
