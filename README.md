# Anchor — ICT Capstone 2026
**Project Number:** 2026-S1-29  
**Client:** Department of Foreign Affairs and Trade (DFAT)  
**Team:** Roy Vallecera, Jesse Ly, Kunpeng Xu, Von Solano, Tze Shen Ng

---

## Overview

Project Anchor is a locally deployed web application that ingests GDELT news event data, builds analytical signals about evolving international situations, and lets analysts query the data in plain English via a local LLM to generate dynamic charts.

---

## Project Structure

```
Anchor-ICT-s1-29/
├── backend/                         Python backend services
│   ├── api/
│   │   └── main.py                   FastAPI app, API routes, scheduler wiring
│   ├── config/
│   │   └── event_config.py           Event configuration and CAMEO code mappings
│   ├── db/
│   │   ├── init_db.py                SQLite schema creation
│   │   └── db.py                     Database query and persistence helpers
│   ├── ingestion/
│   │   ├── fetcher.py                GDELT ingestion and backfill pipeline
│   │   └── signal_builder.py         Signal aggregation and derived metrics
│   └── llm/
│       └── llm.py                    Ollama integration and query intent parsing
├── src/                              React + TypeScript frontend
│   ├── components/
│   │   ├── charts/                   Dashboard and LLM chart components
│   │   │   ├── EventTypeChart.tsx
│   │   │   ├── EventVolumeChart.tsx
│   │   │   └── QueryResultChart.tsx
│   │   ├── layout/                   Shared dashboard layout components
│   │   │   ├── DashboardLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Topbar.tsx
│   │   └── ui/
│   │       └── StatCard.tsx          Reusable stat card component
│   ├── hooks/
│   │   ├── useLocalStorage.js        Local storage helper hook
│   │   └── useSignal.ts              Signal data fetching hook
│   ├── lib/
│   │   ├── api.ts                    Frontend API client helpers
│   │   ├── llmModels.ts              Available LLM model options
│   │   ├── types.ts                  Shared frontend TypeScript types
│   │   └── utils.js                  Shared frontend utilities
│   ├── pages/
│   │   ├── dashboard/
│   │   │   ├── BackendTestPage.tsx    Backend connectivity test page
│   │   │   ├── DashboardPage.tsx      Main dashboard view
│   │   │   ├── InsightsPage.tsx       LLM query and insight generation view
│   │   │   ├── ReportsPage.tsx        Reports view
│   │   │   └── SettingsPage.tsx       Settings view
│   │   └── NotFoundPage.tsx          404 page
│   ├── router/
│   │   └── index.tsx                 React Router configuration
│   ├── App.tsx                       Root app component
│   ├── index.css                     Global styles
│   └── main.tsx                      Frontend entry point
├── tests/                            Backend unit and API tests
│   ├── test_api.py                   22/22 passing
│   ├── test_db.py                    24/24 passing
│   ├── test_event_config.py          6/6 passing
│   ├── test_fetcher.py               15/15 passing
│   ├── test_llm.py                   8/8 passing
│   └── test_signal_builder.py        14/14 passing
├── docs/
│   ├── README.md                     Backend documentation index
│   └── backend.md                    Backend module and API reference
├── index.html                        Vite HTML entry point
├── package.json                      Frontend dependencies and npm scripts
├── package-lock.json                 Locked frontend dependency versions
├── requirements.txt                  Python backend dependencies
├── tailwind.config.js                Tailwind CSS configuration
├── postcss.config.js                 PostCSS configuration
├── tsconfig*.json                    TypeScript configuration
└── vite.config.ts                    Vite build configuration
```

---

## Frontend Setup

### Requirements
Node.js LTS — download from https://nodejs.org

### Steps

```bash
npm install
npm run dev
```

Once running, open your browser at the URL shown in the terminal (typically http://localhost:5173).

---

## Backend Setup

### Requirements
Python 3.11 — download from https://www.python.org or install via Homebrew on Mac.

### 1. Create and activate a virtual environment

```bash
python3 -m venv venv

# Mac/Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

> Note: the raw `events` table stores ingested GDELT rows without an `event_config` label.
> Signal tables such as `signals_event_volume` and `signals_actor_frequency` are event-specific.

### 3. Initialise the database

```bash
python backend/db/init_db.py
```

This creates anchor.db with all 10 required tables.

### 4. Run the historical data backfill

Pulls GDELT data from the start of the Sudan conflict. Takes around 15 minutes.

```bash
python3 - << 'EOF'
from backend.ingestion.fetcher import run_backfill
run_backfill("sudan_2023", start_date="2023-04-01")
EOF

# Windows
python -c "from backend.ingestion.fetcher import run_backfill; run_backfill('sudan_2023', start_date='2023-04-01')"
```

### 5. Build the signals

```bash
python3 - << 'EOF'
from backend.ingestion.signal_builder import build_all_signals
build_all_signals("sudan_2023")
EOF

# Windows
python -c "from backend.ingestion.signal_builder import build_all_signals; build_all_signals('sudan_2023')"

```

### 6. Start the API

```bash
python backend/api/main.py
```

The API will be available at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Liveness check |
| GET | /events | Available event configs |
| GET | /signals/{event}/event-volume | Event counts over time |
| GET | /signals/{event}/event-type | Event counts by CAMEO code |
| GET | /signals/{event}/actor-frequency | Top actors |
| GET | /signals/{event}/location-frequency | Top locations |
| GET | /signals/{event}/tone-over-time | Goldstein scale trend |
| GET | /signals/{event}/actor-location-graph | Network graph nodes and edges |
| GET | /signals/{event}/media-attention | Total mentions over time |
| GET | /dashboard/{event}/summary | All dashboard data in one call |
| GET | /dashboard/{event}/recent-events | Recent raw events table |
| POST | /query | LLM natural language query |
| POST/GET | /graphs/{event} | Saved LLM graphs |
| PATCH | /graphs/{id}/visibility | Show or hide a saved graph |
| DELETE | /graphs/{id} | Delete a saved graph |
| POST/GET | /graphs/{id}/rate | Thumbs up/down rating |
> Note: `/dashboard/{event}/summary`, `/dashboard/{event}/recent-events`, and `/signals/{event}/media-attention`
> read from the shared raw `events` table, which is stored event-agnostically.
Full interactive documentation available at http://localhost:8000/docs when the API is running.

## Code Documentation

Backend-only documentation is available in the `docs` folder:

- `docs/README.md` — Documentation index and navigation.
- `docs/backend.md` — Backend module and API function reference.

Note: frontend code is not documented here yet; this docs set currently covers backend services only.

---

## Running the Tests

```bash
python tests/test_event_config.py
python tests/test_fetcher.py
python tests/test_signal_builder.py
python tests/test_db.py
python tests/test_api.py
python tests/test_llm.py
```

Expected result: 89/89 tests passing.

---

## Notes

- anchor.db is excluded from version control. Each team member generates their own by following the backend setup steps above.
- CAMEO event codes for the Sudan conflict are placeholders pending confirmation from Hamish Pratt. When confirmed, update cameo_codes in backend/config/event_config.py only and re-run the backfill. No other files need to change.
- The LLM query endpoint (POST /query) requires Ollama running locally on port 11434. Update `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in backend/llm/llm.py if using a different host, port, or model name.
