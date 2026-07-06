'use client';
// Settings: effective compliance/rate-limit config (env-driven, read-only here)
// + encrypted API credential storage for live providers.
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [provider, setProvider] = useState('eia');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const res = await fetch('/api/settings');
    if (res.ok) setData(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, value }) });
    setMsg(res.ok ? 'Saved (encrypted at rest).' : (await res.json()).error ?? 'Failed');
    setValue(''); load();
  }

  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Effective collection & compliance configuration</h2>
        <p className="muted">Values are set via environment variables (admin-controlled), enforced in code by the collection skill.</p>
        {data && (
          <table><tbody>
            <tr><th>Mock mode</th><td>{String(data.effectiveConfig.mockMode)}</td></tr>
            <tr><th>Search provider</th><td>{data.effectiveConfig.searchProvider}</td></tr>
            <tr><th>Per-domain rate limit</th><td>{data.effectiveConfig.rateLimitMs} ms between requests</td></tr>
            <tr><th>HTTP timeout</th><td>{data.effectiveConfig.httpTimeoutMs} ms</td></tr>
            <tr><th>Max sources per run</th><td>{data.effectiveConfig.maxSourcesPerRun}</td></tr>
            <tr><th>Domain blocklist</th><td>{data.effectiveConfig.domainBlocklist.join(', ') || '(empty)'}</td></tr>
            <tr><th>Declared user agent</th><td><code>{data.effectiveConfig.userAgent}</code></td></tr>
          </tbody></table>
        )}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>API credentials</h2>
        <p className="muted">Stored encrypted (AES-256-GCM). Configured: {data?.integrations?.map((i: any) => i.provider).join(', ') || 'none'}</p>
        <form onSubmit={save}>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="eia">EIA API key</option>
            <option value="fred">FRED API key</option>
            <option value="brave">Brave Search API key</option>
            <option value="s3">S3 credentials</option>
          </select>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Secret value" required />
          {msg && <p className="muted">{msg}</p>}
          <button type="submit">Save credential</button>
        </form>
      </div>
    </>
  );
}
