// robots.txt compliance check. Conservative policy:
// - robots.txt missing (404) => allowed (standard interpretation)
// - fetch error / 5xx / timeout => treat as DISALLOWED (fail closed)
// - Rules for our specific user agent take precedence over "*".

interface RobotsRules { disallow: string[]; allow: string[] }

function parseRobots(text: string, ourAgent: string): RobotsRules {
  const groups: { agents: string[]; disallow: string[]; allow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], disallow: [], allow: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!current) continue;
      if (key === 'disallow') current.disallow.push(value);
      if (key === 'allow') current.allow.push(value);
    }
  }
  const botName = ourAgent.split('/')[0].toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && botName.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const g = specific ?? wildcard;
  return { disallow: g?.disallow ?? [], allow: g?.allow ?? [] };
}

function pathMatches(rule: string, path: string): boolean {
  if (rule === '') return false;
  const pattern = rule.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${pattern}`).test(path);
}

export async function isAllowedByRobots(url: string, userAgent: string, timeoutMs: number): Promise<{ allowed: boolean; reason: string }> {
  let target: URL;
  try { target = new URL(url); } catch { return { allowed: false, reason: 'Invalid URL' }; }
  const robotsUrl = `${target.origin}/robots.txt`;
  let res: Response;
  try {
    res = await fetch(robotsUrl, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { allowed: false, reason: `Could not fetch ${robotsUrl}; failing closed (treated as disallowed).` };
  }
  if (res.status === 404 || res.status === 410) return { allowed: true, reason: 'No robots.txt (404); crawling permitted by convention.' };
  if (!res.ok) return { allowed: false, reason: `robots.txt returned ${res.status}; failing closed.` };
  const rules = parseRobots(await res.text(), userAgent);
  const path = target.pathname + target.search;
  const allowHit = rules.allow.some((r) => pathMatches(r, path));
  const disallowHit = rules.disallow.some((r) => pathMatches(r, path));
  if (disallowHit && !allowHit) return { allowed: false, reason: `robots.txt disallows this path for our user agent; skipping source.` };
  return { allowed: true, reason: 'robots.txt permits access for our user agent.' };
}
