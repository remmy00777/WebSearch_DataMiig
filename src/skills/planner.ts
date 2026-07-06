// Skill 1 — Natural Language Research Planner.
// Deterministic heuristic parser (no external calls). An LLM provider can be plugged in
// via refinePlanWithLlm() for richer parsing; the heuristic result is always the fallback.

import { Plan, TaskType } from './types';

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  energy_commodities: ['oil', 'crude', 'wti', 'brent', 'opec', 'gasoline', 'natural gas', 'petroleum', 'barrel'],
  housing: ['housing', 'home price', 'mortgage', 'real estate', 'rent'],
  labor_market: ['unemployment', 'jobs report', 'payroll', 'wages', 'labor market'],
  inflation_macro: ['inflation', 'cpi', 'interest rate', 'gdp', 'recession', 'fed '],
  equities: ['stock', 'equity', 's&p', 'nasdaq', 'share price', 'earnings'],
  crypto: ['bitcoin', 'ethereum', 'crypto'],
  competitive_intel: ['competitor', 'market share', 'pricing strategy', 'benchmark'],
  policy_regulation: ['regulation', 'policy', 'law', 'compliance requirement', 'legislation']
};

const SOURCE_CATEGORIES_BY_DOMAIN: Record<string, string[]> = {
  energy_commodities: ['government_statistics', 'exchange', 'market_data_api', 'official_org', 'financial_news'],
  housing: ['government_statistics', 'market_data_api', 'financial_news', 'academic'],
  labor_market: ['government_statistics', 'market_data_api', 'financial_news'],
  inflation_macro: ['government_statistics', 'market_data_api', 'financial_news', 'academic'],
  equities: ['exchange', 'market_data_api', 'official_filings', 'financial_news'],
  crypto: ['exchange', 'market_data_api', 'financial_news'],
  competitive_intel: ['official_filings', 'company_published', 'financial_news', 'market_research'],
  policy_regulation: ['government_statistics', 'official_org', 'financial_news', 'academic'],
  general: ['government_statistics', 'academic', 'financial_news']
};

function detectDomain(q: string): string {
  let best = 'general', bestHits = 0;
  for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    const hits = kws.filter((k) => q.includes(k)).length;
    if (hits > bestHits) { best = domain; bestHits = hits; }
  }
  return best;
}

function detectTaskType(q: string): TaskType {
  if (/(monitor|track|watch|alert|keep an eye)/.test(q)) return 'monitoring';
  if (/(compare|versus|\bvs\b|benchmark|better than)/.test(q)) return 'comparative';
  if (/(why|cause|driver|because of|impact of|effect of)/.test(q)) return 'causal';
  if (/(will|would|forecast|predict|next (week|month|quarter|year)|tomorrow|outlook|expect)/.test(q)) return 'predictive';
  if (/(what happened|summar|overview|current state|how much|how many)/.test(q)) return 'descriptive';
  return 'exploratory';
}

function detectHorizon(q: string): { label: string; days: number | null } {
  const m = q.match(/in (\d+)\s*(day|week|month|year)s?/);
  if (m) {
    const n = parseInt(m[1], 10);
    const mult = { day: 1, week: 7, month: 30, year: 365 }[m[2] as 'day'] ?? 1;
    return { label: `${n} ${m[2]}(s)`, days: n * mult };
  }
  if (/tomorrow/.test(q)) return { label: 'tomorrow', days: 1 };
  if (/next week/.test(q)) return { label: 'next week', days: 7 };
  if (/next month/.test(q)) return { label: 'next month', days: 30 };
  if (/next quarter/.test(q)) return { label: 'next quarter', days: 90 };
  if (/next year/.test(q)) return { label: 'next year', days: 365 };
  return { label: 'unspecified', days: null };
}

function detectGeography(q: string): string | null {
  const geos = ['united states', 'us ', 'usa', 'europe', 'china', 'india', 'uk ', 'global', 'canada', 'japan', 'germany'];
  for (const g of geos) if (q.includes(g)) return g.trim();
  return null;
}

function detectTargetVariable(q: string, domain: string): string {
  const priceOf = q.match(/price of ([a-z\s]+?)(?:\s+next|\s+in\s|\s+over|\?|$)/);
  if (priceOf) return `${priceOf[1].trim()} price`;
  if (domain === 'energy_commodities' && /(oil|crude|wti|brent)/.test(q)) return 'crude oil spot price (USD/bbl)';
  const firstNoun = q.replace(/^(what|how|when|why|will|would|is|are|does|do)\s+/g, '').split('?')[0];
  return firstNoun.slice(0, 80).trim() || 'unspecified';
}

export function buildPlan(question: string): Plan {
  const q = question.toLowerCase();
  const domain = detectDomain(q);
  const taskType = detectTaskType(q);
  const timeHorizon = detectHorizon(q);
  const geography = detectGeography(q);
  const targetVariable = detectTargetVariable(q, domain);

  const dataNeeds: string[] = [];
  const notes: string[] = [];
  let analysisApproach = 'descriptive_statistics';

  if (domain === 'energy_commodities' && taskType === 'predictive') {
    dataNeeds.push(
      'Historical daily spot prices (WTI and/or Brent)',
      'Futures curve (nearest contracts, e.g. CME/NYMEX WTI)',
      'Weekly crude inventory changes (EIA Weekly Petroleum Status Report)',
      'OPEC/OPEC+ production signals and statements',
      'Demand indicators (refinery runs, seasonal demand)',
      'US dollar index (inverse correlation with commodity prices)',
      'Geopolitical and supply-disruption news headlines',
      'Historical volatility (for uncertainty bands)',
      'Calendar of scheduled market-moving reports (EIA, OPEC MOMR)'
    );
    analysisApproach = 'short_horizon_forecast_baseline_comparison';
    notes.push(
      'Short-horizon commodity prices are close to a random walk; baselines must be beaten before trusting any model.',
      'Qualitative signals (news sentiment, OPEC statements) are reported separately, never mixed into the numeric forecast.',
      'Output must be a likely range, not a falsely precise point estimate.'
    );
  } else if (taskType === 'predictive') {
    dataNeeds.push('Historical time series of the target variable', 'Leading indicators for the domain', 'Recent news and scheduled events');
    analysisApproach = 'time_series_baseline_comparison';
  } else if (taskType === 'comparative') {
    dataNeeds.push('Comparable metrics across the entities being compared', 'Consistent time periods and units');
    analysisApproach = 'comparative_benchmarking';
  } else if (taskType === 'causal') {
    dataNeeds.push('Time series of outcome and candidate drivers', 'Event timeline');
    analysisApproach = 'correlation_and_event_analysis';
    notes.push('Observational web data supports correlational evidence only; causal claims will be caveated.');
  } else if (taskType === 'monitoring') {
    dataNeeds.push('Repeatable indicator set with stable source endpoints');
    analysisApproach = 'monitoring_snapshot_with_change_detection';
  } else {
    dataNeeds.push('Recent authoritative publications and datasets on the topic');
  }

  const base = targetVariable.replace(/\s*\(.*\)/, '');
  const searchQueries =
    domain === 'energy_commodities'
      ? [
          'EIA weekly petroleum status report crude inventories',
          'WTI crude oil futures curve settlements CME',
          'EIA WTI spot price daily historical data',
          'OPEC+ production decision latest statement',
          'crude oil market outlook this week supply demand',
          'US dollar index DXY latest',
          'FRED WTI crude oil spot price series'
        ]
      : [
          `${base} official statistics data`,
          `${base} historical data download`,
          `${base} latest report`,
          `${base} analysis ${new Date().getFullYear()}`
        ];

  return {
    question,
    topic: base,
    targetVariable,
    taskType,
    timeHorizon,
    geography,
    domain,
    dataNeeds,
    sourceCategories: SOURCE_CATEGORIES_BY_DOMAIN[domain] ?? SOURCE_CATEGORIES_BY_DOMAIN.general,
    searchQueries,
    analysisApproach,
    expectedOutputs: [
      'Clean CSV dataset(s) with provenance columns',
      'Executive summary', 'Technical report', 'Non-technical explanation',
      'Source list with reliability tiers and selection reasons',
      'Methodology, limitations, confidence level', 'Actionable recommendations'
    ],
    notes
  };
}

// Optional LLM refinement hook. Provide an implementation that calls your LLM of choice
// (e.g. Claude API) and returns a Plan; on any failure the heuristic plan is used.
export type LlmPlanner = (question: string, heuristicPlan: Plan) => Promise<Plan>;
export async function refinePlanWithLlm(question: string, llm?: LlmPlanner): Promise<Plan> {
  const heuristic = buildPlan(question);
  if (!llm) return heuristic;
  try { return await llm(question, heuristic); } catch { return heuristic; }
}
