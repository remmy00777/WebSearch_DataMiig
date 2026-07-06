import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { config } from '@/lib/config';
import { redirect } from 'next/navigation';
import QuestionForm from './question-form';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [runs, notifications] = await Promise.all([
    prisma.researchRun.findMany({ where: { project: { userId: user.id } }, include: { question: true }, orderBy: { startedAt: 'desc' }, take: 8 }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 })
  ]);

  return (
    <>
      {config.mockMode && <div className="mock-banner">MOCK MODE — searches and data collection use bundled demo data (clearly labeled). Set MOCK_MODE=false with real API keys for live research.</div>}
      <h1>Welcome{user.name ? `, ${user.name}` : ''}</h1>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ask a research question</h2>
        <p className="muted">e.g. “What would be the price of oil next week?” — Prospect plans the research, finds and vets public sources, builds clean CSV datasets, runs the right analysis, and writes a stakeholder-ready report.</p>
        <QuestionForm />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent runs</h2>
        {runs.length === 0 && <p className="muted">No runs yet. Ask your first question above.</p>}
        <table>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/runs/${r.id}`}>{r.question.text}</Link></td>
                <td><span className={`badge ${r.status === 'COMPLETED' ? 'ok' : r.status === 'FAILED' ? 'fail' : 'run'}`}>{r.status}</span></td>
                <td className="muted">{r.startedAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Notifications</h2>
        {notifications.length === 0 ? <p className="muted">None yet.</p> : notifications.map((n) => (
          <p key={n.id} style={{ margin: '0.3rem 0' }}><strong>{n.title}</strong> — <span className="muted">{n.body}</span></p>
        ))}
      </div>
    </>
  );
}
