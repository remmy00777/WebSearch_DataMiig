// GET /api/runs — run history for the signed-in user.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/apiAuth';

export async function GET() {
  const { user, error } = await requireUser();
  if (!user) return error;
  const runs = await prisma.researchRun.findMany({
    where: { project: { userId: user.id } },
    include: { question: true, reports: { take: 1, where: { format: 'markdown' } } },
    orderBy: { startedAt: 'desc' }, take: 100
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id, status: r.status, question: r.question.text, triggeredBy: r.triggeredBy,
      startedAt: r.startedAt, finishedAt: r.finishedAt, error: r.error, mockMode: r.mockMode,
      summary: r.reports[0]?.summary ?? null
    }))
  });
}
