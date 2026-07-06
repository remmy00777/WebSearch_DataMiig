export const config = {
  appSecret: process.env.APP_SECRET || 'dev-secret-do-not-use-in-production',
  mockMode: (process.env.MOCK_MODE ?? 'true') !== 'false',
  runJobsInline: (process.env.RUN_JOBS_INLINE ?? 'true') !== 'false',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  storageDir: process.env.STORAGE_DIR || './storage',
  storageDriver: process.env.STORAGE_DRIVER || 'local',
  analysisServiceUrl: process.env.ANALYSIS_SERVICE_URL || '',
  pythonBin: process.env.PYTHON_BIN || 'python3',
  searchProvider: process.env.SEARCH_PROVIDER || 'mock',
  braveApiKey: process.env.BRAVE_API_KEY || '',
  eiaApiKey: process.env.EIA_API_KEY || '',
  fredApiKey: process.env.FRED_API_KEY || '',
  scraperUserAgent:
    process.env.SCRAPER_USER_AGENT ||
    'ProspectResearchBot/0.1 (+https://example.com/bot; research contact: you@example.com)',
  rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || '3000', 10),
  httpTimeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS || '15000', 10),
  maxSourcesPerRun: parseInt(process.env.MAX_SOURCES_PER_RUN || '8', 10),
  domainBlocklist: (process.env.DOMAIN_BLOCKLIST || '')
    .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
};
