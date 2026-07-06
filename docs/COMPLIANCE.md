# Compliance & Ethical Data Collection

Prospect is built for legitimate market research, business intelligence, policy research,
competitive analysis, economic analysis, and public web intelligence. Compliance boundaries
are enforced **in code**, not just documented.

## What the collector will do

1. **Prefer official channels, in order:** official APIs (EIA, FRED) → public CSV/dataset
   downloads → RSS feeds → static public HTML tables (Cheerio). Raw-page scraping is the
   last resort and only for publicly accessible pages.
2. **robots.txt check** before every live fetch (`src/skills/collect/robots.ts`).
   Fail-closed policy: if robots.txt cannot be fetched or returns a server error, the
   source is treated as disallowed and skipped.
3. **Polite rate limiting**: at most one request per domain per `RATE_LIMIT_MS`
   (default 3000 ms), enforced in `src/skills/collect/rateLimiter.ts`.
4. **Transparent identification**: every request sends the clearly-identified
   `ProspectResearchBot` user agent with a contact URL (`SCRAPER_USER_AGENT`).
5. **Respect server pushback**: HTTP 401/403/429 responses cause the source to be
   skipped immediately with the reason logged — never retried, never evaded.
6. **Provenance everywhere**: raw snapshots are archived, and every CSV row carries
   `source_name`, `source_url`, `collected_at`, `is_mock`.
7. **Admin source rules**: `DOMAIN_BLOCKLIST` removes domains from consideration
   entirely; `MAX_SOURCES_PER_RUN` caps collection breadth.

## What the collector will never do

- No bypassing of paywalls, logins, CAPTCHAs, bot protections, or rate limits — there is
  no code for any of this anywhere in the codebase, by design.
- No collection of private, personal, confidential, or access-restricted data.
- Known paywalled domains (Bloomberg, WSJ, FT, Economist, Barron's) are hard-rejected at
  the evaluation stage (`PAYWALLED_DOMAINS` in `src/skills/search/tiers.ts`) and can only
  be *cited* from public search snippets.
- Tier 4 (low-trust) sources are never used as data, only noted as weak signals.
- No fabrication: if a source blocks access or collection fails, the run reports exactly
  that in the audit trail, and the report's "Sources rejected" table explains why.

## Optional rendering (Playwright)

Playwright is **not installed by default**. If installed explicitly and enabled with
`PLAYWRIGHT_ENABLED=true`, it may only be reached for public pages that already passed the
robots.txt and evaluation gates. It uses the same declared user agent. It must not be
pointed at authenticated or protected pages.

## Licensing notes

- U.S. federal data (EIA, FRED series, BLS, Census) is public domain or openly licensed;
  FRED and EIA APIs require free registered keys — respect their terms of use.
- News content: headlines/metadata via public RSS are used for sentiment context with
  attribution; full article text is not republished.
- Always review the terms of any newly added source before writing a collector for it.
