// Skill 9 API — scheduled research monitoring jobs.
// POST { questionText, cron } / GET list / PATCH { id, enabled } toggle.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/apiAuth';

const CRON_RE = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/;
const Body = z.object({ questionText: z.string().min(8).max(500), cron: z.string().regex(CRON_RE, 'Cron must have 5 fields, e.g. "0 7 * * 1"') });

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (!user) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid' }, { status: 400 });
  const job = await prisma.scheduledJob.create({ data: { userId: user.id, ...parsed.data } });
  return NextResponse.json({ ok: true, job });
}

export async function GET() {
  const { user, error } = await requireUser();
  if (!user) return error;
  return NextResponse.json({ jobs: await prisma.scheduledJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }) });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (!user) return error;
  const body = await req.json().catch(() => null) as { id?: string; enabled?: boolean } | null;
  if (!body?.id || typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Need { id, enabled }' }, { status: 400 });
  const job = await prisma.scheduledJob.findFirst({ where: { id: body.id, userId: user.id } });
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.scheduledJob.update({ where: { id: job.id }, data: { enabled: body.enabled } });
  return NextResponse.json({ ok: true });
}
