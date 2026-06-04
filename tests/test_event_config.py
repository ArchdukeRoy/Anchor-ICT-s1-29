# test_event_config.py
# Tests for backend/config/event_config.py
#
# These tests verify that the event configuration mapping in
# `backend.config.event_config` is syntactically and semantically valid.
# They check that the `DEFAULT_EVENT` key exists, that `get_event`
# returns the expected structure (labels, date ranges, CAMEO codes and
# countries), and that helper functions behave as expected for malformed
# inputs. This file is intentionally small; the assertions are designed
# to serve both as tests and as living documentation for how events are
# represented inside the project.

import sys
import os

# Resolve to the project root (one level above the tests/ directory)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.config.event_config import get_event, list_events, DEFAULT_EVENT, EVENTS


def test_list_events_returns_list():
    result = list_events()
    assert isinstance(result, list), "list_events() should return a list"
    assert len(result) > 0, "list_events() should not be empty"
    print(f"  PASS — list_events() returned: {result}")


def test_default_event_exists():
    assert DEFAULT_EVENT in EVENTS, f"DEFAULT_EVENT '{DEFAULT_EVENT}' not found in EVENTS"
    print(f"  PASS — DEFAULT_EVENT '{DEFAULT_EVENT}' exists in EVENTS")


def test_get_event_returns_correct_config():
    result = get_event("sudan_2023")
    assert result["label"] == "Sudanese Civil War"
    assert result["start_date"] == "2023-04-01"
    assert result["end_date"] is None
    assert isinstance(result["cameo_codes"], list)
    assert len(result["cameo_codes"]) > 0
    assert isinstance(result["countries"], list)
    print("  PASS — get_event('sudan_2023') returned valid config")


def test_get_event_raises_on_unknown():
    raised = False
    try:
        get_event("nonexistent_event")
    except KeyError:
        raised = True
    assert raised, "get_event() should raise KeyError for an unknown event name"
    print("  PASS — get_event() raises KeyError for unknown event")


def test_cameo_codes_are_strings():
    config = get_event("sudan_2023")
    for code in config["cameo_codes"]:
        assert isinstance(code, str), f"CAMEO code '{code}' should be a string"
    print(f"  PASS — all CAMEO codes are strings: {config['cameo_codes']}")


def test_countries_are_strings():
    config = get_event("sudan_2023")
    for country in config["countries"]:
        assert isinstance(country, str), f"Country code '{country}' should be a string"
    print(f"  PASS — all country codes are strings: {config['countries']}")


if __name__ == "__main__":
    print("\nRunning tests for event_config.py...\n")
    tests = [
        test_list_events_returns_list,
        test_default_event_exists,
        test_get_event_returns_correct_config,
        test_get_event_raises_on_unknown,
        test_cameo_codes_are_strings,
        test_countries_are_strings,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL — {t.__name__}: {e}")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed out of {len(tests)} tests")