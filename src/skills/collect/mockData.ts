// MOCK DATA for local development without live internet access.
// Every record is deterministic (seeded PRNG), plausible in shape, and explicitly labeled
// is_mock=true end-to-end. It exists so the full pipeline (transform → analysis → report)
// runs on realistic structures. Replace by setting MOCK_MODE=false + real API keys.

import { CollectedItem } from '../types';

// Deterministic PRNG (mulberry32) so demo outputs are reproducible.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function businessDays(count: number, endDate: Date): string[] {
  const days: string[] = [];
  const d = new Date(endDate);
  while (days.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days;
}

const NOW = () => new Date().toISOString();

export function mockWtiSpotSeries(): CollectedItem {
  const rand = rng(42);
  const dates = businessDays(130, new Date());
  let price = 74.5;
  const records = dates.map((date) => {
    // random walk with mild mean reversion + one mid-series supply shock
    price += (74.5 - price) * 0.01 + (rand() - 0.5) * 1.6;
    if (date === dates[70]) price += 3.2; // simulated geopolitical shock
    price = Math.max(55, Math.min(105, price));
    return { Date: date, 'WTI Spot Price FOB (Dollars per Barrel)': Number(price.toFixed(2)) };
  });
  return {
    name: 'wti_spot_prices_daily', kind: 'timeseries',
    sourceName: 'U.S. EIA — Spot Prices (MOCK)', sourceUrl: 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm',
    method: 'mock', contentType: 'text/csv', records, collectedAt: NOW(), isMock: true,
    notes: ['MOCK DATA: deterministic simulated series shaped like the EIA daily WTI spot series. Not real market data.'],
    rawSnapshot: JSON.stringify(records.slice(0, 5)) + ' ... [truncated mock snapshot]'
  };
}

export function mockFuturesCurve(): CollectedItem {
  const spot = 76.8; // consistent with end of mock spot series scale
  const months = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
  const records = months.map((m, i) => ({
    Contract: `CL ${m}`, 'Months Out': i + 1,
    'Settlement Price ($/bbl)': Number((spot - 0.35 * (i + 1) + 0.03 * (i + 1) ** 2).toFixed(2)) // mild backwardation
  }));
  return {
    name: 'wti_futures_curve', kind: 'table',
    sourceName: 'CME Group — WTI Futures Settlements (MOCK)', sourceUrl: 'https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.settlements.html',
    method: 'mock', contentType: 'application/json', records, collectedAt: NOW(), isMock: true,
    notes: ['MOCK DATA: simulated settlement curve in mild backwardation. Not real settlements.'],
    rawSnapshot: JSON.stringify(records)
  };
}

export function mockInventories(): CollectedItem {
  const rand = rng(7);
  const records = businessDays(50, new Date()).filter((_, i) => i % 5 === 0).map((date) => ({
    'Week Ending': date,
    'Commercial Crude Inventory Change (million barrels)': Number(((rand() - 0.55) * 6).toFixed(1))
  }));
  return {
    name: 'us_crude_inventories_weekly', kind: 'timeseries',
    sourceName: 'U.S. EIA — Weekly Petroleum Status Report (MOCK)', sourceUrl: 'https://www.eia.gov/petroleum/supply/weekly/',
    method: 'mock', contentType: 'text/csv', records, collectedAt: NOW(), isMock: true,
    notes: ['MOCK DATA: simulated weekly inventory changes, slight draw bias. Not real EIA data.'],
    rawSnapshot: JSON.stringify(records)
  };
}

export function mockUsdIndex(): CollectedItem {
  const rand = rng(99);
  let v = 103.5;
  const records = businessDays(130, new Date()).map((date) => {
    v += (103.5 - v) * 0.02 + (rand() - 0.5) * 0.35;
    return { DATE: date, DTWEXBGS: Number(v.toFixed(2)) };
  });
  return {
    name: 'usd_broad_index_daily', kind: 'timeseries',
    sourceName: 'FRED — Nominal Broad U.S. Dollar Index (MOCK)', sourceUrl: 'https://fred.stlouisfed.org/series/DTWEXBGS',
    method: 'mock', contentType: 'text/csv', records, collectedAt: NOW(), isMock: true,
    notes: ['MOCK DATA: simulated dollar index series. Not real FRED data.'],
    rawSnapshot: JSON.stringify(records.slice(0, 5)) + ' ... [truncated mock snapshot]'
  };
}

export function mockHeadlines(): CollectedItem {
  const today = new Date();
  const d = (offset: number) => { const x = new Date(today); x.setUTCDate(x.getUTCDate() - offset); return x.toISOString().slice(0, 10); };
  const records = [
    { date: d(0), title: 'OPEC+ signals it will hold production quotas steady at next meeting', tone_hint: 'neutral' },
    { date: d(1), title: 'US crude inventories fall more than expected for third straight week', tone_hint: 'bullish' },
    { date: d(1), title: 'Dollar strengthens as rate-cut expectations fade', tone_hint: 'bearish' },
    { date: d(2), title: 'Shipping disruption risk rises in key transit chokepoint', tone_hint: 'bullish' },
    { date: d(3), title: 'Refinery maintenance season winds down, crude demand set to firm', tone_hint: 'bullish' },
    { date: d(4), title: 'Weak manufacturing data stokes demand concerns in major economies', tone_hint: 'bearish' },
    { date: d(5), title: 'Non-OPEC supply growth forecast revised slightly higher', tone_hint: 'bearish' },
    { date: d(6), title: 'Analysts split on near-term crude direction ahead of EIA report', tone_hint: 'neutral' }
  ];
  return {
    name: 'energy_news_headlines', kind: 'headlines',
    sourceName: 'Reuters Energy (MOCK)', sourceUrl: 'https://www.reuters.com/business/energy/',
    method: 'mock', contentType: 'application/rss+xml', records, collectedAt: NOW(), isMock: true,
    notes: ['MOCK DATA: fictional but realistic headline set for sentiment analysis demo. Not real news.'],
    rawSnapshot: JSON.stringify(records)
  };
}

export function mockOpecStatement(): CollectedItem {
  const text = '[MOCK] OPEC statement excerpt: Participating countries reaffirmed their commitment to current voluntary production adjustments and will continue to monitor market conditions, meeting again next month to review.';
  return {
    name: 'opec_statement', kind: 'text',
    sourceName: 'OPEC Press Release (MOCK)', sourceUrl: 'https://www.opec.org/opec_web/en/press_room/press_releases.htm',
    method: 'mock', contentType: 'text/html', records: [{ date: new Date().toISOString().slice(0, 10), statement: text }],
    text, collectedAt: NOW(), isMock: true,
    notes: ['MOCK DATA: fictional statement in the style of OPEC press releases.'],
    rawSnapshot: text
  };
}

// Which mock payloads map to which selected source domains.
export function mockCollectForDomain(domain: string): CollectedItem[] {
  switch (domain) {
    case 'eia.gov': return [mockWtiSpotSeries(), mockInventories()];
    case 'fred.stlouisfed.org': return [mockUsdIndex()];
    case 'cmegroup.com': return [mockFuturesCurve()];
    case 'reuters.com': return [mockHeadlines()];
    case 'opec.org': return [mockOpecStatement()];
    case 'iea.org': return [];
    default: return [];
  }
}
