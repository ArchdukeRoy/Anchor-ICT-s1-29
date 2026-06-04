# event_config.py
# Central configuration for all event scenarios.
#
# This module declares every conflict scenario the system can track. The design
# is intentionally event-agnostic: to add a new conflict you only need to add a
# new entry to the `EVENTS` dictionary and nothing else in the codebase needs
# to change. The rest of the pipeline (fetcher, signal builder, API routes)
# treat the value you pass in as an opaque `event_config` label and use it to
# tag derived signal rows.
#
# Each entry in `EVENTS` describes the filters and metadata required to fetch
# and aggregate GDELT rows for that particular scenario.

EVENTS = {
    "sudan_2023": {
        "label": "Sudanese Civil War",
        "start_date": "2023-04-01",
        "end_date": None,  # None = ongoing, fetcher uses today's date
        # `cameo_codes` lists the CAMEO root codes to filter on.
        # Each entry is a two-character string matching the EventRootCode
        # in GDELT exports. The structure below follows:
        #   - label: human readable name for the event
        #   - start_date / end_date: ISO date strings bounding the scenario
        #   - cameo_codes: list of CAMEO root codes (strings)
        #   - countries: list of GDELT country codes (strings)
        #
        # CAMEO codes 01–20 cover the full range from cooperative actions to
        # violent actions. We include all 20 here rather than only 'conflict'
        # codes so the system can report both cooperative and hostile
        # behaviour tracked by GDELT. Downstream aggregation and UI can choose
        # which codes to surface as 'conflict' metrics.
        "cameo_codes": [
            "01",   # Make public statement
            "02",   # Appeal
            "03",   # Express intent to cooperate
            "04",   # Consult
            "05",   # Engage in diplomatic cooperation
            "06",   # Engage in material cooperation
            "07",   # Provide aid
            "08",   # Yield
            "09",   # Investigate
            "10",   # Demand
            "11",   # Disapprove
            "12",   # Reject
            "13",   # Threaten
            "14",   # Protest or hunger strike
            "15",   # Demonstrate or rally
            "16",   # Reduce relations
            "17",   # Coerce
            "18",   # Assault
            "19",   # Use of force, attack
            "20",   # Use unconventional mass violence
        ],
        # `countries` filters by the GDELT ActionGeo_CountryCode. "SU" is the
        # GDELT country code for Sudan. An empty list here would mean "no
        # country filter" and the fetcher would capture global events.
        "countries": ["SU"],  # GDELT country code for Sudan
    },
}

# The active event the dashboard loads by default in the UI and scheduler.
# Changing this value only affects which event is used when the frontend or
# background tasks ask for the "default" scenario. It does not remove other
# configured events.
DEFAULT_EVENT = "sudan_2023"


def get_event(name: str) -> dict:
    """
    Return the configuration dict for `name`.

    A KeyError is raised when the name is not present. Raising an exception
    here is deliberate: callers (for example the fetcher and API routes)
    should fail fast if they are asked to operate on an unknown event name
    rather than silently continuing with a default or `None` value.
    """
    if name not in EVENTS:
        raise KeyError(f"Event '{name}' not found in config. Available: {list(EVENTS.keys())}")
    return EVENTS[name]


def list_events() -> list:
    """Return a list of all configured event names for UI selection."""
    return list(EVENTS.keys())