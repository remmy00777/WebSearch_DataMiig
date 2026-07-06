// Mock search provider for local development WITHOUT live internet access.
// Results are curated, realistic source listings — clearly labeled mock. They point to real
// authoritative domains so the tiering/evaluation logic behaves exactly as it would live.

import { SearchProvider } from './provider';
import { SearchResultItem } from '../types';

const OIL_RESULTS: SearchResultItem[] = [
  { url: 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm', title: 'Spot Prices for Crude Oil and Petroleum Products - EIA', snippet: '[MOCK RESULT] Daily WTI Cushing and Brent spot prices, downloadable series. U.S. Energy Information Administration open data.', publishedHint: 'updated weekly' },
  { url: 'https://www.eia.gov/petroleum/supply/weekly/', title: 'Weekly Petroleum Status Report - EIA', snippet: '[MOCK RESULT] Weekly U.S. crude oil inventories, production, refinery inputs. Official statistics, open license.', publishedHint: 'updated weekly' },
  { url: 'https://fred.stlouisfed.org/series/DCOILWTICO', title: 'Crude Oil Prices: WTI (DCOILWTICO) | FRED', snippet: '[MOCK RESULT] Daily WTI spot price series with CSV download and free API. Federal Reserve Bank of St. Louis.', publishedHint: 'daily' },
  { url: 'https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.settlements.html', title: 'Crude Oil Futures Settlements - CME Group', snippet: '[MOCK RESULT] Daily settlement prices for NYMEX WTI crude oil futures by contract month.', publishedHint: 'daily' },
  { url: 'https://www.opec.org/opec_web/en/press_room/press_releases.htm', title: 'OPEC Press Releases', snippet: '[MOCK RESULT] Official OPEC and OPEC+ ministerial statements on production levels.', publishedHint: 'recent' },
  { url: 'https://www.iea.org/reports/oil-market-report', title: 'Oil Market Report - IEA', snippet: '[MOCK RESULT] Monthly IEA oil market analysis: demand, supply, stocks. Summary freely available.', publishedHint: 'monthly' },
  { url: 'https://www.reuters.com/business/energy/', title: 'Energy News - Reuters', snippet: '[MOCK RESULT] Latest crude oil market news: OPEC+ decisions, inventories, geopolitical supply risk.', publishedHint: 'today' },
  { url: 'https://oilprice.com/oil-price-charts/', title: 'Oil Price Charts - OilPrice.com', snippet: '[MOCK RESULT] Crude oil price commentary and charts. Secondary/commentary source.', publishedHint: 'today' },
  { url: 'https://www.bloomberg.com/energy', title: 'Energy - Bloomberg Markets', snippet: '[MOCK RESULT] Crude futures quotes and analysis. Subscription required for full content.', publishedHint: 'today' },
  { url: 'https://crude-oracle.example.net/next-week-prediction', title: 'Oil Price Next Week PREDICTION!!! - CrudeOracle Blog', snippet: '[MOCK RESULT] Anonymous blog promising exact price predictions. No methodology or sourcing.', publishedHint: 'unknown' },
  { url: 'https://fred.stlouisfed.org/series/DTWEXBGS', title: 'Nominal Broad U.S. Dollar Index (DTWEXBGS) | FRED', snippet: '[MOCK RESULT] Daily broad dollar index, CSV download and free API.', publishedHint: 'daily' }
];

const GENERIC_RESULTS: SearchResultItem[] = [
  { url: 'https://www.census.gov/data.html', title: 'Data - U.S. Census Bureau', snippet: '[MOCK RESULT] Official public datasets across demographics and the economy.' },
  { url: 'https://fred.stlouisfed.org/', title: 'FRED Economic Data', snippet: '[MOCK RESULT] 800,000+ economic time series with free API and CSV download.' },
  { url: 'https://www.reuters.com/', title: 'Reuters News', snippet: '[MOCK RESULT] Reputable global news coverage.' },
  { url: 'https://example-commentary.example.org/analysis', title: 'Topic Commentary Blog', snippet: '[MOCK RESULT] Secondary commentary with unclear sourcing.' }
];

export class MockSearchProvider implements SearchProvider {
  readonly name = 'mock';
  async search(query: string): Promise<SearchResultItem[]> {
    const q = query.toLowerCase();
    const oily = /(oil|crude|wti|brent|opec|petroleum|dollar index|dxy)/.test(q);
    const pool = oily ? OIL_RESULTS : GENERIC_RESULTS;
    // Return the subset most relevant to this query (simple keyword scoring).
    const terms = q.split(/\W+/).filter((t) => t.length > 3);
    return pool
      .map((r) => ({ r, s: terms.filter((t) => (r.title + r.snippet + r.url).toLowerCase().includes(t)).length }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map(({ r }) => r);
  }
}
