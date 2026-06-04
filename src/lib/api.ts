// Base URL for the backend API. During development Vite's dev server can
// proxy API requests to this address (see `vite.config.ts`). This allows the
// frontend to run on a different port to the FastAPI backend while keeping
// same-origin semantics in the browser during development.
const BASE_URL = 'http://localhost:8000';

/**
 * Generic GET helper used by all exported endpoint functions.
 *
 * Pattern rationale:
 * - A single internal `get<T>()` implements the fetch + error handling logic
 *   while exported helpers are thin wrappers that supply typed endpoints.
 * - The generic `<T>` is a TypeScript type parameter. It is erased at
 *   runtime but provides compile-time type checking and inference so callers
 *   receive properly typed results from the API without manual casting.
 *
 * Behavioural notes:
 * - `fetch()` only rejects on network failure. HTTP 4xx/5xx responses are
 *   still fulfilled promises, so we check `response.ok` and throw a helpful
 *   error when the server returns a non-ok status.
 * - We attempt to read `response.text()` for error details and fall back to
 *   `response.statusText` when the body is empty.
 */
async function get<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API Error ${response.status}: ${errorText || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Health check endpoint
 */
export async function getHealth(): Promise<{ status: string }> {
  // Used by the frontend to show a quick backend health indicator and for
  // monitoring endpoints used by loaders and CI checks.
  return get('/health');
}

/**
 * Get available events and default event
 */
export async function getEvents(): Promise<{ events: string[]; default: string }> {
  // Returns available event configuration keys and the default selection.
  // The frontend uses this to populate event selectors and to discover the
  // `DEFAULT_EVENT` configured on the backend.
  return get('/events');
}

/**
 * Get event volume data grouped by period
 */
export async function getEventVolume(
  event: string,
  periodType: 'daily' | 'weekly' = 'daily'
): Promise<{ period: string; period_type: string; event_count: number }[]> {
  const params = new URLSearchParams({ period_type: periodType });
  // `periodType` controls the aggregation granularity. Daily rows have
  // `period` values like "2026-01-01"; weekly rows use ISO labels like
  // "2026-W01". The API returns `period_type` alongside the data to make
  // client-side rendering simpler.
  return get(`/signals/${event}/event-volume?${params.toString()}`);
}

/**
 * Get event type breakdown (CAMEO codes)
 */
export async function getEventType(
  event: string
): Promise<{ cameo_root: string; cameo_description: string; event_count: number }[]> {
  // Returns counts grouped by CAMEO root code (first two digits). Each row
  // includes `cameo_root` (code) and `cameo_description` (human label).
  return get(`/signals/${event}/event-type`);
}

/**
 * Get actor frequency for an event
 */
export async function getActorFrequency(
  event: string,
  limit: number = 10
): Promise<{ actor: string; event_count: number }[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  // Note: the backend combines `actor1` and `actor2` appearances before
  // returning results so the frontend receives a single ranked list.
  return get(`/signals/${event}/actor-frequency?${params.toString()}`);
}

/**
 * Get location frequency for an event
 */
export async function getLocationFrequency(
  event: string,
  limit: number = 10
): Promise<{ location: string; country: string; event_count: number }[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  // `location` is a human readable place name and `country` is the most
  // common country code observed for that location (picked by mode).
  return get(`/signals/${event}/location-frequency?${params.toString()}`);
}

/**
 * Get tone over time for an event
 */
export async function getToneOverTime(
  event: string,
  periodType: 'daily' | 'weekly' = 'daily'
): Promise<{ period: string; avg_tone: number }[]> {
  const params = new URLSearchParams({ period_type: periodType });
  // `avg_tone` is the average Goldstein score for the period. Negative
  // values indicate more hostile or destabilising events; positive values
  // indicate cooperative or stabilising activity.
  return get(`/signals/${event}/tone-over-time?${params.toString()}`);
}

/**
 * Get media attention (mentions) over time for an event
 */
export async function getMediaAttention(
  event: string,
  periodType: 'daily' | 'weekly' = 'daily'
): Promise<{ period: string; total_mentions: number }[]> {
  const params = new URLSearchParams({ period_type: periodType });
  // `total_mentions` sums GDELT's `NumMentions` across events in the period
  // which approximates how much media attention an event or period received.
  return get(`/signals/${event}/media-attention?${params.toString()}`);
}

/**
 * Get actor-location network graph data
 */
export async function getActorLocationGraph(
  event: string,
  minEdgeWeight: number = 1
): Promise<{ nodes: object[]; edges: object[] }> {
  const params = new URLSearchParams({
    min_edge_weight: minEdgeWeight.toString(),
  });
  // Returns graph data with `nodes` and `edges`. Edges are filtered by
  // `minEdgeWeight` so the client can avoid rendering very weak edges.
  return get(`/signals/${event}/actor-location-graph?${params.toString()}`);
}

/**
 * Get dashboard summary for an event
 */
export async function getDashboardSummary(
  event: string
): Promise<Record<string, unknown>> {
  // Returns a flexible summary object used by the dashboard overview. The
  // loose return type reflects that different builds may include different
  // summary fields (counts, top actors, quick stats, etc.).
  return get(`/dashboard/${event}/summary`);
}

/**
 * Get recent events
 */
export async function getRecentEvents(
  event: string,
  limit: number = 10
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  // Reads from the recent-events endpoint which sources rows from the raw
  // `events` table filtered for the requested event.
  return get(`/dashboard/${event}/recent-events?${params.toString()}`);
}

/**
 * Get saved graphs
 */
export async function getSavedGraphs(
  event: string
): Promise<Record<string, unknown>[]> {
  // Returns pinned/LLM-generated graphs stored in `saved_graphs`.
  return get(`/graphs/${event}`);
}

/**
 * Delete a saved graph
 */
export async function deleteGraph(id: number): Promise<void> {
  const response = await fetch(`${BASE_URL}/graphs/${id}`, {
    method: 'DELETE',
  });
  // DELETE does not use the generic `get<T>()` helper because it is not a
  // GET request and returns no typed JSON body. We perform the same
  // response.ok check and throw a helpful error on failure.
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API Error ${response.status}: ${errorText || response.statusText}`
    );
  }
}

/**
 * Update graph visibility
 */
export async function updateGraphVisibility(
  id: number,
  visible: boolean
): Promise<void> {
  const response = await fetch(`${BASE_URL}/graphs/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ visible }),
  });
  // We use PATCH here because we are partially updating the resource (the
  // `visible` flag). The explicit Content-Type header signals JSON body and
  // allows the backend to parse the payload correctly.
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API Error ${response.status}: ${errorText || response.statusText}`
    );
  }
}
