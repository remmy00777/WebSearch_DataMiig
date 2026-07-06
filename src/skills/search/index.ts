// Skill 2 — Intelligent Web Search orchestration: run the plan's targeted queries,
// deduplicate by URL, classify each discovered source by tier and category.

import { Plan, DiscoveredSource, SearchResultItem, AuditSink } from '../types';
import { SearchProvider } from './provider';
import { MockSearchProvider } from './mockProvider';
import { BraveSearchProvider } from './braveProvider';
import { classifyTier, classifyCategory } from './tiers';

export function getSearchProvider(opts: { provider: string; braveApiKey?: string }): SearchProvider {
  if (opts.provider === 'brave') return new BraveSearchProvider(opts.braveApiKey ?? '');
  return new MockSearchProvider();
}

const STRUCTURED_DATA_DOMAINS = new Set([
  'eia.gov', 'fred.stlouisfed.org', 'cmegroup.com', 'census.gov', 'bls.gov', 'data.gov',
  'worldbank.org', 'imf.org', 'eurostat.ec.europa.eu'
]);

export interface SearchRunResult {
  queries: { query: string; provider: string; results: SearchResultItem[] }[];
  sources: DiscoveredSource[];
}

export async function runIntelligentSearch(plan: Plan, provider: SearchProvider, audit: AuditSink): Promise<SearchRunResult> {
  const queries: SearchRunResult['queries'] = [];
  const byUrl = new Map<string, DiscoveredSource>();

  for (const query of plan.searchQueries) {
    let results: SearchResultItem[] = [];
    try {
      results = await provider.search(query);
    } catch (err) {
      await audit({ step: 'search', level: 'warn', message: `Query failed: "${query}" (${String(err)})` });
    }
    queries.push({ query, provider: provider.name, results });
    for (const r of results) {
      if (byUrl.has(r.url)) continue;
      let domain = 'unknown';
      try { domain = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* keep unknown */ }
      byUrl.set(r.url, {
        url: r.url, domain, title: r.title, snippet: r.snippet,
        category: classifyCategory(domain), tier: classifyTier(domain),
        discoveredVia: query,
        supportsStructuredData: STRUCTURED_DATA_DOMAINS.has(domain),
        isMock: provider.name === 'mock'
      });
    }
  }

  const sources = [...byUrl.values()].sort((a, b) => a.tier - b.tier);
  await audit({
    step: 'search', level: 'info',
    message: `Ran ${queries.length} targeted queries via "${provider.name}"; discovered ${sources.length} unique sources`,
    data: { tiers: sources.reduce<Record<string, number>>((acc, s) => ((acc[`tier${s.tier}`] = (acc[`tier${s.tier}`] ?? 0) + 1), acc), {}) }
  });
  return { queries, sources };
}
