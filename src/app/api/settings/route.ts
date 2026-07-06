// Admin-safe configuration surface: view effective rate-limit/source rules and store
// API credentials encrypted (IntegrationSetting). Secrets are never returned in full.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { config } from '@/lib/config';
import { encryptSecret } from '@/lib/crypto';
import { requireUser } from '@/lib/apiAuth';

export async function GET() {
  const { user, error } = await requireUser();
  if (!user) return error;
  const integrations = await prisma.integrationSetting.findMany({ where: { userId: user.id }, select: { provider: true, createdAt: true } });
  return NextResponse.json({
    effectiveConfig: {
      mockMode: config.mockMode, searchProvider: config.searchProvider,
      rateLimitMs: config.rateLimitMs, httpTimeoutMs: config.httpTimeoutMs,
      maxSourcesPerRun: config.maxSourcesPerRun, domainBlocklist: config.domainBlocklist,
      userAgent: config.scraperUserAgent
    },
    integrations
  });
}

const Body = z.object({ provider: z.enum(['brave', 'eia', 'fred', 's3']), value: z.string().min(4) });

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (!user) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid provider or value' }, { status: 400 });
  await prisma.integrationSetting.upsert({
    where: { userId_provider: { userId: user.id, provider: parsed.data.provider } },
    update: { encryptedValue: encryptSecret(parsed.data.value) },
    create: { userId: user.id, provider: parsed.data.provider, encryptedValue: encryptSecret(parsed.data.value) }
  });
  return NextResponse.json({ ok: true });
}
