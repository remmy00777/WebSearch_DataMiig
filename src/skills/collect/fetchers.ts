// Compliant fetchers for live mode (MOCK_MODE=false).
// Supported: public APIs (JSON), CSV downloads, RSS feeds, static HTML tables (Cheerio).
// Deliberately NOT included: anything that bypasses paywalls, logins, CAPTCHAs,
// bot protections, or rate limits. If a request fails or is blocked, the source is skipped.
// Playwright rendering is optional and only for allowed public pages (see maybeRenderPage).

import * as cheerio from 'cheerio';
import { parseCsv } from '@/lib/csv';

export interface FetchOpts { userAgent: string; timeoutMs: number; retries?: number }

async function politeFetch(url: string, opts: FetchOpts, accept: string): Promise<Response> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': opts.userAgent, Accept: accept },
        signal: AbortSignal.timeout(opts.timeoutMs),
        redirect: 'follow'
      });
      // Respect server pushback: 401/403/429 mean "not permitted" — do NOT retry or evade.
      if (res.status === 401 || res.status === 403) throw new NoRetryError(`Access denied (${res.status}); source does not permit automated access — skipping.`);
      if (res.status === 429) throw new NoRetryError('Rate limited by server (429); backing off and skipping this source for this run.');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (err instanceof NoRetryError) throw err;
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export class NoRetryError extends Error {}

export async function fetchJson(url: string, opts: FetchOpts): Promise<{ data: unknown; raw: string }> {
  const res = await politeFetch(url, opts, 'application/json');
  const raw = await res.text();
  return { data: JSON.parse(raw), raw };
}

export async function fetchCsvDownload(url: string, opts: FetchOpts): Promise<{ records: Record<string, string>[]; raw: string }> {
  const res = await politeFetch(url, opts, 'text/csv,text/plain');
  const raw = await res.text();
  return { records: parseCsv(raw), raw };
}

export async function fetchRss(url: string, opts: FetchOpts): Promise<{ items: { title: string; link: string; pubDate: string; description: string }[]; raw: string }> {
  const res = await politeFetch(url, opts, 'application/rss+xml,application/xml,text/xml');
  const raw = await res.text();
  const items: { title: string; link: string; pubDate: string; description: string }[] = [];
  const itemBlocks = raw.match(/<item[\s\S]*?<\/item>/g) ?? [];
  const tag = (block: string, name: string) => {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return (m?.[1] ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').replace(/<[^>]+>/g, '').trim();
  };
  for (const block of itemBlocks.slice(0, 50)) {
    items.push({ title: tag(block, 'title'), link: tag(block, 'link'), pubDate: tag(block, 'pubDate'), description: tag(block, 'description') });
  }
  return { items, raw };
}

export async function fetchHtmlTables(url: string, opts: FetchOpts): Promise<{ tables: Record<string, string>[][]; raw: string }> {
  const res = await politeFetch(url, opts, 'text/html');
  const raw = await res.text();
  const $ = cheerio.load(raw);
  const tables: Record<string, string>[][] = [];
  $('table').each((_, tbl) => {
    const headers: string[] = [];
    $(tbl).find('tr').first().find('th,td').each((_, c) => { headers.push($(c).text().trim()); });
    if (headers.length === 0) return;
    const rows: Record<string, string>[] = [];
    $(tbl).find('tr').slice(1).each((_, tr) => {
      const cells: string[] = [];
      $(tr).find('td,th').each((_, c) => { cells.push($(c).text().trim()); });
      if (cells.length) rows.push(Object.fromEntries(headers.map((h, i) => [h || `col_${i}`, cells[i] ?? ''])));
    });
    if (rows.length) tables.push(rows);
  });
  return { tables, raw };
}

// Optional JS rendering for allowed public pages only. Playwright is NOT a default
// dependency; install it explicitly and set PLAYWRIGHT_ENABLED=true. It must never be
// pointed at pages behind logins, paywalls, or bot challenges — robots and evaluation
// gates run before this is ever called.
export async function maybeRenderPage(url: string, opts: FetchOpts): Promise<string | null> {
  if (process.env.PLAYWRIGHT_ENABLED !== 'true') return null;
  try {
    // Dynamic import so playwright stays an optional, explicitly-installed dependency.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = (await (Function('return import("playwright")')() as Promise<any>)) as {
      chromium: { launch(): Promise<{ newPage(o: { userAgent: string }): Promise<{ goto(u: string, o: object): Promise<unknown>; content(): Promise<string> }>; close(): Promise<void> }> };
    };
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ userAgent: opts.userAgent });
      await page.goto(url, { timeout: opts.timeoutMs, waitUntil: 'networkidle' });
      return await page.content();
    } finally { await browser.close(); }
  } catch { return null; }
}
