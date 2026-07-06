// GET /api/runs/[id]/report?format=html|markdown — fetch the generated report.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { storage } from '@/lib/storage';
import { requireUser } from '@/lib/apiAuth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (!user) return error;
  const format = req.nextUrl.searchParams.get('format') === 'markdown' ? 'markdown' : 'html';
  const report = await prisma.report.findFirst({ where: { runId: params.id, format, run: { project: { userId: user.id } } } });
  if (!report) return NextResponse.json({ error: 'Report not found (run may still be in progress).' }, { status: 404 });
  const content = await storage.read(report.path);
  return new NextResponse(content, { headers: { 'Content-Type': format === 'html' ? 'text/html' : 'text/markdown; charset=utf-8' } });
}
