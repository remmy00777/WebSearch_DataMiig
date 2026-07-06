import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/apiAuth';

export async function GET() {
  const { user, error } = await requireUser();
  if (!user) return error;
  const notifications = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ notifications });
}
