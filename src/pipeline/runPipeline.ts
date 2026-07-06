// Full research pipeline orchestration + Skill 8 (Auditability and Evidence Trail).
// Every step persists its inputs/outputs to Postgres and appends AuditLog rows, so a
// completed run has a full evidence trail: plan -> queries -> sources -> evaluations ->
// raw snapshots -> datasets -> analysis -> report.

import { prisma } from '@/lib/db';
import { config } from '@/lib/config';
import { storage } from '@/lib/storage';
import { buildPlan } from '@/skills/planner';
import { getSearchProvider, runIntelligentSearch } from '@/skills/search';
import { evaluateAndAudit } from '@/skills/evaluate';
import { collectFromSources } from '@/skills/collect';
import { buildDatasets, datasetDictionary } from '@/skills/transform';
import { runAnalysis } from '@/skills/analysis';
import { generateMarkdownReport, reportSummaryLine } from '@/skills/report';
import { AuditSink } from '@/skills/types';
import { marked } from 'marked';

type Status = 'PLANNING' | 'SEARCHING' | 'EVALUATING' | 'COLLECTING' | 'TRANSFORMING' | 'ANALYZING' | 'REPORTING' | 'COMPLETED' | 'FAILED';

async function setStatus(runId: string, status: Status) {
  await prisma.researchRun.update({ where: { id: runId }, data: { status } });
}

function makeAudit(runId: string): AuditSink {
  return async (e) => {
    await prisma.auditLog.create({
      data: { runId, step: e.step, level: e.level, message: e.message, data: e.data === undefined ? undefined : JSON.parse(JSON.stringify(e.data)) }
    });
  };
}

export async function runPipeline(runId: string): Promise<void> {
  const run = await prisma.researchRun.findUniqueOrThrow({ where: { id: runId }, include: { question: true } });
  const audit = makeAudit(runId);
  const question = run.question.text;

  try {
    await audit({ step: 'start', level: 'info', message: `Run started (mockMode=${config.mockMode})`, data: { question } });

    // --- Skill 1: plan ---
    await setStatus(runId, 'PLANNING');
    const plan = buildPlan(question);
    await prisma.researchPlan.create({
      data: {
        runId, targetVariable: plan.targetVariable, taskType: plan.taskType,
        timeHorizon: plan.timeHorizon.label, geography: plan.geography, domain: plan.domain,
        dataNeeds: plan.dataNeeds, sourceCategories: plan.sourceCategories,
        searchQueries: plan.searchQueries, analysisApproach: plan.analysisApproach,
        expectedOutputs: plan.expectedOutputs, raw: JSON.parse(JSON.stringify(plan))
      }
    });
    await audit({ step: 'plan', level: 'info', message: `Plan built: ${plan.taskType} analysis of "${plan.targetVariable}" over "${plan.timeHorizon.label}"`, data: plan });

    // --- Skill 2: search ---
    await setStatus(runId, 'SEARCHING');
    const provider = getSearchProvider({ provider: config.mockMode ? 'mock' : config.searchProvider, braveApiKey: config.braveApiKey });
    const { queries, sources } = await runIntelligentSearch(plan, provider, audit);
    for (const q of queries) {
      await prisma.searchQuery.create({ data: { runId, query: q.query, provider: q.provider, resultCount: q.results.length, results: JSON.parse(JSON.stringify(q.results)) } });
    }

    // --- Skill 3: evaluate ---
    await setStatus(runId, 'EVALUATING');
    const evaluated = await evaluateAndAudit(sources, plan, { maxSelected: config.maxSourcesPerRun, domainBlocklist: config.domainBlocklist }, audit);
    const sourceIdByUrl = new Map<string, string>();
    for (const s of evaluated) {
      const rec = await prisma.source.create({
        data: {
          runId, url: s.url, domain: s.domain, title: s.title, category: s.category, tier: s.tier,
          discoveredVia: s.discoveredVia, supportsStructuredData: s.supportsStructuredData,
          evaluation: { create: { ...s.scores, totalScore: s.totalScore, selected: s.selected, reason: s.reason } }
        }
      });
      sourceIdByUrl.set(s.url, rec.id);
    }

    // --- Skill 4: collect ---
    await setStatus(runId, 'COLLECTING');
    const selected = evaluated.filter((s) => s.selected);
    const collected = await collectFromSources(selected, plan, {
      mockMode: config.mockMode, userAgent: config.scraperUserAgent,
      rateLimitMs: config.rateLimitMs, timeoutMs: config.httpTimeoutMs,
      eiaApiKey: config.eiaApiKey, fredApiKey: config.fredApiKey
    }, audit);
    if (collected.length === 0) throw new Error('No data could be collected from any selected source.');
    for (const item of collected) {
      const snap = await storage.put(`runs/${runId}/raw/${item.name}.snapshot.txt`, item.rawSnapshot);
      await prisma.rawCollectedData.create({
        data: {
          runId, sourceId: sourceIdByUrl.get(item.sourceUrl) ?? null, name: item.name, method: item.method,
          contentType: item.contentType, snapshotPath: snap.path, recordCount: item.records.length,
          isMock: item.isMock, notes: item.notes, collectedAt: new Date(item.collectedAt)
        }
      });
    }

    // --- Skill 5: transform ---
    await setStatus(runId, 'TRANSFORMING');
    const datasets = await buildDatasets(collected, audit);
    for (const ds of datasets) {
      const csvFile = await storage.put(`runs/${runId}/datasets/${ds.name}.csv`, ds.csv);
      const dictFile = await storage.put(`runs/${runId}/datasets/${ds.name}.dictionary.json`, JSON.stringify(datasetDictionary(ds), null, 2));
      await prisma.processedDataset.create({
        data: {
          runId, name: ds.name, description: ds.description, rowCount: ds.rows.length, columnCount: ds.columns.length,
          schemaJson: JSON.parse(JSON.stringify(ds.columns)), qualityNotes: ds.qualityNotes,
          assumptions: ds.assumptions, sourceUrls: ds.sourceUrls,
          files: {
            create: [
              { kind: 'PROCESSED_CSV', path: csvFile.path, filename: `${ds.name}.csv`, sizeBytes: csvFile.sizeBytes },
              { kind: 'DICTIONARY_JSON', path: dictFile.path, filename: `${ds.name}.dictionary.json`, sizeBytes: dictFile.sizeBytes }
            ]
          }
        }
      });
    }

    // --- Skill 6: analyze ---
    await setStatus(runId, 'ANALYZING');
    const analysis = await runAnalysis(plan, datasets, { serviceUrl: config.analysisServiceUrl, pythonBin: config.pythonBin }, audit);
    const analysisRec = await prisma.analysisRun.create({
      data: {
        runId, method: analysis.method, params: { horizonDays: plan.timeHorizon.days },
        results: JSON.parse(JSON.stringify(analysis.details)), confidence: analysis.confidence,
        engineVersion: analysis.engineVersion, finishedAt: new Date()
      }
    });
    for (const ins of analysis.insights) {
      await prisma.insight.create({ data: { runId, analysisRunId: analysisRec.id, kind: ins.kind, title: ins.title, body: ins.body, importance: ins.importance } });
    }

    // --- Skill 7: report ---
    await setStatus(runId, 'REPORTING');
    const reportInput = {
      question, plan, sources: evaluated, datasets, analysis,
      auditTrail: [], generatedAt: new Date().toISOString(), mockMode: config.mockMode
    };
    const md = generateMarkdownReport(reportInput);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Prospect Report</title><style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1a202c}table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.9rem}th,td{border:1px solid #cbd5e0;padding:.4rem .6rem;text-align:left}th{background:#f7fafc}code{background:#edf2f7;padding:.1rem .3rem;border-radius:3px}</style></head><body>${await marked(md)}</body></html>`;
    const mdFile = await storage.put(`runs/${runId}/report.md`, md);
    const htmlFile = await storage.put(`runs/${runId}/report.html`, html);
    const summary = reportSummaryLine(reportInput);
    await prisma.report.create({ data: { runId, format: 'markdown', path: mdFile.path, summary } });
    await prisma.report.create({ data: { runId, format: 'html', path: htmlFile.path, summary } });
    await audit({ step: 'report', level: 'info', message: 'Reports generated (markdown + html)' });

    await prisma.researchRun.update({ where: { id: runId }, data: { status: 'COMPLETED', finishedAt: new Date(), mockMode: config.mockMode } });
    await audit({ step: 'done', level: 'info', message: 'Run completed successfully' });

    // Notify the owning user (Skill 9 support).
    const project = await prisma.researchProject.findUnique({ where: { id: run.projectId } });
    if (project) {
      await prisma.notification.create({
        data: { userId: project.userId, runId, title: 'Research run complete', body: `"${question}" — ${summary}` }
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.researchRun.update({ where: { id: runId }, data: { status: 'FAILED', error: message, finishedAt: new Date() } });
    await audit({ step: 'error', level: 'error', message: `Run failed: ${message}` });
    throw err;
  }
}
