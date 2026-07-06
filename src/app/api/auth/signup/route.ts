import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSessionToken, hashPassword, sessionCookieName, sessionCookieOptions } from '@/lib/auth';

const Body = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email or password (min 8 chars).' }, { status: 400 });
  const { email, password, name } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: 'Email already registered.' }, { status: 409 });
  }
  const user = await prisma.user.create({ data: { email, name, passwordHash: await hashPassword(password) } });
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set(sessionCookieName(), createSessionToken(user.id), sessionCookieOptions());
  return res;
}
