// Shared types for all agent skills. Skills are DB-free pure modules so they can run
// inside the app pipeline, the worker, or the standalone demo script.

export type TaskType = 'descriptive' | 'predictive' | 'comparative' | 'causal' | 'exploratory' | 'monitoring';

export interface Plan {
  question: string;
  topic: string;
  targetVariable: string;
  taskType: TaskType;
  timeHorizon: { label: string; days: number | null };
  geography: string | null;
  domain: string;
  dataNeeds: string[];
  sourceCategories: string[];
  searchQueries: string[];
  analysisApproach: string;
  expectedOutputs: string[];
  notes: string[];
}

export interface SearchResultItem {
  url: string;
  title: string;
  snippet: string;
  publishedHint?: string;
}

export interface DiscoveredSource {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  category: string;     // government_statistics | exchange | market_data_api | financial_news | official_org | academic | other
  tier: 1 | 2 | 3 | 4;
  discoveredVia: string; // the search query that surfaced it
  supportsStructuredData: boolean;
  isMock: boolean;
}

export interface SourceScores {
  authority: number;
  recency: number;
  relevance: number;
  dataAvailability: number;
  accessibility: number;
  licensing: number;
}

export interface EvaluatedSource extends DiscoveredSource {
  scores: SourceScores;
  totalScore: number;
  selected: boolean;
  reason: string;
}

export type CollectedKind = 'timeseries' | 'table' | 'headlines' | 'text';

export interface CollectedItem {
  name: string;
  kind: CollectedKind;
  sourceName: string;
  sourceUrl: string;
  method: string;       // api | csv_download | rss | html_table | mock | upload
  contentType: string;
  records: Record<string, unknown>[];
  text?: string;
  collectedAt: string;  // ISO
  isMock: boolean;
  notes: string[];
  rawSnapshot: string;  // raw payload for provenance archive
}

export interface ColumnDef {
  name: string;
  originalName: string;
  type: 'date' | 'number' | 'string' | 'boolean';
  description: string;
  unit?: string;
}

export interface Dataset {
  name: string;
  description: string;
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  csv: string;
  qualityNotes: string[];
  assumptions: string[];
  sourceUrls: string[];
  isMock: boolean;
}

export interface InsightItem {
  kind: 'finding' | 'risk' | 'recommendation' | 'signal';
  title: string;
  body: string;
  importance: number; // 1 (low) - 5 (critical)
}

export interface AnalysisResult {
  method: string;
  engineVersion: string;
  taskType: TaskType;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  confidenceReasons: string[];
  assumptions: string[];
  limitations: string[];
  details: Record<string, unknown>;
  insights: InsightItem[];
}

export interface AuditEvent {
  step: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
  at: string;
}

export type AuditSink = (e: Omit<AuditEvent, 'at'>) => void | Promise<void>;
