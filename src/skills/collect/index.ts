// Skill 4 — Compliant Web Scraping and Data Collection.
// Order of preference: official API > CSV/dataset download > RSS > static HTML tables.
// Every fetch passes: domain blocklist -> robots.txt check -> per-domain rate limit.
// Sources that deny access (401/403/429) or disallow robots are SKIPPED with the reason logged.
// Nothing here bypasses paywalls, logins, CAPTCHAs, bot protection, or rate limits.

import { Plan, EvaluatedSource, CollectedItem, AuditSink } from '../types';
import { isAllowedByRobots } from './robots';
import { politeDelay } from './rateLimiter';
import { fetchCsvDownload, fetchHtmlTables, fetchJson, fetchRss } from './fetchers';
import { mockCollectForDomain } from './mockData';

export interface CollectOptions {
  mockMode: boolean;
  userAgent: string;
  rateLimitMs: number;
  timeoutMs: number;
  eiaApiKey?: string;
  fredApiKey?: string;
}

export async function collectFromSources(selected: EvaluatedSource[], plan: Plan, opts: CollectOptions, audit: AuditSink): Promise<CollectedItem[]> {
  const collected: CollectedItem[] = [];
  const loadedNames = new Set<string>();

  for (const source of selected) {
    if (opts.mockMode) {
      const items = mockCollectForDomain(source.domain).filter((i) => !loadedNames.has(i.name));
      if (items.length === 0) {
        await audit({ step: 'collect', level: 'info', message: `MOCK: no new bundled dataset mapped to ${source.domain}; source used as context only.` });
        continue;
      }
      for (const item of items) {
        loadedNames.add(item.name);
        collected.push(item);
        await audit({ step: 'collect', level: 'info', message: `MOCK: loaded "${item.name}" (${item.records.length} records) mapped to ${source.domain}. Clearly labeled is_mock=true.` });
      }
      continue;
    }

    // ---- Live mode ----
    const robots = await isAllowedByRobots(source.url, opts.userAgent, opts.timeoutMs);
    if (!robots.allowed) {
      await audit({ step: 'collect', level: 'warn', message: `Skipped ${source.url}: ${robots.reason}` });
      continue;
    }
    await politeDelay(source.url, opts.rateLimitMs);
    try {
      const item = await collectLive(source, plan, opts);
      if (item) {
        collected.push(...(Array.isArray(item) ? item : [item]));
        await audit({ step: 'collect', level: 'info', message: `Collected from ${source.domain} via ${(Array.isArray(item) ? item[0] : item).method}` });
      } else {
        await audit({ step: 'collect', level: 'info', message: `No structured collector implemented for ${source.domain}; source retained as citation only.` });
      }
    } catch (err) {
      await audit({ step: 'collect', level: 'warn', message: `Collection failed for ${source.url}; source skipped. Reason: ${String(err)}` });
    }
  }
  return collected;
}

// Live collectors for known open providers. Extend this map to support more official APIs.
async function collectLive(source: EvaluatedSource, plan: Plan, opts: CollectOptions): Promise<CollectedItem | CollectedItem[] | null> {
  const f = { userAgent: opts.userAgent, timeoutMs: opts.timeoutMs };
  const now = new Date().toISOString();

  if (source.domain === 'fred.stlouisfed.org' && opts.fredApiKey) {
    // Official FRED API (free key, permissive terms for public series).
    const seriesId = source.url.includes('DTWEXBGS') ? 'DTWEXBGS' : 'DCOILWTICO';
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${opts.fredApiKey}&file_type=json&observation_start=${new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10)}`;
    const { data, raw } = await fetchJson(url, f);
    const obs = (data as { observations: { date: string; value: string }[] }).observations;
    return {
      name: seriesId === 'DTWEXBGS' ? 'usd_broad_index_daily' : 'wti_spot_prices_daily',
      kind: 'timeseries', sourceName: `FRED ${seriesId}`, sourceUrl: source.url, method: 'api',
      contentType: 'application/json', records: obs.map((o) => ({ DATE: o.date, [seriesId]: o.value })),
      collectedAt: now, isMock: false, notes: ['Collected via official FRED API.'], rawSnapshot: raw.slice(0, 20000)
    };
  }

  if (source.domain === 'eia.gov' && opts.eiaApiKey) {
    // Official EIA v2 API (free key). WTI Cushing spot daily.
    const url = `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${opts.eiaApiKey}&frequency=daily&data[0]=value&facets[series][]=RWTC&sort[0][column]=period&sort[0][direction]=desc&length=200`;
    const { data, raw } = await fetchJson(url, f);
    const rows = (data as { response: { data: { period: string; value: number }[] } }).response.data;
    return {
      name: 'wti_spot_prices_daily', kind: 'timeseries', sourceName: 'EIA API (RWTC)', sourceUrl: source.url,
      method: 'api', contentType: 'application/json',
      records: rows.map((r) => ({ Date: r.period, 'WTI Spot Price FOB (Dollars per Barrel)': r.value })),
      collectedAt: now, isMock: false, notes: ['Collected via official EIA v2 API.'], rawSnapshot: raw.slice(0, 20000)
    };
  }

  if (source.url.endsWith('.csv')) {
    const { records, raw } = await fetchCsvDownload(source.url, f);
    return { name: source.domain.replace(/\W/g, '_') + '_csv', kind: 'table', sourceName: source.title, sourceUrl: source.url, method: 'csv_download', contentType: 'text/csv', records, collectedAt: now, isMock: false, notes: ['Public CSV download.'], rawSnapshot: raw.slice(0, 20000) };
  }

  if (source.url.includes('/rss') || source.url.endsWith('.xml')) {
    const { items, raw } = await fetchRss(source.url, f);
    return { name: source.domain.replace(/\W/g, '_') + '_headlines', kind: 'headlines', sourceName: source.title, sourceUrl: source.url, method: 'rss', contentType: 'application/rss+xml', records: items.map((i) => ({ date: i.pubDate, title: i.title, link: i.link })), collectedAt: now, isMock: false, notes: ['Public RSS feed.'], rawSnapshot: raw.slice(0, 20000) };
  }

  if (source.supportsStructuredData) {
    // Static public HTML table extraction (Cheerio) as last resort for open data pages.
    const { tables, raw } = await fetchHtmlTables(source.url, f);
    if (tables.length) {
      return { name: source.domain.replace(/\W/g, '_') + '_table', kind: 'table', sourceName: source.title, sourceUrl: source.url, method: 'html_table', contentType: 'text/html', records: tables[0], collectedAt: now, isMock: false, notes: [`Extracted largest public HTML table (${tables.length} table(s) found).`], rawSnapshot: raw.slice(0, 20000) };
    }
  }
  return null;
}
