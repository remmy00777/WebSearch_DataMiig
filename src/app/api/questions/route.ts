// POST /api/questions — create a research question and kick off a full research run.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/apiAuth';
import { enqueueRun } from '@/pipeline/queue';

const Body = z.object({ text: z.string().min(8).max(500), projectId: z.string().optional() });

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (!user) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Question must be 8–500 characters.' }, { status: 400 });

  let projectId = parsed.data.projectId;
  if (projectId) {
    const project = await prisma.researchProject.findFirst({ where: { id: projectId, userId: user.id } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  } else {
    projectId = (await prisma.researchProject.create({ data: { userId: user.id, title: parsed.data.text.slice(0, 80) } })).id;
  }
  const question = await prisma.researchQuestion.create({ data: { projectId, text: parsed.data.text } });
  const run = await prisma.researchRun.create({ data: { projectId, questionId: question.id } });
  await prisma.auditLog.create({ data: { runId: run.id, userId: user.id, step: 'create', message: `Question submitted: "${parsed.data.text}"` } });
  await enqueueRun(run.id);
  return NextResponse.json({ ok: true, runId: run.id, questionId: question.id, projectId });
}
