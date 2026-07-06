import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function RunsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const runs = await prisma.researchRun.findMany({
    where: { project: { userId: user.id } },
    include: { question: true, reports: { where: { format: 'markdown' }, take: 1 } },
    orderBy: { startedAt: 'desc' }, take: 100
  });
  return (
    <>
      <h1>Run history</h1>
      <div className="card">
        <table>
          <thead><tr><th>Question</th><th>Status</th><th>Trigger</th><th>Started</th><th>Summary</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/runs/${r.id}`}>{r.question.text}</Link></td>
                <td><span className={`badge ${r.status === 'COMPLETED' ? 'ok' : r.status === 'FAILED' ? 'fail' : 'run'}`}>{r.status}</span>{r.mockMode && <span className="muted"> (mock)</span>}</td>
                <td>{r.triggeredBy}</td>
                <td className="muted">{r.startedAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                <td className="muted">{r.reports[0]?.summary ?? r.error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
