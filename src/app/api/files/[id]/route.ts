// GET /api/files/[id] — authenticated download of a generated dataset file (CSV / dictionary).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { storage } from '@/lib/storage';
import { requireUser } from '@/lib/apiAuth';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireUser();
  if (!user) return error;
  const file = await prisma.datasetFile.findFirst({
    where: { id: params.id, dataset: { run: { project: { userId: user.id } } } }
  });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const content = await storage.read(file.path);
  const type = file.filename.endsWith('.csv') ? 'text/csv' : 'application/json';
  return new NextResponse(Uint8Array.from(content), {
    headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${file.filename}"` }
  });
}
