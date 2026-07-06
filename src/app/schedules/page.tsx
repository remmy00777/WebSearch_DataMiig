'use client';
// Skill 9 UI — recurring research monitoring.
import { useEffect, useState } from 'react';

type Job = { id: string; questionText: string; cron: string; enabled: boolean; lastRunAt: string | null };

export default function SchedulesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [questionText, setQuestionText] = useState('What would be the price of oil next week?');
  const [cron, setCron] = useState('0 7 * * 1');
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/schedules');
    if (res.ok) setJobs((await res.json()).jobs);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const res = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionText, cron }) });
    if (res.ok) load(); else setError((await res.json()).error ?? 'Failed');
  }
  async function toggle(job: Job) {
    await fetch('/api/schedules', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: job.id, enabled: !job.enabled }) });
    load();
  }

  return (
    <>
      <h1>Scheduled research monitoring</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>New schedule</h2>
        <p className="muted">Examples: “0 7 * * 1” = every Monday 07:00 (oil outlook), “0 6 * * *” = daily 06:00 (regulatory watch), “0 9 1 * *” = monthly (housing indicators). Requires the worker process (npm run worker / docker-compose).</p>
        <form onSubmit={create}>
          <input value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Research question" required />
          <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="Cron (5 fields)" required />
          {error && <p className="error">{error}</p>}
          <button type="submit">Create schedule</button>
        </form>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Your schedules</h2>
        <table>
          <thead><tr><th>Question</th><th>Cron</th><th>Status</th><th>Last run</th><th></th></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j.id}>
              <td>{j.questionText}</td><td><code>{j.cron}</code></td>
              <td><span className={`badge ${j.enabled ? 'ok' : 'fail'}`}>{j.enabled ? 'enabled' : 'paused'}</span></td>
              <td className="muted">{j.lastRunAt ? String(j.lastRunAt).slice(0, 16).replace('T', ' ') : 'never'}</td>
              <td><button className="secondary" onClick={() => toggle(j)}>{j.enabled ? 'Pause' : 'Resume'}</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
