# signal_builder.py
# Read raw events and produce the six pre-computed signal tables used by the
# API and frontend. This module is invoked after each successful fetch and is
# safe to run repeatedly because each builder performs upserts (INSERT ... ON
# CONFLICT DO UPDATE). The API reads the signal tables rather than the raw
# events table for performance and to make frontend queries fast and simple.
#
# The six signals produced are:
#  - event_volume
#  - event_type
#  - actor_frequency
#  - location_frequency
#  - tone_over_time
#  - actor_location_graph

import logging
import sqlite3

import pandas as pd

DB_PATH = "anchor.db"

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_events(conn: sqlite3.Connection) -> pd.DataFrame:
    """
    Load every row from the `events` table and return a pandas DataFrame.

    We coerce `event_date` to pandas datetime here because GDELT stores dates
    as strings/integers and pandas needs a datetime dtype to use the
    `.dt` accessor (used later for grouping by date and ISO week).
    """
    df = pd.read_sql_query("SELECT * FROM events", conn)
    df["event_date"] = pd.to_datetime(df["event_date"], errors="coerce")
    return df


def _week_label(date: pd.Timestamp) -> str:
    """Return an ISO week label string such as '2023-W15'.

    The format is YEAR-W## where ## is the two-digit ISO week number. This
    representation is used to group weekly buckets consistently.
    """
    return f"{date.isocalendar().year}-W{date.isocalendar().week:02d}"


# ---------------------------------------------------------------------------
# Signal builders
# ---------------------------------------------------------------------------

def build_event_volume(conn: sqlite3.Connection, df: pd.DataFrame, event_config: str) -> int:
    """
    Compute daily and weekly counts and write them to
    `signals_event_volume`.

    We compute both daily and weekly buckets in the same function and then
    concatenate them before upserting. `period_type` marks whether a row is a
    'daily' or 'weekly' bucket and is used by the API and frontend to present
    the correct x-axis labels.
    """
    df_valid = df.dropna(subset=["event_date"])  # Only events with valid dates.

    # Daily counts aggregate by the calendar date.
    daily = df_valid.groupby(df_valid["event_date"].dt.date).size().reset_index()
    daily.columns = ["period", "event_count"]
    daily["period"] = daily["period"].astype(str)
    daily["period_type"] = "daily"

    # Weekly counts group by an ISO week label computed above.
    df_copy = df_valid.copy()
    df_copy["week"] = df_copy["event_date"].apply(_week_label)
    weekly = df_copy.groupby("week").size().reset_index()
    weekly.columns = ["period", "event_count"]
    weekly["period_type"] = "weekly"

    upserted = 0
    for _, row in pd.concat([daily, weekly], ignore_index=True).iterrows():
        conn.execute(
            """
            INSERT INTO signals_event_volume (event_config, period, period_type, event_count, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(event_config, period, period_type)
            DO UPDATE SET event_count = excluded.event_count, updated_at = excluded.updated_at
            """,
            (event_config, row["period"], row["period_type"], int(row["event_count"])),
        )
        upserted += 1

    conn.commit()
    logger.info(f"[signal_builder] event_volume: {upserted} rows upserted")
    return upserted


def build_event_type(conn: sqlite3.Connection, df: pd.DataFrame, event_config: str) -> int:
    """
    Count events grouped by the CAMEO root code.

    The root is the first two characters of `cameo_code`. `CAMEO_LABELS` is an
    inline dictionary mapping roots to human readable descriptions. All 20
    root codes are included so the system can report the full behavioural
    profile rather than only a subset labelled 'conflict'.
    """
    df_valid = df.dropna(subset=["cameo_code"]).copy()  # Skip rows without cameo_code.
    df_valid["cameo_root"] = df_valid["cameo_code"].astype(str).str[:2]

    grouped = df_valid.groupby("cameo_root").size().reset_index()
    grouped.columns = ["cameo_root", "event_count"]

    CAMEO_LABELS = {
        "01": "Make Public Statement",
        "02": "Appeal",
        "03": "Express Intent to Cooperate",
        "04": "Consult",
        "05": "Engage in Diplomatic Cooperation",
        "06": "Engage in Material Cooperation",
        "07": "Provide Aid",
        "08": "Yield",
        "09": "Investigate",
        "10": "Demand",
        "11": "Disapprove",
        "12": "Reject",
        "13": "Threaten",
        "14": "Protest",
        "15": "Exhibit Force Posture",
        "16": "Reduce Relations",
        "17": "Coerce",
        "18": "Assault",
        "19": "Fight",
        "20": "Use Unconventional Mass Violence",
    }

    upserted = 0
    for _, row in grouped.iterrows():
        conn.execute(
            """
            INSERT INTO signals_event_type (event_config, cameo_root, cameo_description, event_count, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(event_config, cameo_root)
            DO UPDATE SET
                cameo_description = excluded.cameo_description,
                event_count = excluded.event_count,
                updated_at = excluded.updated_at
            """,
            (
                event_config,
                row["cameo_root"],
                CAMEO_LABELS.get(row["cameo_root"], ""),
                int(row["event_count"]),
            ),
        )
        upserted += 1

    conn.commit()
    logger.info(f"[signal_builder] event_type: {upserted} rows upserted")
    return upserted


def build_actor_frequency(conn: sqlite3.Connection, df: pd.DataFrame, event_config: str) -> int:
    """
    Count how often each actor appears across all events.

    We use a concat pattern to include appearances in both `actor1` and
    `actor2` columns. If we counted only `actor1` we would miss actors that
    appear solely in `actor2`.
    """
    actors1 = df.dropna(subset=["actor1"])[["actor1"]].rename(columns={"actor1": "actor"})
    actors2 = df.dropna(subset=["actor2"])[["actor2"]].rename(columns={"actor2": "actor"})
    combined = pd.concat([actors1, actors2], ignore_index=True)

    grouped = combined.groupby("actor").size().reset_index()
    grouped.columns = ["actor", "event_count"]

    upserted = 0
    for _, row in grouped.iterrows():
        conn.execute(
            """
            INSERT INTO signals_actor_frequency (event_config, actor, event_count, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(event_config, actor)
            DO UPDATE SET event_count = excluded.event_count, updated_at = excluded.updated_at
            """,
            (event_config, row["actor"], int(row["event_count"])),
        )
        upserted += 1

    conn.commit()
    logger.info(f"[signal_builder] actor_frequency: {upserted} rows upserted")
    return upserted


def build_location_frequency(conn: sqlite3.Connection, df: pd.DataFrame, event_config: str) -> int:
    """
    Count how often events occur at each location and record the most
    common country seen for that location.

    We use `.mode()[0]` to pick the most common country value because the
    same geographic name can occasionally be recorded with varying country
    codes; the mode picks the majority value.
    """
    df_valid = df.dropna(subset=["location"])  # Ignore rows with no location.

    grouped = df_valid.groupby("location").agg(
        event_count=("location", "size"),
        country=("country", lambda x: x.mode()[0] if not x.mode().empty else None)
    ).reset_index()

    upserted = 0
    for _, row in grouped.iterrows():
        conn.execute(
            """
            INSERT INTO signals_location_frequency (event_config, location, country, event_count, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(event_config, location)
            DO UPDATE SET event_count = excluded.event_count,
                          country = excluded.country,
                          updated_at = excluded.updated_at
            """,
            (event_config, row["location"], row["country"], int(row["event_count"])),
        )
        upserted += 1

    conn.commit()
    logger.info(f"[signal_builder] location_frequency: {upserted} rows upserted")
    return upserted


def build_tone_over_time(conn: sqlite3.Connection, df: pd.DataFrame, event_config: str) -> int:
    """
    Calculate the average Goldstein score by day and by week.

    The Goldstein scale is a numerical proxy (typically between -10 and +10)
    where negative values indicate destabilising/hostile events and positive
    values indicate cooperative/stabilising events. We compute averages for
    daily and weekly buckets to support different chart resolutions in the UI.
    """
    df_valid = df.dropna(subset=["event_date", "goldstein_scale"])

    # Daily averages grouped by actual date.
    daily = (
        df_valid.groupby(df_valid["event_date"].dt.date)["goldstein_scale"]
        .mean()
        .reset_index()
    )
    daily.columns = ["period", "avg_goldstein"]
    daily["period"] = daily["period"].astype(str)
    daily["period_type"] = "daily"

    # Weekly averages grouped by ISO week label.
    df_copy = df_valid.copy()
    df_copy["week"] = df_copy["event_date"].apply(_week_label)
    weekly = df_copy.groupby("week")["goldstein_scale"].mean().reset_index()
    weekly.columns = ["period", "avg_goldstein"]
    weekly["period_type"] = "weekly"

    upserted = 0
    for _, row in pd.concat([daily, weekly], ignore_index=True).iterrows():
        conn.execute(
            """
            INSERT INTO signals_tone_over_time (event_config, period, period_type, avg_goldstein, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(event_config, period, period_type)
            DO UPDATE SET avg_goldstein = excluded.avg_goldstein, updated_at = excluded.updated_at
            """,
            (event_config, row["period"], row["period_type"], float(row["avg_goldstein"])),
        )
        upserted += 1

    conn.commit()
    logger.info(f"[signal_builder] tone_over_time: {upserted} rows upserted")
    return upserted


def build_actor_location_graph(conn: sqlite3.Connection, df: pd.DataFrame, event_config: str) -> int:
    """
    Build edge weights between actors and locations for the network graph.

    An edge weight counts how many times an actor co-appeared with a
    particular location across events. Both `actor1` and `actor2` are included
    via concatenation so that all actor appearances are counted.
    """
    actor_location_pairs = pd.concat([
        df[["actor1", "location"]].rename(columns={"actor1": "actor"}),
        df[["actor2", "location"]].rename(columns={"actor2": "actor"}),
    ], ignore_index=True)

    df_valid = actor_location_pairs.dropna(subset=["actor", "location"])
    grouped = df_valid.groupby(["actor", "location"]).size().reset_index(name="edge_weight")

    upserted = 0
    for _, row in grouped.iterrows():
        conn.execute(
            """
            INSERT INTO signals_actor_location_graph (event_config, actor, location, edge_weight, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(event_config, actor, location)
            DO UPDATE SET edge_weight = excluded.edge_weight, updated_at = excluded.updated_at
            """,
            (event_config, row["actor"], row["location"], int(row["edge_weight"])),
        )
        upserted += 1

    conn.commit()
    logger.info(f"[signal_builder] actor_location_graph: {upserted} rows upserted")
    return upserted


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def build_all_signals(event_name: str, db_path: str = DB_PATH) -> dict:
    """
    Public function to rebuild all six signal tables for the given event.

    This is the only function that external code needs to call. It loads the
    full events DataFrame once and then runs each builder in sequence against
    that DataFrame. Each builder performs an upsert so rerunning this whole
    pipeline is idempotent.
    """
    conn = sqlite3.connect(db_path)

    try:
        df = _load_events(conn)
        logger.info(f"[signal_builder] Loaded {len(df)} events for '{event_name}'")

        results = {
            "event_volume":         build_event_volume(conn, df, event_name),
            "event_type":           build_event_type(conn, df, event_name),
            "actor_frequency":      build_actor_frequency(conn, df, event_name),
            "location_frequency":   build_location_frequency(conn, df, event_name),
            "tone_over_time":       build_tone_over_time(conn, df, event_name),
            "actor_location_graph": build_actor_location_graph(conn, df, event_name),
        }

        logger.info(f"[signal_builder] All signals built: {results}")
        return results

    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Run directly for manual testing
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    results = build_all_signals("sudan_2023")
    print(results)