// Standalone demo of the complete oil-price workflow — NO database, Redis, or internet needed.
// Runs: plan -> search (mock) -> evaluate -> collect (mock) -> transform -> analyze (Python) -> report.
// Outputs land in ./demo-output. Run with: npm run demo
//
// This demo uses clearly-labeled MOCK data. It demonstrates the workflow and honest
// forecasting methodology; it is NOT a real market forecast.

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { buildPlan } from '../src/skills/planner';
import { getSearchProvider, runIntelligentSearch } from '../src/skills/search';
import { evaluateSources } from '../src/skills/evaluate';
import { collectFromSources } from '../src/skills/collect';
import { buildDatasets, datasetDictionary } from '../src/skills/transform';
import { runAnalysis } from '../src/skills/analysis';
import { generateMarkdownReport } from '../src/skills/report';
import { AuditEvent } from '../src/skills/types';

const OUT = path.resolve('demo-output');
const QUESTION = 'What would be the price of oil next week?';

async function main() {
  mkdirSync(path.join(OUT, 'datasets'), { recursive: true });
  const auditTrail: AuditEvent[] = [];
  const audit = (e: Omit<AuditEvent, 'at'>) => {
    const evt = { ...e, at: new Date().toISOString() };
    auditTrail.push(evt);
    console.log(`[${evt.level}] ${evt.step}: ${evt.message}`);
  };

  console.log(`\n=== Prospect standalone demo ===\nQuestion: "${QUESTION}"\n`);

  // Skill 1 — plan
  const plan = buildPlan(QUESTION);
  writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify(plan, null, 2));
  audit({ step: 'plan', level: 'info', message: `target="${plan.targetVariable}", task=${plan.taskType}, horizon=${plan.timeHorizon.label}` });

  // Skill 2 — search (mock provider)
  const { queries, sources } = await runIntelligentSearch(plan, getSearchProvider({ provider: 'mock' }), audit);
  writeFileSync(path.join(OUT, 'search-queries.json'), JSON.stringify(queries, null, 2));

  // Skill 3 — evaluate
  const evaluated = evaluateSources(sources, plan, { maxSelected: 8, domainBlocklist: [] });
  writeFileSync(path.join(OUT, 'sources-evaluated.json'), JSON.stringify(evaluated, null, 2));
  audit({ step: 'evaluate', level: 'info', message: `${evaluated.filter((s) => s.selected).length} selected / ${evaluated.length} discovered` });

  // Skill 4 — collect (mock data, labeled)
  const collected = await collectFromSources(evaluated.filter((s) => s.selected), plan, {
    mockMode: true, userAgent: 'ProspectResearchBot/0.1 (demo)', rateLimitMs: 0, timeoutMs: 10000
  }, audit);

  // Skill 5 — transform to CSVs
  const datasets = await buildDatasets(collected, audit);
  for (const ds of datasets) {
    writeFileSync(path.join(OUT, 'datasets', `${ds.name}.csv`), ds.csv);
    writeFileSync(path.join(OUT, 'datasets', `${ds.name}.dictionary.json`), JSON.stringify(datasetDictionary(ds), null, 2));
  }

  // Skill 6 — analyze via Python engine
  const analysis = await runAnalysis(plan, datasets, { serviceUrl: process.env.ANALYSIS_SERVICE_URL ?? '', pythonBin: process.env.PYTHON_BIN ?? 'python3' }, audit);
  writeFileSync(path.join(OUT, 'analysis.json'), JSON.stringify(analysis.details, null, 2));

  // Skill 7 — report
  const md = generateMarkdownReport({ question: QUESTION, plan, sources: evaluated, datasets, analysis, auditTrail, generatedAt: new Date().toISOString(), mockMode: true });
  writeFileSync(path.join(OUT, 'report.md'), md);
  try {
    const { marked } = await import('marked');
    writeFileSync(path.join(OUT, 'report.html'), `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.55}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;font-size:.9rem}</style></head><body>${await marked(md)}</body></html>`);
  } catch { console.log('(marked not installed yet — skipped HTML render)'); }

  // Skill 8 — audit trail export
  writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(auditTrail, null, 2));

  const d = analysis.details as Record<string, any>;
  console.log('\n=== DEMO RESULT (MOCK DATA — not a real forecast) ===');
  console.log(`Method: ${analysis.method} | Confidence: ${analysis.confidence}`);
  if (d.point) console.log(`Point ~$${d.point} | 80% range $${d.range80[0]}–$${d.range80[1]} | 95% range $${d.range95[0]}–$${d.range95[1]}`);
  console.log(`Datasets: ${datasets.map((x) => x.name + '.csv').join(', ')}`);
  console.log(`Outputs written to ${OUT}\n`);
}

main().catch((e) => { console.error('Demo failed:', e); process.exit(1); });
