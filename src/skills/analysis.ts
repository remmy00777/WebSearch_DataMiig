// Skill 6 — Data Mining and Analysis Engine (client side).
// Builds an analysis payload from the datasets, routes it to the Python engine
// (HTTP service in Docker, or spawned CLI locally), and maps results to insights.
// Method selection is evidence-driven: baselines first, ranges not point estimates,
// qualitative signals reported separately from the numeric forecast.

import { spawn } from 'child_process';
import { Plan, Dataset, AnalysisResult, InsightItem, AuditSink } from './types';

export interface AnalysisOptions { serviceUrl: string; pythonBin: string; timeoutMs?: number }

function seriesFrom(d: Dataset | undefined, valueColHint?: string): { date: string; value: number }[] {
  if (!d) return [];
  const dateCol = d.columns.find((c) => c.type === 'date')?.name;
  const valCol = valueColHint && d.columns.some((c) => c.name === valueColHint)
    ? valueColHint
    : d.columns.find((c) => c.type === 'number' && !['is_mock'].includes(c.name))?.name;
  if (!dateCol || !valCol) return [];
  return d.rows
    .filter((r) => r[dateCol] !== null && r[valCol] !== null)
    .map((r) => ({ date: String(r[dateCol]), value: Number(r[valCol]) }));
}

export function buildAnalysisPayload(plan: Plan, datasets: Dataset[]) {
  const byName = (frag: string) => datasets.find((d) => d.name.includes(frag));
  const spot = byName('spot');
  const headlinesDs = byName('headlines');
  return {
    task_type: plan.taskType,
    domain: plan.domain,
    target: plan.targetVariable,
    horizon_days: plan.timeHorizon.days ?? 7,
    prices: seriesFrom(spot),
    futures: (byName('futures')?.rows ?? []).map((r) => ({
      months_out: Number(r.months_out ?? 0), settle: Number(r.settlement_price_bbl ?? r.settle ?? 0)
    })).filter((f) => f.settle > 0),
    inventories: seriesFrom(byName('inventories')),
    usd_index: seriesFrom(byName('usd')),
    headlines: (headlinesDs?.rows ?? []).map((r) => ({ date: String(r.date ?? ''), title: String(r.title ?? '') })),
    // Generic fallback series for non-oil questions: first numeric time series available.
    series: seriesFrom(datasets.find((d) => d.columns.some((c) => c.type === 'date') && d.columns.some((c) => c.type === 'number'))),
    is_mock: datasets.some((d) => d.isMock)
  };
}

async function callEngine(payload: unknown, opts: AnalysisOptions): Promise<Record<string, unknown>> {
  if (opts.serviceUrl) {
    const res = await fetch(`${opts.serviceUrl.replace(/\/$/, '')}/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(opts.timeoutMs ?? 60000)
    });
    if (!res.ok) throw new Error(`Analysis service error ${res.status}: ${await res.text()}`);
    return (await res.json()) as Record<string, unknown>;
  }
  // Local mode: spawn the Python CLI (same engine code as the service).
  return new Promise((resolve, reject) => {
    const proc = spawn(opts.pythonBin, ['analysis/cli.py'], { cwd: process.cwd() });
    let out = '', err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Python engine exited ${code}: ${err.slice(0, 2000)}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`Bad engine output: ${String(e)} :: ${out.slice(0, 500)}`)); }
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

export async function runAnalysis(plan: Plan, datasets: Dataset[], opts: AnalysisOptions, audit: AuditSink): Promise<AnalysisResult> {
  const payload = buildAnalysisPayload(plan, datasets);
  await audit({ step: 'analyze', level: 'info', message: `Sending analysis payload (task=${payload.task_type}, prices=${payload.prices.length} pts, futures=${payload.futures.length}, headlines=${payload.headlines.length}) to engine`, data: { via: opts.serviceUrl ? 'http' : 'python-cli' } });
  const raw = await callEngine(payload, opts);
  if (raw.ok !== true) throw new Error(`Engine reported failure: ${JSON.stringify(raw).slice(0, 500)}`);

  const insights: InsightItem[] = Array.isArray(raw.insights)
    ? (raw.insights as InsightItem[])
    : [];
  const result: AnalysisResult = {
    method: String(raw.method ?? 'unknown'),
    engineVersion: String(raw.engine_version ?? '0'),
    taskType: plan.taskType,
    summary: String(raw.summary ?? ''),
    confidence: (raw.confidence as AnalysisResult['confidence']) ?? 'low',
    confidenceReasons: (raw.confidence_reasons as string[]) ?? [],
    assumptions: (raw.assumptions as string[]) ?? [],
    limitations: (raw.limitations as string[]) ?? [],
    details: raw,
    insights
  };
  await audit({ step: 'analyze', level: 'info', message: `Engine returned method="${result.method}", confidence=${result.confidence}`, data: { summary: result.summary } });
  return result;
}
