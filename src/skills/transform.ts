// Skill 5 — Data Engineering and CSV Transformation.
// Turns raw CollectedItems into mining-ready Datasets: normalized snake_case columns,
// inferred types, ISO dates, deduplication, missing-value handling, provenance columns,
// quality notes, assumptions, and a data dictionary. Exports clean CSV text.

import { CollectedItem, ColumnDef, Dataset, AuditSink } from './types';
import { toCsv } from '@/lib/csv';

function snakeCase(name: string): string {
  return name.trim().toLowerCase()
    .replace(/\(([^)]*)\)/g, ' $1 ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'field';
}

function inferType(values: unknown[]): ColumnDef['type'] {
  const sample = values.filter((v) => v !== null && v !== undefined && v !== '').slice(0, 50);
  if (sample.length === 0) return 'string';
  if (sample.every((v) => typeof v === 'boolean')) return 'boolean';
  if (sample.every((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))))) return 'number';
  if (sample.every((v) => typeof v === 'string' && !isNaN(Date.parse(v)) && /\d{4}/.test(v))) return 'date';
  return 'string';
}

function normalizeValue(v: unknown, type: ColumnDef['type']): unknown {
  if (v === null || v === undefined || v === '' || v === '.') return null; // FRED uses '.' for missing
  if (type === 'number') { const n = Number(v); return isNaN(n) ? null : n; }
  if (type === 'date') { const d = new Date(String(v)); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
  return String(v);
}

function detectUnit(originalName: string): string | undefined {
  const n = originalName.toLowerCase();
  if (n.includes('dollars per barrel') || n.includes('$/bbl')) return 'USD/bbl';
  if (n.includes('million barrels')) return 'million bbl';
  if (n.includes('percent') || n.includes('%')) return 'percent';
  if (n.includes('index')) return 'index';
  return undefined;
}

export function transformItem(item: CollectedItem): Dataset {
  const qualityNotes: string[] = [...item.notes];
  const assumptions: string[] = [];
  if (item.records.length === 0) {
    return { name: item.name, description: `Empty dataset from ${item.sourceName}`, columns: [], rows: [], csv: '', qualityNotes: [...qualityNotes, 'No records collected.'], assumptions, sourceUrls: [item.sourceUrl], isMock: item.isMock };
  }

  const originalCols = Object.keys(item.records[0]);
  const columns: ColumnDef[] = originalCols.map((orig) => {
    const values = item.records.map((r) => r[orig]);
    const type = inferType(values);
    return { name: snakeCase(orig), originalName: orig, type, unit: detectUnit(orig), description: `From source field "${orig}" (${item.sourceName})` };
  });

  // Normalize values
  let rows = item.records.map((r) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) out[col.name] = normalizeValue(r[col.originalName], col.type);
    return out;
  });

  // Missing values: drop rows where all data fields are null; note partial nulls.
  const before = rows.length;
  rows = rows.filter((r) => Object.values(r).some((v) => v !== null));
  if (rows.length < before) { qualityNotes.push(`Dropped ${before - rows.length} fully-empty row(s).`); assumptions.push('Fully-empty rows carry no information and were removed.'); }
  const partialNulls = rows.filter((r) => Object.values(r).some((v) => v === null)).length;
  if (partialNulls > 0) qualityNotes.push(`${partialNulls} row(s) contain missing values (kept, left as empty cells; no imputation applied).`);

  // Deduplicate: time series by date key; everything else by exact row match
  // (date-keying non-timeseries data would wrongly drop distinct same-day records, e.g. headlines).
  const dateCol = item.kind === 'timeseries' ? columns.find((c) => c.type === 'date')?.name : undefined;
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const key = dateCol ? String(r[dateCol]) : JSON.stringify(r);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  if (deduped.length < rows.length) qualityNotes.push(`Removed ${rows.length - deduped.length} duplicate row(s)${dateCol ? ` keyed on "${dateCol}"` : ''}.`);
  rows = deduped;
  if (dateCol) rows.sort((a, b) => String(a[dateCol]).localeCompare(String(b[dateCol])));

  // Provenance columns appended to every dataset.
  const provenance: ColumnDef[] = [
    { name: 'source_name', originalName: '(added)', type: 'string', description: 'Name of the source this record was collected from' },
    { name: 'source_url', originalName: '(added)', type: 'string', description: 'URL of the source' },
    { name: 'collected_at', originalName: '(added)', type: 'string', description: 'UTC timestamp when this data was collected' },
    { name: 'is_mock', originalName: '(added)', type: 'boolean', description: 'true if this row is bundled mock/demo data rather than live collected data' }
  ];
  for (const r of rows) {
    r.source_name = item.sourceName; r.source_url = item.sourceUrl;
    r.collected_at = item.collectedAt; r.is_mock = item.isMock;
  }
  const allCols = [...columns, ...provenance];
  if (item.isMock) qualityNotes.unshift('MOCK DATASET — generated for demo; every row carries is_mock=true.');
  assumptions.push('Dates normalized to ISO-8601 (YYYY-MM-DD), numeric strings cast to numbers, column names normalized to snake_case.');

  return {
    name: item.name,
    description: `${item.kind} dataset from ${item.sourceName} (${rows.length} rows)`,
    columns: allCols, rows,
    csv: toCsv(rows, allCols.map((c) => c.name)),
    qualityNotes, assumptions, sourceUrls: [item.sourceUrl], isMock: item.isMock
  };
}

export async function buildDatasets(collected: CollectedItem[], audit: AuditSink): Promise<Dataset[]> {
  const datasets = collected.map(transformItem).filter((d) => d.rows.length > 0);
  await audit({
    step: 'transform', level: 'info',
    message: `Built ${datasets.length} mining-ready dataset(s): ${datasets.map((d) => `${d.name} (${d.rows.length}×${d.columns.length})`).join(', ')}`
  });
  return datasets;
}

export function datasetDictionary(d: Dataset) {
  return {
    dataset: d.name, description: d.description, row_count: d.rows.length, is_mock: d.isMock,
    source_urls: d.sourceUrls, quality_notes: d.qualityNotes, assumptions: d.assumptions,
    fields: d.columns.map((c) => ({ name: c.name, original_name: c.originalName, type: c.type, unit: c.unit ?? null, description: c.description }))
  };
}
