// Source reliability tiering (Skill 2 support).
// Tier 1: government, statistical agencies, exchanges, regulators, central banks, official filings.
// Tier 2: reputable financial/industry/academic sources. Tier 3: news/commentary. Tier 4: low trust.

const TIER1 = new Set([
  'eia.gov', 'fred.stlouisfed.org', 'stlouisfed.org', 'bls.gov', 'census.gov', 'bea.gov', 'sec.gov',
  'federalreserve.gov', 'treasury.gov', 'data.gov', 'opec.org', 'iea.org', 'imf.org', 'worldbank.org',
  'ecb.europa.eu', 'cmegroup.com', 'ice.com', 'nasdaq.com', 'nyse.com', 'ons.gov.uk', 'eurostat.ec.europa.eu'
]);
const TIER2 = new Set([
  'spglobal.com', 'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'economist.com',
  'oxfordenergy.org', 'rystadenergy.com', 'woodmac.com', 'nature.com', 'sciencedirect.com', 'arxiv.org', 'nber.org'
]);
const TIER3 = new Set([
  'cnbc.com', 'marketwatch.com', 'oilprice.com', 'investing.com', 'barrons.com', 'forbes.com',
  'businessinsider.com', 'yahoo.com', 'finance.yahoo.com', 'tradingeconomics.com'
]);

// Domains known to require subscription/login for content: automated collection is not permitted,
// so they can be cited from search snippets only and are never scraped.
export const PAYWALLED_DOMAINS = new Set(['bloomberg.com', 'wsj.com', 'ft.com', 'economist.com', 'barrons.com']);

export function classifyTier(domain: string): 1 | 2 | 3 | 4 {
  const d = domain.replace(/^www\./, '').toLowerCase();
  if (TIER1.has(d)) return 1;
  if (TIER2.has(d)) return 2;
  if (TIER3.has(d)) return 3;
  if (d.endsWith('.gov') || d.endsWith('.mil') || d.endsWith('.int')) return 1;
  if (d.endsWith('.edu') || d.endsWith('.ac.uk')) return 2;
  return 4;
}

export function classifyCategory(domain: string): string {
  const d = domain.replace(/^www\./, '').toLowerCase();
  if (d.endsWith('.gov') || ['fred.stlouisfed.org', 'eurostat.ec.europa.eu', 'ons.gov.uk'].includes(d)) return 'government_statistics';
  if (['cmegroup.com', 'ice.com', 'nasdaq.com', 'nyse.com'].includes(d)) return 'exchange';
  if (['opec.org', 'iea.org', 'imf.org', 'worldbank.org', 'ecb.europa.eu'].includes(d)) return 'official_org';
  if (d.endsWith('.edu') || ['arxiv.org', 'nber.org', 'nature.com', 'sciencedirect.com'].includes(d)) return 'academic';
  if (['reuters.com', 'cnbc.com', 'marketwatch.com', 'oilprice.com', 'bloomberg.com', 'wsj.com', 'ft.com'].includes(d)) return 'financial_news';
  return 'other';
}
