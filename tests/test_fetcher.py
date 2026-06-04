# test_fetcher.py
# Tests for backend/ingestion/fetcher.py
#
# The fetcher module downloads GDELT export files, filters them and
# inserts rows into the `events` table. These tests are split into two
# groups:
#
# 1) Unit tests — run offline using synthetic DataFrames and an in-memory
#    SQLite database. They exercise helpers like `_safe`, `_parse_date`,
#    `_filter_events`, `_insert_events` and `_log_run` with deterministic
#    inputs so results are repeatable.
#
# 2) Integration tests — these contact GDELT's `lastupdate.txt` and the
#    ZIP exports. They are explicitly marked and require network access.
#    Keep them separate from CI unless you want external dependency
#    coverage.
#
 
import sqlite3
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ingestion.fetcher import (
    _get_export_url,
    _download_export,
    _filter_events,
    _insert_events,
    _log_run,
    _safe,
    _parse_date,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_test_db() -> sqlite3.Connection:
    """Create an in-memory SQLite DB with the required tables."""
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

        CREATE TABLE IF NOT EXISTS ingestion_log (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config     TEXT NOT NULL,
            run_at           TEXT DEFAULT (datetime('now')),
            records_fetched  INTEGER,
            records_inserted INTEGER,
            status           TEXT,
            notes            TEXT
        );
    """)
    return conn


def make_test_df(num_rows: int = 5):
    """
    Build a minimal DataFrame shaped like a GDELT export.
    61 columns, positional. Only fills the columns fetcher.py reads.
    """
    import pandas as pd
    import numpy as np

    df = pd.DataFrame(np.nan, index=range(num_rows), columns=range(61))

    # Col 0  — GLOBALEVENTID
    df[0] = [f"100000{i}" for i in range(num_rows)]
    # Col 1  — SQLDATE
    df[1] = [20260401] * num_rows
    # Col 6  — Actor1Name
    df[6] = ["ActorA"] * num_rows
    # Col 16 — Actor2Name
    df[16] = ["ActorB"] * num_rows
    # Col 27 — EventRootCode
    df[28] = [14, 18, 19, 20, 10]           # Col 28 — EventRootCode; first 4 match filter, last does not
    # Col 26 — EventCode (full)
    df[26] = [141, 181, 190, 200, 100]
    # Col 30 — GoldsteinScale
    df[30] = [-5.0, -7.0, -10.0, -10.0, 1.0]
    # Col 31 — NumMentions
    df[31] = [3, 5, 2, 8, 1]
    # Col 53 — ActionGeo_CountryCode
    df[53] = ["SU", "SU", "SU", "US", "US"]
    # Col 52 — ActionGeo_FullName
    df[52] = ["Khartoum", "Omdurman", "Darfur", "New York", "Washington"]
    # Col 56 — Lat
    df[56] = [15.5, 15.6, 13.5, 40.7, 38.9]
    # Col 57 — Long
    df[57] = [32.5, 32.4, 22.4, -74.0, -77.0]
    # Col 60 — SOURCEURL
    df[60] = [f"http://example.com/{i}" for i in range(num_rows)]

    return df


# ---------------------------------------------------------------------------
# Unit tests — _safe
# ---------------------------------------------------------------------------

def test_safe_returns_none_for_nan():
    import numpy as np
    assert _safe(float("nan")) is None
    assert _safe(np.nan) is None
    print("  PASS — _safe() returns None for NaN")


def test_safe_returns_value_for_non_nan():
    assert _safe("hello") == "hello"
    assert _safe(42) == 42
    assert _safe(0) == 0
    print("  PASS — _safe() returns value for non-NaN")


# ---------------------------------------------------------------------------
# Unit tests — _parse_date
# ---------------------------------------------------------------------------

def test_parse_date_valid():
    assert _parse_date(20260401) == "2026-04-01"
    assert _parse_date(20260401.0) == "2026-04-01"
    print("  PASS — _parse_date() parses valid YYYYMMDD int and float")


def test_parse_date_returns_none_for_nan():
    import numpy as np
    assert _parse_date(float("nan")) is None
    assert _parse_date(np.nan) is None
    print("  PASS — _parse_date() returns None for NaN")


def test_parse_date_returns_none_for_malformed():
    assert _parse_date("bad") is None
    assert _parse_date(999) is None   # too short
    print("  PASS — _parse_date() returns None for malformed input")


# ---------------------------------------------------------------------------
# Unit tests — _filter_events
# ---------------------------------------------------------------------------

def test_filter_by_cameo_code():
    df = make_test_df()
    # col 27: 14, 18, 19, 20 should match; 10 should not
    filtered = _filter_events(df, cameo_codes=["14", "18", "19", "20"], countries=[])
    assert len(filtered) == 4, f"Expected 4 rows, got {len(filtered)}"
    print(f"  PASS — _filter_events() by CAMEO code: {len(filtered)} rows matched")


def test_filter_by_country():
    df = make_test_df()
    # SU appears in rows 0-2
    filtered = _filter_events(df, cameo_codes=[], countries=["SU"])
    assert len(filtered) == 3, f"Expected 3 rows, got {len(filtered)}"
    print(f"  PASS — _filter_events() by country: {len(filtered)} rows matched")


def test_filter_by_cameo_and_country():
    df = make_test_df()
    # Codes 14, 18, 19 with country SU → rows 0, 1, 2
    # Row 3: code=20, country=US → fails country filter
    # Row 4: code=10, country=US → fails both
    filtered = _filter_events(df, cameo_codes=["14", "18", "19", "20"], countries=["SU"])
    assert len(filtered) == 3, f"Expected 3 rows, got {len(filtered)}"
    print(f"  PASS — _filter_events() by CAMEO + country: {len(filtered)} rows matched")


def test_filter_empty_filters_returns_all():
    df = make_test_df()
    filtered = _filter_events(df, cameo_codes=[], countries=[])
    assert len(filtered) == len(df), "Empty filters should return all rows"
    print(f"  PASS — _filter_events() with no filters returns all {len(filtered)} rows")


# ---------------------------------------------------------------------------
# Unit tests — _insert_events
# ---------------------------------------------------------------------------

def test_insert_events_inserts_rows():
    df = make_test_df()
    filtered = _filter_events(df, cameo_codes=["14", "18", "19", "20"], countries=["SU"])
    conn = make_test_db()
    inserted = _insert_events(conn, filtered)
    assert inserted == 3, f"Expected 3 inserted, got {inserted}"

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM events")
    count = cur.fetchone()[0]
    assert count == 3, f"Expected 3 rows in DB, got {count}"
    conn.close()
    print(f"  PASS — _insert_events() inserted {inserted} rows")


def test_insert_events_ignores_duplicates():
    df = make_test_df()
    filtered = _filter_events(df, cameo_codes=["14", "18", "19", "20"], countries=["SU"])
    conn = make_test_db()

    first = _insert_events(conn, filtered)
    second = _insert_events(conn, filtered)

    assert first == 3, f"First insert: expected 3, got {first}"
    assert second == 0, f"Second insert (duplicates): expected 0, got {second}"

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM events")
    count = cur.fetchone()[0]
    assert count == 3, f"Expected 3 total rows, got {count}"
    conn.close()
    print(f"  PASS — _insert_events() correctly ignores duplicates on re-run")


# ---------------------------------------------------------------------------
# Unit tests — _log_run
# ---------------------------------------------------------------------------

def test_log_run_writes_success():
    conn = make_test_db()
    _log_run(conn, "sudan_2023", 85, 85, "success")
    cur = conn.cursor()
    cur.execute("SELECT event_config, records_fetched, records_inserted, status FROM ingestion_log")
    row = cur.fetchone()
    assert row == ("sudan_2023", 85, 85, "success")
    conn.close()
    print("  PASS — _log_run() writes success row to ingestion_log")


def test_log_run_writes_error():
    conn = make_test_db()
    _log_run(conn, "sudan_2023", 0, 0, "error", "Connection timeout")
    cur = conn.cursor()
    cur.execute("SELECT status, notes FROM ingestion_log")
    row = cur.fetchone()
    assert row == ("error", "Connection timeout")
    conn.close()
    print("  PASS — _log_run() writes error row with notes to ingestion_log")


# ---------------------------------------------------------------------------
# Integration tests — network required
# ---------------------------------------------------------------------------

def test_get_export_url_returns_zip():
    """Integration test — requires network. Verifies lastupdate.txt returns a valid URL."""
    url = _get_export_url()
    assert url.startswith("http"), f"URL should start with http, got: {url}"
    assert url.endswith(".export.CSV.zip"), f"URL should end with .export.CSV.zip, got: {url}"
    print(f"  PASS — _get_export_url() returned valid URL: {url}")


def test_download_export_returns_dataframe():
    """Integration test — requires network. Verifies download returns a non-empty DataFrame."""
    import pandas as pd
    url = _get_export_url()
    df = _download_export(url)
    assert isinstance(df, pd.DataFrame), "Should return a DataFrame"
    assert len(df) > 0, "DataFrame should not be empty"
    assert len(df.columns) >= 57, f"Expected 57+ columns, got {len(df.columns)}"
    print(f"  PASS — _download_export() returned DataFrame with {len(df)} rows, {len(df.columns)} columns")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\nRunning tests for fetcher.py...\n")

    unit_tests = [
        test_safe_returns_none_for_nan,
        test_safe_returns_value_for_non_nan,
        test_parse_date_valid,
        test_parse_date_returns_none_for_nan,
        test_parse_date_returns_none_for_malformed,
        test_filter_by_cameo_code,
        test_filter_by_country,
        test_filter_by_cameo_and_country,
        test_filter_empty_filters_returns_all,
        test_insert_events_inserts_rows,
        test_insert_events_ignores_duplicates,
        test_log_run_writes_success,
        test_log_run_writes_error,
    ]

    integration_tests = [
        test_get_export_url_returns_zip,
        test_download_export_returns_dataframe,
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

    print("\n--- Integration Tests (network required) ---")
    for t in integration_tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  FAIL — {t.__name__}: {e}")
            failed += 1

    total = len(unit_tests) + len(integration_tests)
    print(f"\nResults: {passed} passed, {failed} failed out of {total} tests")