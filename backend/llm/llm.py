# llm.py
# LLM integration layer for Project Anchor.
# Owns the Ollama call, prompt template, and JSON intent parsing.
# main.py imports call_llm() from here — no other files need to change.
# To be implemented by Tze Shen Ng.

import json
import logging
import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Ollama runs locally on the same device as the FastAPI app.
# Default port is 11434. Update if your Ollama instance uses a different port.
OLLAMA_BASE_URL = "http://localhost:11434"

# The model names as they appear in Ollama.
DEFAULT_OLLAMA_MODEL = "phi3:mini"
AVAILABLE_OLLAMA_MODELS = ("phi3:mini", "gemma3:4b")

# Timeout in seconds for the Ollama HTTP request.
# 20 seconds is the client success criterion from the scoping document.
OLLAMA_TIMEOUT = 30

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

# The system prompt instructs the LLM to return only a JSON intent object.
# It lists every valid signal name so the model knows exactly what it can ask for.
# Update VALID_SIGNALS if new signals are added to db.py and main.py.

VALID_SIGNALS = [
    "event_volume",         # event counts over time — params: period_type (daily/weekly)
    "event_type",           # event counts by CAMEO root code — no params
    "actor_frequency",      # most active actors — params: limit (default 10)
    "location_frequency",   # most active locations — params: limit (default 10)
    "tone_over_time",       # average Goldstein scale over time — params: period_type
    "media_attention",      # total media mentions over time — params: period_type
    "actor_location_graph", # actor-location network edges — params: min_edge_weight (default 1)
    "recent_events",        # raw recent events table — params: limit (default 20)
]

SYSTEM_PROMPT = f"""You are an assistant for a conflict data analytics dashboard.
Your only job is to interpret a plain-English question about conflict data and return a JSON object that describes what chart to show.

You must return a JSON object with exactly three fields:
- chart_type: one of "line", "bar", "scatter", "table", "dual_line"
- signal: one of {json.dumps(VALID_SIGNALS)}
- params: an object of optional parameters for the chosen signal (can be empty {{}})

Valid params per signal:
- event_volume: {{ "period_type": "daily" or "weekly" }}
- event_type: {{}}
- actor_frequency: {{ "limit": <integer> }}
- location_frequency: {{ "limit": <integer> }}
- tone_over_time: {{ "period_type": "daily" or "weekly" }}
- media_attention: {{ "period_type": "daily" or "weekly" }}
- actor_location_graph: {{ "min_edge_weight": <integer> }}
- recent_events: {{ "limit": <integer> }}

Rules:
- Return ONLY the JSON object. No explanation, no markdown, no code blocks.
- Do not include any text before or after the JSON.
- If you are unsure, default to signal "event_volume" with period_type "weekly".
- Use chart_type "dual_line" with signal "media_attention" only when the question explicitly compares media attention to event count (e.g. "compare", "vs", "versus", "both", "alongside").
- Use chart_type "line" with signal "media_attention" for all other media attention questions.

Example output:
{{"chart_type": "line", "signal": "event_volume", "params": {{"period_type": "weekly"}}}}"""


# ---------------------------------------------------------------------------
# Public entry point — called by main.py
# ---------------------------------------------------------------------------

def call_llm(query: str, model: str | None = None) -> dict:
    """
    Send a plain-English query to the local Ollama instance and return a
    parsed intent dict.

    Parameters
    ----------
    query : str
        The user's plain-English question from the dashboard.

    Returns
    -------
    dict with keys: chart_type, signal, params.
    Example: { "chart_type": "line", "signal": "event_volume", "params": { "period_type": "weekly" } }

    Raises
    ------
    ConnectionError if Ollama is unreachable.
    ValueError if the model returns invalid or unparseable JSON.
    """
    selected_model = model or DEFAULT_OLLAMA_MODEL
    _validate_model(selected_model)

    logger.info(f"[llm] Sending query to Ollama model {selected_model}: {query!r}")

    raw_response = _call_ollama(query, selected_model)
    logger.info(f"[llm] Raw response from Ollama: {raw_response!r}")

    intent = _parse_intent(raw_response)
    logger.info(f"[llm] Parsed intent: {intent}")

    _validate_intent(intent)
    return intent


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _call_ollama(query: str, model: str) -> str:
    """
    Send the query to the Ollama /api/chat endpoint and return the raw
    response text.

    Raises ConnectionError if the request fails or times out.
    """
    # TODO: Tze Shen — confirm the correct Ollama endpoint and payload structure
    # for your chosen model. The example below uses the /api/chat endpoint
    # which works for most Ollama models. Some models may require /api/generate.
    #
    # Ollama /api/chat reference:
    # https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion

    url = f"{OLLAMA_BASE_URL}/api/chat"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        "stream": False,
        "format": "json",   # Ollama structured output — forces JSON-only response
    }

    try:
        response = requests.post(url, json=payload, timeout=OLLAMA_TIMEOUT)
        response.raise_for_status()
    except requests.exceptions.ConnectionError as e:
        raise ConnectionError(
            f"Could not connect to Ollama at {OLLAMA_BASE_URL}. "
            f"Is Ollama running? Error: {e}"
        )
    except requests.exceptions.Timeout:
        raise ConnectionError(
            f"Ollama request timed out after {OLLAMA_TIMEOUT} seconds."
        )
    except requests.exceptions.HTTPError as e:
        raise ConnectionError(f"Ollama returned an error: {e}")

    # Extract the text content from the chat response
    # Ollama /api/chat returns: { "message": { "content": "<json string>" }, ... }
    try:
        return response.json()["message"]["content"]
    except (KeyError, ValueError) as e:
        raise ValueError(f"Unexpected Ollama response structure: {response.text!r}") from e


def _parse_intent(raw: str) -> dict:
    """
    Parse the raw string returned by Ollama into a dict.
    Strips markdown code fences if present.

    Raises ValueError if the string is not valid JSON.
    """
    # Strip markdown fences that some models include despite being asked not to
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(
            line for line in lines
            if not line.strip().startswith("```")
        ).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"LLM returned invalid JSON. Raw response: {raw!r}. Error: {e}"
        )


def _validate_intent(intent: dict) -> None:
    """
    Check the parsed intent has the required fields and valid values.

    Raises ValueError if the intent is malformed or contains an unknown signal.
    """
    required_keys = {"chart_type", "signal", "params"}
    missing = required_keys - set(intent.keys())
    if missing:
        raise ValueError(
            f"LLM intent missing required fields: {missing}. Got: {intent}"
        )

    if intent["signal"] not in VALID_SIGNALS:
        raise ValueError(
            f"LLM returned unknown signal: {intent['signal']!r}. "
            f"Valid signals: {VALID_SIGNALS}"
        )

    if not isinstance(intent["params"], dict):
        raise ValueError(
            f"LLM intent 'params' must be a dict, got: {type(intent['params'])}"
        )


def _validate_model(model: str) -> None:
    """Ensure only supported local Ollama models can be requested."""
    if model not in AVAILABLE_OLLAMA_MODELS:
        raise ValueError(
            f"Unsupported Ollama model: {model!r}. "
            f"Available models: {list(AVAILABLE_OLLAMA_MODELS)}"
        )
