# ⛏ Prospect — Intelligent Web Research & Data Mining Agent

Prospect turns natural-language research questions ("What would be the price of oil next
week?") into evidence-backed data mining reports: it plans the research, searches the web
strategically, vets sources by reliability tier, collects public data compliantly, builds
clean provenance-tracked CSV datasets, chooses an honest analysis method, and produces
stakeholder-ready reports with a full audit trail.

**Compliance is a design constraint**, not an afterthought — see [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

## Architecture

- **Web + API**: Next.js 14 (App Router, TypeScript), cookie-session auth (bcrypt + HMAC).
- **Database**: PostgreSQL via Prisma (18 entities: User, ResearchProject, ResearchRun,
  ResearchQuestion, ResearchPlan, SearchQuery, Source, SourceEvaluation, RawCollectedData,
  ProcessedDataset, DatasetFile, AnalysisRun, Insight, Report, ScheduledJob, AuditLog,
  IntegrationSetting, Notification).
- **Jobs**: BullMQ + Redis worker (`src/worker.ts`) with a cron scheduler for recurring
  research; `RUN_JOBS_INLINE=true` runs pipelines in-process for Redis-free local dev.
- **Analysis**: Python service (`analysis/`) using pandas/NumPy (+ optional statsmodels
  ARIMA), reachable via FastAPI (Docker) or spawned CLI (local).
- **Storage**: local filesystem with an S3-ready driver interface (`src/lib/storage.ts`).
- **Skills** (`src/skills/`): 1 planner · 2 search · 3 evaluation · 4 compliant collection ·
  5 transform/CSV · 6 analysis · 7 report · 8 audit (pipeline + AuditLog) · 9 scheduler (worker).

## Quick start (no Docker, no keys — mock mode)

Requires Node 20+, Python 3.10+ with `pandas` and `numpy` (`pip install pandas numpy`).

```bash
npm install
npm run demo        # full oil-price workflow end-to-end, no DB needed
```

`npm run demo` writes to `./demo-output/`: `plan.json`, `search-queries.json`,
`sources-evaluated.json`, `datasets/*.csv` (+ data dictionaries), `analysis.json`,
`report.md`, `report.html`, `audit.json`. All data is **clearly labeled mock data**.

## Full app (Docker Compose)

```bash
cp .env.example .env          # set APP_SECRET
docker compose up --build     # postgres + redis + analysis + web + worker
# open http://localhost:3000 — sign in with demo@example.com / demo1234
```

## Full app (manual, local)

```bash
cp .env.example .env                       # defaults: MOCK_MODE=true, RUN_JOBS_INLINE=true
# start postgres somehow, e.g.: docker run -d -p 5432:5432 -e POSTGRES_USER=prospect \
#   -e POSTGRES_PASSWORD=prospect -e POSTGRES_DB=prospect postgres:16-alpine
npm install
npx prisma db push && npm run db:seed
pip install pandas numpy statsmodels       # engine deps (statsmodels optional)
npm run dev                                # http://localhost:3000
# optional (for schedules): set RUN_JOBS_INLINE=false, start redis, then: npm run worker
```

## Environment variables

See `.env.example` — every variable is documented inline. Key ones:

| Variable | Purpose |
| --- | --- |
| `MOCK_MODE` | `true` = bundled labeled demo data, no live fetches. `false` = live providers. |
| `RUN_JOBS_INLINE` | `true` = pipelines run in-process (no Redis). `false` = BullMQ worker. |
| `SEARCH_PROVIDER` / `BRAVE_API_KEY` | Pluggable search (`mock` or `brave`). |
| `EIA_API_KEY`, `FRED_API_KEY` | Official data APIs (free keys) — preferred over scraping. |
| `RATE_LIMIT_MS`, `HTTP_TIMEOUT_MS`, `MAX_SOURCES_PER_RUN`, `DOMAIN_BLOCKLIST` | Admin collection/compliance rules. |
| `SCRAPER_USER_AGENT` | Transparent bot identification sent on every request. |
| `ANALYSIS_SERVICE_URL` | Set to FastAPI URL (Docker) or leave empty to spawn `analysis/cli.py`. |

## Going live (replacing mock data)

1. Get free API keys: [EIA](https://www.eia.gov/opendata/), [FRED](https://fred.stlouisfed.org/docs/api/api_key.html), and a search key (e.g. [Brave Search API](https://brave.com/search/api/)).
2. Set `MOCK_MODE=false`, `SEARCH_PROVIDER=brave`, and the keys in `.env`.
3. The pipeline then: searches live → evaluates sources (same scoring) → collects via
   official APIs first, then CSV/RSS/static-HTML for allowed public pages (robots-checked,
   rate-limited) → everything downstream is identical.
4. Add more providers by implementing `SearchProvider` (`src/skills/search/provider.ts`)
   or extending `collectLive()` (`src/skills/collect/index.ts`).

## How the pieces work

- **CSV generation (Skill 5)**: `src/skills/transform.ts` normalizes column names to
  snake_case, infers types, ISO-dates, dedupes by date key, drops empty rows (no silent
  imputation), appends provenance columns (`source_name`, `source_url`, `collected_at`,
  `is_mock`), and writes a JSON data dictionary next to every CSV.
- **Reports (Skill 7)**: `src/skills/report.ts` renders Markdown → HTML (marked) with all
  required sections: direct answer, executive summary, non-technical explanation, technical
  methodology, sources used *and rejected with reasons*, dataset summary, key findings,
  limitations, confidence, recommendations, field-definition appendix.
- **Scheduling (Skill 9)**: create cron schedules in the UI (`/schedules`). The worker
  ticks every 60 s, matches cron expressions, creates a run, processes it via BullMQ, and
  writes a `Notification` when the report is ready.
- **Audit (Skill 8)**: every step appends `AuditLog` rows (question, plan, queries, source
  decisions, collection outcomes incl. skips + reasons, transforms, analysis choice,
  outputs, errors) — visible on the run page and exported in the demo as `audit.json`.

## Forecasting methodology (honest by construction)

For short-horizon price questions the engine (`analysis/engine.py`):
walk-forward backtests naive / SMA-5 / drift (+ ARIMA when installed) at the requested
horizon, weights the best performers, optionally anchors on the futures curve, derives 80%
and 95% ranges from realized volatility (σ√h), reports news sentiment **separately** from
the numeric estimate, caps confidence at MEDIUM for market prices, and states assumptions
and limitations explicitly. The range is the answer; the point is a reference.

## Known limitations (MVP)

- Mock search results and mock datasets are curated for the energy domain; other domains
  fall back to generic mocks (the workflow still runs, with thinner outputs).
- Heuristic (non-LLM) question parser; an LLM planner hook exists (`refinePlanWithLlm`).
- Live collectors implemented for EIA + FRED APIs, generic CSV/RSS/HTML-table; other
  sources are citation-only until collectors are added.
- Sentiment is lexicon-based; no PDF ingestion; charts are tables rather than images.
- Single-node storage; S3 driver is a stub interface.

## Recommended next production steps

1. LLM-powered planner + report narrative via the Claude API behind the existing hooks.
2. More official collectors (World Bank, Eurostat, SEC EDGAR, company IR RSS).
3. Object storage (S3) + signed download URLs; per-user encryption keys via KMS.
4. Observability (OpenTelemetry), retries with dead-letter queues, run resumability.
5. Real chart rendering in reports; PDF export (report HTML is already print-ready).
6. Multi-tenant roles/permissions, SSO, and per-source legal review workflow.
