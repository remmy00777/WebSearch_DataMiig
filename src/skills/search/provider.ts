// Skill 2 — Intelligent Web Search: pluggable provider abstraction.

import { SearchResultItem } from '../types';

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<SearchResultItem[]>;
}
