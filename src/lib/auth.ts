import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { config } from './config';

const COOKIE = 'prospect_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function sign(payload: string): string {
  return createHmac('sha256', config.appSecret).update(payload).digest('base64url');
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.uid !== 'string' || data.exp < Date.now()) return null;
    return data.uid;
  } catch { return null; }
}

export function sessionCookieName() { return COOKIE; }

export async function getSessionUser() {
  const uid = verifySessionToken(cookies().get(COOKIE)?.value);
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export function sessionCookieOptions() {
  return {
    httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: TTL_MS / 1000
  };
}
