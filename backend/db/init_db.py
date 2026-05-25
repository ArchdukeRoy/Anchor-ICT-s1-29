# init_db.py
# Creates the anchor.db SQLite database and all 10 required tables.
# Safe to re-run: all tables use CREATE TABLE IF NOT EXISTS.
# Created, reviewed, tested, and commented by Jesse Ly.

import logging
import os
import sqlite3

DB_PATH = "anchor.db"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_db(db_path: str = DB_PATH) -> None:
    """
    Initialise the SQLite database at db_path.
    Creates all tables if they do not already exist.
    Prints a summary of tables created on completion.
    """
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.executescript("""
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

        CREATE TABLE IF NOT EXISTS saved_graphs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_config TEXT NOT NULL,
            query_text   TEXT NOT NULL,
            intent_json  TEXT NOT NULL,
            label        TEXT,
            visible      INTEGER NOT NULL DEFAULT 1,
            created_at   TEXT DEFAULT (datetime('now')),
            updated_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS graph_ratings (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            saved_graph_id INTEGER NOT NULL REFERENCES saved_graphs(id),
            rating         INTEGER NOT NULL CHECK(rating IN (-1, 1)),
            rated_at       TEXT DEFAULT (datetime('now'))
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

        CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
        CREATE INDEX IF NOT EXISTS idx_events_cameo_code ON events(cameo_code);
        CREATE INDEX IF NOT EXISTS idx_events_actor1 ON events(actor1);
        CREATE INDEX IF NOT EXISTS idx_events_actor2 ON events(actor2);
        CREATE INDEX IF NOT EXISTS idx_events_location ON events(location);
        CREATE INDEX IF NOT EXISTS idx_signals_event_volume_config ON signals_event_volume(event_config);
        CREATE INDEX IF NOT EXISTS idx_signals_actor_frequency_config ON signals_actor_frequency(event_config);
        CREATE INDEX IF NOT EXISTS idx_signals_location_frequency_config ON signals_location_frequency(event_config);
        CREATE INDEX IF NOT EXISTS idx_signals_tone_over_time_config ON signals_tone_over_time(event_config);
        CREATE INDEX IF NOT EXISTS idx_signals_actor_location_graph_config ON signals_actor_location_graph(event_config);
    """)

    conn.commit()

    # Verify tables using the same connection — no need to reopen
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    tables = [row[0] for row in cur.fetchall()]
    conn.close()

    logger.info(f"Database initialised: {os.path.abspath(db_path)}")
    logger.info(f"Tables created ({len(tables)}):")
    for t in tables:
        logger.info(f"  - {t}")


if __name__ == "__main__":
    init_db()