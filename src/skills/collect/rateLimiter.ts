// Polite per-domain rate limiting: at most one request per RATE_LIMIT_MS per domain.

const lastRequestByDomain = new Map<string, number>();

export async function politeDelay(url: string, minIntervalMs: number): Promise<void> {
  let domain = 'unknown';
  try { domain = new URL(url).hostname; } catch { /* noop */ }
  const last = lastRequestByDomain.get(domain) ?? 0;
  const wait = Math.max(0, last + minIntervalMs - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestByDomain.set(domain, Date.now());
}
