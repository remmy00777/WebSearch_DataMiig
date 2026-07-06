// Real search provider using the Brave Search API (official, keyed, ToS-compliant).
// Enable with SEARCH_PROVIDER=brave and BRAVE_API_KEY. Swap in any provider by
// implementing the SearchProvider interface (SerpAPI, Bing, Tavily, etc.).

import { SearchProvider } from './provider';
import { SearchResultItem } from '../types';

export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';
  constructor(private apiKey: string, private timeoutMs = 15000) {}

  async search(query: string, limit = 8): Promise<SearchResultItem[]> {
    if (!this.apiKey) throw new Error('BRAVE_API_KEY not set');
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const res = await fetch(url, {
      headers: { 'X-Subscription-Token': this.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
    const json = (await res.json()) as { web?: { results?: { url: string; title: string; description?: string; age?: string }[] } };
    return (json.web?.results ?? []).map((r) => ({
      url: r.url, title: r.title, snippet: r.description ?? '', publishedHint: r.age
    }));
  }
}
