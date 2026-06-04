# test_llm.py
# Tests for backend/llm/llm.py
#
# These tests validate the LLM-related helper functions without needing
# an actual Ollama server. They mock `requests.post` responses to return
# deterministic payloads and verify that the parsing and validation
# functions behave as expected. The tests include checks for:
# - JSON parsing and removal of Markdown fences
# - Intent schema validation and supported signal names
# - Error handling for network problems and malformed LLM output
#
# Mock helper functions (e.g., `mock_ollama_response`) are provided to
# make expectations explicit and readable.

import json
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.llm.llm import call_llm, _parse_intent, _validate_intent, VALID_SIGNALS


# ---------------------------------------------------------------------------
# Helper — build a mock Ollama response
# ---------------------------------------------------------------------------

def mock_ollama_response(content: str) -> MagicMock:
    """Return a mock requests.Response that mimics an Ollama /api/chat reply."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "message": {"content": content}
    }
    return mock_resp


# ---------------------------------------------------------------------------
# Tests — _parse_intent
# ---------------------------------------------------------------------------

def test_parse_intent_valid_json():
    raw = '{"chart_type": "line", "signal": "event_volume", "params": {"period_type": "weekly"}}'
    result = _parse_intent(raw)
    assert result["chart_type"] == "line"
    assert result["signal"] == "event_volume"
    assert result["params"] == {"period_type": "weekly"}
    print("  PASS — _parse_intent() parses valid JSON correctly")


def test_parse_intent_strips_markdown_fences():
    raw = '```json\n{"chart_type": "bar", "signal": "actor_frequency", "params": {}}\n```'
    result = _parse_intent(raw)
    assert result["signal"] == "actor_frequency"
    print("  PASS — _parse_intent() strips markdown fences")


def test_parse_intent_invalid_json_raises_value_error():
    raised = False
    try:
        _parse_intent("this is not json")
    except ValueError:
        raised = True
    assert raised, "Should raise ValueError for invalid JSON"
    print("  PASS — _parse_intent() raises ValueError for invalid JSON")


def test_parse_intent_empty_string_raises_value_error():
    raised = False
    try:
        _parse_intent("")
    except ValueError:
        raised = True
    assert raised, "Should raise ValueError for empty string"
    print("  PASS — _parse_intent() raises ValueError for empty string")


# ---------------------------------------------------------------------------
# Tests — _validate_intent
# ---------------------------------------------------------------------------

def test_validate_intent_valid():
    intent = {"chart_type": "bar", "signal": "actor_frequency", "params": {"limit": 5}}
    _validate_intent(intent)  # should not raise
    print("  PASS — _validate_intent() accepts valid intent")


def test_validate_intent_missing_field_raises():
    intent = {"chart_type": "bar", "signal": "actor_frequency"}  # missing params
    raised = False
    try:
        _validate_intent(intent)
    except ValueError:
        raised = True
    assert raised, "Should raise ValueError for missing params field"
    print("  PASS — _validate_intent() raises ValueError for missing field")


def test_validate_intent_unknown_signal_raises():
    intent = {"chart_type": "line", "signal": "unknown_signal", "params": {}}
    raised = False
    try:
        _validate_intent(intent)
    except ValueError:
        raised = True
    assert raised, "Should raise ValueError for unknown signal"
    print("  PASS — _validate_intent() raises ValueError for unknown signal")


def test_validate_intent_all_valid_signals():
    for signal in VALID_SIGNALS:
        intent = {"chart_type": "line", "signal": signal, "params": {}}
        _validate_intent(intent)  # should not raise
    print(f"  PASS — _validate_intent() accepts all {len(VALID_SIGNALS)} valid signals")


# ---------------------------------------------------------------------------
# Tests — call_llm (mocked Ollama)
# ---------------------------------------------------------------------------

def test_call_llm_returns_parsed_intent():
    content = '{"chart_type": "line", "signal": "event_volume", "params": {"period_type": "weekly"}}'
    with patch("backend.llm.llm.requests.post", return_value=mock_ollama_response(content)):
        result = call_llm("How has the number of events changed week by week?")
    assert result["signal"] == "event_volume"
    assert result["params"]["period_type"] == "weekly"
    print(f"  PASS — call_llm() returns parsed intent: {result}")


def test_call_llm_strips_markdown_and_returns_intent():
    content = '```json\n{"chart_type": "bar", "signal": "actor_frequency", "params": {"limit": 10}}\n```'
    with patch("backend.llm.llm.requests.post", return_value=mock_ollama_response(content)):
        result = call_llm("Which actors have been most active?")
    assert result["signal"] == "actor_frequency"
    print(f"  PASS — call_llm() handles markdown-wrapped response: {result}")


def test_call_llm_uses_selected_model():
    content = '{"chart_type": "line", "signal": "event_volume", "params": {"period_type": "weekly"}}'
    with patch("backend.llm.llm.requests.post", return_value=mock_ollama_response(content)) as mock_post:
        result = call_llm("Show event volume", model="gemma3:4b")
    assert result["signal"] == "event_volume"
    assert mock_post.call_args.kwargs["json"]["model"] == "gemma3:4b"
    print("  PASS - call_llm() sends the selected Ollama model")


def test_call_llm_unknown_model_raises_value_error():
    raised = False
    try:
        call_llm("Show event volume", model="unknown:model")
    except ValueError:
        raised = True
    assert raised, "Should raise ValueError for unsupported model"
    print("  PASS - call_llm() rejects unsupported Ollama models")


def test_call_llm_connection_error_raises():
    import requests as req
    with patch("backend.llm.llm.requests.post", side_effect=req.exceptions.ConnectionError("refused")):
        raised = False
        try:
            call_llm("Show event volume")
        except ConnectionError:
            raised = True
    assert raised, "Should raise ConnectionError when Ollama is unreachable"
    print("  PASS — call_llm() raises ConnectionError when Ollama is unreachable")


def test_call_llm_timeout_raises():
    import requests as req
    with patch("backend.llm.llm.requests.post", side_effect=req.exceptions.Timeout()):
        raised = False
        try:
            call_llm("Show event volume")
        except ConnectionError:
            raised = True
    assert raised, "Should raise ConnectionError on timeout"
    print("  PASS — call_llm() raises ConnectionError on timeout")


def test_call_llm_invalid_json_raises_value_error():
    with patch("backend.llm.llm.requests.post", return_value=mock_ollama_response("not json at all")):
        raised = False
        try:
            call_llm("Show event volume")
        except ValueError:
            raised = True
    assert raised, "Should raise ValueError for unparseable response"
    print("  PASS — call_llm() raises ValueError for unparseable Ollama response")


def test_call_llm_unknown_signal_raises_value_error():
    content = '{"chart_type": "line", "signal": "made_up_signal", "params": {}}'
    with patch("backend.llm.llm.requests.post", return_value=mock_ollama_response(content)):
        raised = False
        try:
            call_llm("Show something")
        except ValueError:
            raised = True
    assert raised, "Should raise ValueError for unknown signal in response"
    print("  PASS — call_llm() raises ValueError for unknown signal in LLM response")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\nRunning tests for llm.py...\n")

    tests = [
        test_parse_intent_valid_json,
        test_parse_intent_strips_markdown_fences,
        test_parse_intent_invalid_json_raises_value_error,
        test_parse_intent_empty_string_raises_value_error,
        test_validate_intent_valid,
        test_validate_intent_missing_field_raises,
        test_validate_intent_unknown_signal_raises,
        test_validate_intent_all_valid_signals,
        test_call_llm_returns_parsed_intent,
        test_call_llm_strips_markdown_and_returns_intent,
        test_call_llm_uses_selected_model,
        test_call_llm_unknown_model_raises_value_error,
        test_call_llm_connection_error_raises,
        test_call_llm_timeout_raises,
        test_call_llm_invalid_json_raises_value_error,
        test_call_llm_unknown_signal_raises_value_error,
    ]

    passed = 0
    failed = 0

    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  FAIL — {t.__name__}: {e}")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed out of {len(tests)} tests")
