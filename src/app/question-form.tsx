'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function QuestionForm() {
  const router = useRouter();
  const [text, setText] = useState('What would be the price of oil next week?');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const json = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/runs/${json.runId}`);
    else setError(json.error ?? 'Failed to create run');
  }

  return (
    <form onSubmit={submit}>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} required minLength={8} />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start research run'}</button>
    </form>
  );
}
