// Skill 3 — Source Evaluation and Selection.
// Scores each discovered source on authority, recency, relevance, data availability,
// accessibility, and licensing, then selects the best set and records WHY each source
// was selected or rejected.

import { Plan, DiscoveredSource, EvaluatedSource, AuditSink } from './types';
import { PAYWALLED_DOMAINS } from './search/tiers';

const WEIGHTS = { authority: 0.3, relevance: 0.25, dataAvailability: 0.2, accessibility: 0.15, recency: 0.05, licensing: 0.05 };
const SELECT_THRESHOLD = 0.55;

function relevanceScore(s: DiscoveredSource, plan: Plan): number {
  const hay = `${s.title} ${s.snippet} ${s.url}`.toLowerCase();
  const terms = [...new Set(`${plan.topic} ${plan.targetVariable} ${plan.dataNeeds.join(' ')}`
    .toLowerCase().split(/\W+/).filter((t) => t.length > 3))];
  if (terms.length === 0) return 0.5;
  const hits = terms.filter((t) => hay.includes(t)).length;
  return Math.min(1, 0.2 + (hits / terms.length) * 2.2);
}

function recencyScore(s: DiscoveredSource): number {
  const hint = (s.snippet + ' ' + (('publishedHint' in s && (s as { publishedHint?: string }).publishedHint) || '')).toLowerCase();
  if (/(daily|today|updated weekly|hours ago|minutes ago)/.test(hint)) return 1;
  if (/(weekly|recent|days ago|monthly)/.test(hint)) return 0.8;
  if (/unknown/.test(hint)) return 0.3;
  return 0.6;
}

export function evaluateSources(sources: DiscoveredSource[], plan: Plan, opts: { maxSelected: number; domainBlocklist: string[] }): EvaluatedSource[] {
  const scored: EvaluatedSource[] = sources.map((s) => {
    const paywalled = PAYWALLED_DOMAINS.has(s.domain);
    const blocked = opts.domainBlocklist.includes(s.domain);
    const scores = {
      authority: (5 - s.tier) / 4,
      recency: recencyScore(s),
      relevance: relevanceScore(s, plan),
      dataAvailability: s.supportsStructuredData ? 1 : s.category === 'financial_news' ? 0.5 : 0.4,
      accessibility: blocked ? 0 : paywalled ? 0.15 : s.supportsStructuredData ? 1 : 0.7,
      licensing: s.category === 'government_statistics' || s.category === 'official_org' ? 1 : s.tier <= 2 ? 0.7 : 0.5
    };
    const totalScore = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * scores[k as keyof typeof scores], 0);
    let selected = false;
    let reason: string;
    if (blocked) reason = 'Rejected: domain is on the admin blocklist (source rules).';
    else if (paywalled) reason = 'Rejected: content behind subscription/login; automated access is not permitted. May be cited from public snippets only.';
    else if (s.tier === 4) reason = 'Rejected: low-trust (Tier 4) source with no verifiable methodology; usable only as a weak supporting signal, not as data.';
    else if (totalScore < SELECT_THRESHOLD) reason = `Rejected: composite score ${totalScore.toFixed(2)} below threshold ${SELECT_THRESHOLD} (weak relevance or data availability).`;
    else { selected = true; reason = `Selected: Tier ${s.tier} ${s.category.replace(/_/g, ' ')} source, composite score ${totalScore.toFixed(2)}${s.supportsStructuredData ? ', provides structured/downloadable data' : ''}.`; }
    return { ...s, scores, totalScore: Number(totalScore.toFixed(3)), selected, reason };
  });

  // Enforce cap, keeping the highest-scoring selected sources.
  const selected = scored.filter((s) => s.selected).sort((a, b) => b.totalScore - a.totalScore);
  selected.slice(opts.maxSelected).forEach((s) => {
    s.selected = false;
    s.reason = `Rejected: exceeded MAX_SOURCES_PER_RUN cap (${opts.maxSelected}); lower composite score than retained sources.`;
  });
  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

export async function evaluateAndAudit(sources: DiscoveredSource[], plan: Plan, opts: { maxSelected: number; domainBlocklist: string[] }, audit: AuditSink): Promise<EvaluatedSource[]> {
  const evaluated = evaluateSources(sources, plan, opts);
  await audit({
    step: 'evaluate', level: 'info',
    message: `Evaluated ${evaluated.length} sources: ${evaluated.filter((e) => e.selected).length} selected, ${evaluated.filter((e) => !e.selected).length} rejected`,
    data: evaluated.map((e) => ({ url: e.url, tier: e.tier, score: e.totalScore, selected: e.selected, reason: e.reason }))
  });
  return evaluated;
}
