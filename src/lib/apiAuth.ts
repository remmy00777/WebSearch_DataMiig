import { NextResponse } from 'next/server';
import { getSessionUser } from './auth';

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { user, error: null };
}
