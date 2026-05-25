# test_signal_builder.py
# Tests for backend/ingestion/signal_builder.py
# Uses in-memory SQLite and synthetic DataFrames — does not touch anchor.db.
# Created, reviewed, tested, and commented by Jesse Ly.

import sqlite3
import sys
import os

import pandas as pd
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ingestion.signal_builder import (
    build_event_volume,
    build_event_type,
    build_actor_frequency,
    build_location_frequency,
    build_tone_over_time,
    build_actor_location_graph,
    build_all_signals,
    _week_label,
    _load_events,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_test_db() -> sqlite3.Connection:
    """In-memory SQLite DB with all required signal tables and events table."""
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS events (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id         TEXT UNIQUE NOT NULL,
            event_date       TEXT,
            cameo_code       TEXT,
            cameo_description TEXT,
            actor1           TEXT,
            actor2           TEXT,
            country          TEXT,
            location         TEXT,
            latitude         REAL,
            longitude        REAL,
            goldstein_scale  REAL,
            num_mentions     INTEGER,
            source_url       TEXT,
            ingested_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS signals_event_volume (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            period       TEXT NOT NULL,
            period_type  TEXT NOT NULL CHECK(period_type IN ('daily','weekly')),
            event_count  INTEGER NOT NULL,
            updated_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, period, period_type)
        );

        CREATE TABLE IF NOT EXISTS signals_event_type (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config     TEXT NOT NULL,
            cameo_root       TEXT NOT NULL,
            cameo_description TEXT,
            event_count      INTEGER NOT NULL,
            updated_at       TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, cameo_root)
        );

        CREATE TABLE IF NOT EXISTS signals_actor_frequency (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            actor        TEXT NOT NULL,
            event_count  INTEGER NOT NULL,
            updated_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, actor)
        );

        CREATE TABLE IF NOT EXISTS signals_location_frequency (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            location     TEXT NOT NULL,
            country      TEXT,
            event_count  INTEGER NOT NULL,
            updated_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, location)
        );

        CREATE TABLE IF NOT EXISTS signals_tone_over_time (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config  TEXT NOT NULL,
            period        TEXT NOT NULL,
            period_type   TEXT NOT NULL CHECK(period_type IN ('daily','weekly')),
            avg_goldstein REAL,
            updated_at    TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, period, period_type)
        );

        CREATE TABLE IF NOT EXISTS signals_actor_location_graph (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            actor        TEXT NOT NULL,
            location     TEXT NOT NULL,
            edge_weight  INTEGER NOT NULL DEFAULT 1,
            updated_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(event_config, actor, location)
        );
    """)
    return conn


def make_test_df() -> pd.DataFrame:
    """
    Synthetic events DataFrame with known values for deterministic assertions.
    5 rows across 2 dates, 2 CAMEO roots, 4 actors, 3 locations.
    actor2 values are included to exercise actor frequency and actor-location graph logic.
    Row 3 has null actor1 to test null-skipping behaviour for actor1 while still counting actor2.
    """
    return pd.DataFrame({
        "event_date":      pd.to_datetime(["2026-04-01", "2026-04-01", "2026-04-02",
                                           "2026-04-02", "2026-04-02"]),
        "cameo_code":      ["140", "181", "190", "181", "140"],
        "actor1":          ["ActorA", "ActorB", "ActorA", None,    "ActorC"],
        "actor2":          ["ActorB", "ActorC", None,    "ActorD", "ActorA"],
        "country":         ["SU",     "SU",     "US",    "SU",    "SU"],
        "location":        ["Khartoum", "Omdurman", "Khartoum", "Darfur", "Omdurman"],
        "goldstein_scale": [-5.0,    -7.0,     -10.0,   -3.0,    -8.0],
        "num_mentions":    [3,        5,         2,       8,       1],
        "source_url":      [f"http://example.com/{i}" for i in range(5)],
    })


# ---------------------------------------------------------------------------
# Tests — _week_label
# ---------------------------------------------------------------------------

def test_week_label_format():
    ts = pd.Timestamp("2026-04-01")
    label = _week_label(ts)
    assert label.startswith("2026-W"), f"Expected '2026-W...', got '{label}'"
    parts = label.split("-W")
    assert len(parts) == 2 and parts[1].isdigit()
    print(f"  PASS — _week_label() returned: {label}")


# ---------------------------------------------------------------------------
# Tests — _load_events
# ---------------------------------------------------------------------------

def test_load_events_returns_dataframe():
    """Verify _load_events reads the events table and parses event_date."""
    conn = make_test_db()
    conn.execute("""
        INSERT INTO events (event_id, event_date, cameo_code, actor1, country, location, goldstein_scale, num_mentions)
        VALUES ('EVT001', '2026-04-01', '140', 'ActorA', 'SU', 'Khartoum', -5.0, 3)
    """)
    conn.commit()
    df = _load_events(conn)
    assert len(df) == 1
    assert pd.api.types.is_datetime64_any_dtype(df["event_date"])
    conn.close()
    print("  PASS — _load_events() returns DataFrame with parsed event_date")


# ---------------------------------------------------------------------------
# Tests — build_event_volume
# ---------------------------------------------------------------------------

def test_event_volume_daily_and_weekly():
    conn = make_test_db()
    df = make_test_df()
    count = build_event_volume(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT period_type, COUNT(*) FROM signals_event_volume GROUP BY period_type")
    rows = dict(cur.fetchall())

    assert rows.get("daily") == 2, f"Expected 2 daily rows, got {rows.get('daily')}"
    assert (rows.get("weekly") or 0) >= 1, "Expected at least 1 weekly row"
    assert count == rows["daily"] + rows["weekly"]
    conn.close()
    print(f"  PASS — build_event_volume(): {rows['daily']} daily, {rows['weekly']} weekly rows")


def test_event_volume_correct_counts():
    conn = make_test_db()
    df = make_test_df()
    build_event_volume(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT period, event_count FROM signals_event_volume WHERE period_type='daily' ORDER BY period")
    rows = dict(cur.fetchall())

    assert rows["2026-04-01"] == 2, f"Expected 2 for Apr 1, got {rows['2026-04-01']}"
    assert rows["2026-04-02"] == 3, f"Expected 3 for Apr 2, got {rows['2026-04-02']}"
    conn.close()
    print(f"  PASS — build_event_volume() daily counts correct: {rows}")


def test_event_volume_upsert_updates_count():
    conn = make_test_db()
    df = make_test_df()
    build_event_volume(conn, df, "sudan_2023")

    extra = pd.DataFrame({
        "event_date":      pd.to_datetime(["2026-04-01"]),
        "cameo_code":      ["140"],
        "actor1":          ["ActorD"],
        "actor2":          [None],
        "country":         ["SU"],
        "location":        ["Khartoum"],
        "goldstein_scale": [-5.0],
        "num_mentions":    [1],
        "source_url":      ["http://x.com"],
    })
    build_event_volume(conn, pd.concat([df, extra], ignore_index=True), "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT event_count FROM signals_event_volume WHERE period='2026-04-01' AND period_type='daily'")
    count = cur.fetchone()[0]
    assert count == 3, f"Expected updated count of 3, got {count}"
    conn.close()
    print(f"  PASS — build_event_volume() upsert correctly updated count to {count}")


# ---------------------------------------------------------------------------
# Tests — build_event_type
# ---------------------------------------------------------------------------

def test_event_type_correct_roots():
    conn = make_test_db()
    df = make_test_df()
    build_event_type(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT cameo_root, event_count FROM signals_event_type ORDER BY cameo_root")
    rows = dict(cur.fetchall())

    # cameo codes: 140, 181, 190, 181, 140 → roots: 14(×2), 18(×2), 19(×1)
    assert rows.get("14") == 2, f"Expected 2 for root 14, got {rows.get('14')}"
    assert rows.get("18") == 2, f"Expected 2 for root 18, got {rows.get('18')}"
    assert rows.get("19") == 1, f"Expected 1 for root 19, got {rows.get('19')}"
    conn.close()
    print(f"  PASS — build_event_type() roots correct: {rows}")


def test_event_type_cameo_description_populated():
    conn = make_test_db()
    df = make_test_df()
    build_event_type(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT cameo_root, cameo_description FROM signals_event_type ORDER BY cameo_root")
    rows = dict(cur.fetchall())

    assert rows["14"] == "Protest"
    assert rows["18"] == "Assault"
    assert rows["19"] == "Fight"
    conn.close()
    print(f"  PASS — build_event_type() cameo_description populated: {rows}")


# ---------------------------------------------------------------------------
# Tests — build_actor_frequency
# ---------------------------------------------------------------------------

def test_actor_frequency_skips_nulls():
    conn = make_test_db()
    df = make_test_df()
    build_actor_frequency(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM signals_actor_frequency")
    count = cur.fetchone()[0]
    # Non-null actors: ActorA, ActorB, ActorC, ActorD
    assert count == 4, f"Expected 4 actors, got {count}"
    conn.close()
    print(f"  PASS — build_actor_frequency() skipped nulls, {count} actors inserted")


def test_actor_frequency_correct_counts():
    conn = make_test_db()
    df = make_test_df()
    build_actor_frequency(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT actor, event_count FROM signals_actor_frequency ORDER BY actor")
    rows = dict(cur.fetchall())

    assert rows["ActorA"] == 3
    assert rows["ActorB"] == 2
    assert rows["ActorC"] == 2
    assert rows["ActorD"] == 1
    conn.close()
    print(f"  PASS — build_actor_frequency() counts correct: {rows}")


def test_actor_frequency_actor2_only_actor_is_counted():
    conn = make_test_db()
    df = make_test_df()
    extra = pd.DataFrame({
        "event_date":      pd.to_datetime(["2026-04-03"]),
        "cameo_code":      ["140"],
        "actor1":          [None],
        "actor2":          ["ActorE"],
        "country":         ["SU"],
        "location":        ["Khartoum"],
        "goldstein_scale": [-5.0],
        "num_mentions":    [1],
        "source_url":      ["http://example.com/extra"],
    })
    build_actor_frequency(conn, pd.concat([df, extra], ignore_index=True), "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT actor, event_count FROM signals_actor_frequency WHERE actor='ActorE'")
    row = cur.fetchone()
    assert row is not None and row[1] == 1, f"Expected ActorE count 1, got {row}"
    conn.close()
    print("  PASS — build_actor_frequency() included actor2-only actors")


# ---------------------------------------------------------------------------
# Tests — build_location_frequency
# ---------------------------------------------------------------------------

def test_location_frequency_correct_counts():
    conn = make_test_db()
    df = make_test_df()
    build_location_frequency(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT location, event_count FROM signals_location_frequency ORDER BY location")
    rows = dict(cur.fetchall())

    # Khartoum×2, Omdurman×2, Darfur×1
    assert rows["Khartoum"] == 2
    assert rows["Omdurman"] == 2
    assert rows["Darfur"] == 1
    conn.close()
    print(f"  PASS — build_location_frequency() counts correct: {rows}")


# ---------------------------------------------------------------------------
# Tests — build_tone_over_time
# ---------------------------------------------------------------------------

def test_tone_over_time_avg_correct():
    conn = make_test_db()
    df = make_test_df()
    build_tone_over_time(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT period, avg_goldstein FROM signals_tone_over_time WHERE period_type='daily' ORDER BY period")
    rows = dict(cur.fetchall())

    # Apr 1: (-5 + -7) / 2 = -6.0
    # Apr 2: (-10 + -3 + -8) / 3 = -7.0
    assert abs(rows["2026-04-01"] - (-6.0)) < 0.001, f"Apr 1 avg wrong: {rows['2026-04-01']}"
    assert abs(rows["2026-04-02"] - (-7.0)) < 0.001, f"Apr 2 avg wrong: {rows['2026-04-02']}"
    conn.close()
    print(f"  PASS — build_tone_over_time() averages correct: {rows}")


def test_tone_over_time_skips_null_goldstein():
    conn = make_test_db()
    df = make_test_df().copy()
    df.loc[0, "goldstein_scale"] = np.nan  # null out Apr 1 row 0; only row 1 (-7.0) remains
    build_tone_over_time(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT avg_goldstein FROM signals_tone_over_time WHERE period='2026-04-01' AND period_type='daily'")
    result = cur.fetchone()
    assert result is not None
    assert abs(result[0] - (-7.0)) < 0.001
    conn.close()
    print(f"  PASS — build_tone_over_time() correctly skips null goldstein_scale")


# ---------------------------------------------------------------------------
# Tests — build_actor_location_graph
# ---------------------------------------------------------------------------

def test_actor_location_graph_skips_null_actor_or_location():
    conn = make_test_db()
    df = make_test_df()
    build_actor_location_graph(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM signals_actor_location_graph")
    count = cur.fetchone()[0]
    # Valid pairs include actor1 and actor2 contributions, skipping null actor or location.
    assert count == 6, f"Expected 6 edges, got {count}"
    conn.close()
    print(f"  PASS — build_actor_location_graph() skipped nulls, {count} edges inserted")


def test_actor_location_graph_edge_weights():
    conn = make_test_db()
    df = make_test_df()
    build_actor_location_graph(conn, df, "sudan_2023")

    cur = conn.cursor()
    cur.execute("SELECT actor, location, edge_weight FROM signals_actor_location_graph ORDER BY actor, location")
    rows = {(r[0], r[1]): r[2] for r in cur.fetchall()}

    assert rows[("ActorA", "Khartoum")] == 2
    assert rows[("ActorA", "Omdurman")] == 1
    assert rows[("ActorB", "Khartoum")] == 1
    assert rows[("ActorB", "Omdurman")] == 1
    assert rows[("ActorC", "Omdurman")] == 2
    assert rows[("ActorD", "Darfur")] == 1
    conn.close()
    print(f"  PASS — build_actor_location_graph() edge weights correct: {rows}")


# ---------------------------------------------------------------------------
# Integration test — reads anchor.db (requires fetcher to have run first)
# ---------------------------------------------------------------------------

def test_build_all_signals_returns_dict():
    """Integration test — reads from anchor.db. Requires fetcher to have run first."""
    results = build_all_signals("sudan_2023")
    assert isinstance(results, dict)
    expected_keys = {
        "event_volume", "event_type", "actor_frequency",
        "location_frequency", "tone_over_time", "actor_location_graph"
    }
    assert expected_keys == set(results.keys()), f"Missing keys: {expected_keys - set(results.keys())}"
    for key, val in results.items():
        assert isinstance(val, int) and val >= 0, f"{key} should be a non-negative int"
    print(f"  PASS — build_all_signals() returned valid dict: {results}")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\nRunning tests for signal_builder.py...\n")

    unit_tests = [
        test_week_label_format,
        test_load_events_returns_dataframe,
        test_event_volume_daily_and_weekly,
        test_event_volume_correct_counts,
        test_event_volume_upsert_updates_count,
        test_event_type_correct_roots,
        test_event_type_cameo_description_populated,
        test_actor_frequency_skips_nulls,
        test_actor_frequency_correct_counts,
        test_actor_frequency_actor2_only_actor_is_counted,
        test_location_frequency_correct_counts,
        test_tone_over_time_avg_correct,
        test_tone_over_time_skips_null_goldstein,
        test_actor_location_graph_skips_null_actor_or_location,
        test_actor_location_graph_edge_weights,
    ]

    integration_tests = [
        test_build_all_signals_returns_dict,
    ]

    passed = 0
    failed = 0

    print("--- Unit Tests ---")
    for t in unit_tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  FAIL — {t.__name__}: {e}")
            failed += 1

    print("\n--- Integration Tests (reads anchor.db) ---")
    for t in integration_tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  FAIL — {t.__name__}: {e}")
            failed += 1

    total = len(unit_tests) + len(integration_tests)
    print(f"\nResults: {passed} passed, {failed} failed out of {total} tests")