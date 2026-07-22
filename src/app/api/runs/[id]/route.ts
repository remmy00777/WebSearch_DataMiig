// GET /api/runs/[id] — full run detail: status, plan, queries, sources+evaluations,
// datasets+files, insights, reports, audit trail (Skill 8 surface).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/apiAuth';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireUser();
  if (!user) return error;
  const run = await prisma.researchRun.findFirst({
    where: { id: params.id, project: { userId: user.id } },
    include: {
      question: true, plan: true, searchQueries: true,
      sources: { include: { evaluation: true }, orderBy: { tier: 'asc' } },
      rawData: true,
      datasets: { include: { files: true } },
      analysisRuns: true, insights: { orderBy: { importance: 'desc' } },
      reports: true,
      auditLogs: { orderBy: { createdAt: 'asc' } }
    }
  });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Dataset previews: first 10 rows parsed from stored CSVs.
  const { storage } = await import('@/lib/storage');
  const { parseCsv } = await import('@/lib/csv');
  const previews: Record<string, Record<string, string>[]> = {};
  for (const ds of run.datasets) {
    const csvFile = ds.files.find((f) => f.kind === 'PROCESSED_CSV');
    if (csvFile) {
      try { previews[ds.name] = parseCsv((await storage.read(csvFile.path)).toString()).slice(0, 10); }
      catch { previews[ds.name] = []; }
    }
  }
  return NextResponse.json({ run, previews });
}
