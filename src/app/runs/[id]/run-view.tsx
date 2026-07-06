'use client';
// Live run view: status, plan, source discovery + evaluation, dataset previews,
// insights, report links, downloads, and the audit trail. Polls while in progress.
import { useEffect, useState } from 'react';

type Any = Record<string, any>;
const ACTIVE = ['QUEUED', 'PLANNING', 'SEARCHING', 'EVALUATING', 'COLLECTING', 'TRANSFORMING', 'ANALYZING', 'REPORTING'];
const STEPS = ['PLANNING', 'SEARCHING', 'EVALUATING', 'COLLECTING', 'TRANSFORMING', 'ANALYZING', 'REPORTING', 'COMPLETED'];

export default function RunView({ id }: { id: string }) {
  const [data, setData] = useState<{ run: Any; previews: Record<string, Any[]> } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function load() {
      try {
        const res = await fetch(`/api/runs/${id}`);
        if (!res.ok) { setErr(`Failed to load run (${res.status})`); return; }
        const json = await res.json();
        if (stopped) return;
        setData(json);
        if (ACTIVE.includes(json.run.status)) timer = setTimeout(load, 2500);
      } catch { if (!stopped) timer = setTimeout(load, 4000); }
    }
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id]);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading run…</p>;
  const { run, previews } = data;
  const selected = run.sources?.filter((s: Any) => s.evaluation?.selected) ?? [];
  const rejected = run.sources?.filter((s: Any) => s.evaluation && !s.evaluation.selected) ?? [];

  return (
    <>
      {run.mockMode && <div className="mock-banner">MOCK MODE run — all data below is bundled demo data (is_mock=true), not live market data.</div>}
      <h1>{run.question.text}</h1>
      <div className="card">
        <strong>Status: </strong>
        {STEPS.map((s) => {
          const reached = STEPS.indexOf(s) <= STEPS.indexOf(run.status === 'FAILED' ? 'REPORTING' : run.status);
          const current = s === run.status;
          return <span key={s} className={`badge ${current ? 'run' : reached ? 'ok' : ''}`} style={{ marginRight: 6, opacity: reached || current ? 1 : 0.4 }}>{s}</span>;
        })}
        {run.status === 'FAILED' && <p className="error">Run failed: {run.error}</p>}
        {run.status === 'COMPLETED' && (
          <p>
            <a href={`/api/runs/${run.id}/report?format=html`} target="_blank">Open report (HTML)</a>{' · '}
            <a href={`/api/runs/${run.id}/report?format=markdown`} target="_blank">Markdown</a>
          </p>
        )}
      </div>

      {run.plan && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Research plan</h2>
          <table><tbody>
            <tr><th>Target variable</th><td>{run.plan.targetVariable}</td></tr>
            <tr><th>Task type</th><td>{run.plan.taskType}</td></tr>
            <tr><th>Time horizon</th><td>{run.plan.timeHorizon}</td></tr>
            <tr><th>Domain</th><td>{run.plan.domain}</td></tr>
            <tr><th>Analysis approach</th><td>{run.plan.analysisApproach}</td></tr>
            <tr><th>Data needs</th><td>{(run.plan.dataNeeds as string[]).join('; ')}</td></tr>
            <tr><th>Search queries</th><td>{(run.plan.searchQueries as string[]).join(' | ')}</td></tr>
          </tbody></table>
        </div>
      )}

      {run.sources?.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Source discovery &amp; evaluation</h2>
          <h3>Selected ({selected.length})</h3>
          <table>
            <thead><tr><th>Source</th><th>Tier</th><th>Score</th><th>Reason</th></tr></thead>
            <tbody>{selected.map((s: Any) => (
              <tr key={s.id}><td><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></td>
                <td><span className={`badge tier${s.tier}`}>Tier {s.tier}</span></td>
                <td>{s.evaluation.totalScore}</td><td className="muted">{s.evaluation.reason}</td></tr>
            ))}</tbody>
          </table>
          <h3>Rejected ({rejected.length})</h3>
          <table>
            <thead><tr><th>Source</th><th>Tier</th><th>Score</th><th>Reason</th></tr></thead>
            <tbody>{rejected.map((s: Any) => (
              <tr key={s.id}><td><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></td>
                <td><span className={`badge tier${s.tier}`}>Tier {s.tier}</span></td>
                <td>{s.evaluation.totalScore}</td><td className="muted">{s.evaluation.reason}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {run.datasets?.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Datasets</h2>
          {run.datasets.map((ds: Any) => (
            <div key={ds.id} style={{ marginBottom: '1.2rem' }}>
              <h3>{ds.name} <span className="muted">({ds.rowCount} rows × {ds.columnCount} cols)</span></h3>
              <p className="muted">{ds.description} — Quality: {(ds.qualityNotes as string[]).join(' ')}</p>
              <p>{ds.files.map((f: Any) => <a key={f.id} href={`/api/files/${f.id}`} style={{ marginRight: 12 }}>⬇ {f.filename}</a>)}</p>
              {previews[ds.name]?.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr>{Object.keys(previews[ds.name][0]).map((c) => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{previews[ds.name].map((row, i) => (
                      <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
                    ))}</tbody>
                  </table>
                  <p className="muted">First 10 rows shown.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {run.insights?.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Insights</h2>
          {run.insights.map((i: Any) => (
            <p key={i.id}><span className="badge run">{i.kind}</span> <strong>{i.title}</strong> — {i.body}</p>
          ))}
        </div>
      )}

      {run.auditLogs?.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Audit trail</h2>
          <table>
            <thead><tr><th>Time</th><th>Step</th><th>Level</th><th>Message</th></tr></thead>
            <tbody>{run.auditLogs.map((l: Any) => (
              <tr key={l.id}><td className="muted">{String(l.createdAt).slice(11, 19)}</td><td>{l.step}</td>
                <td><span className={`badge ${l.level === 'error' ? 'fail' : l.level === 'warn' ? 'tier3' : 'ok'}`}>{l.level}</span></td>
                <td>{l.message}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
