// POST /api/runs/[id]/steps/[step] — debug/manual endpoints to exercise individual skills.
// step = plan | search | evaluate — returns the skill output without mutating the run.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { config } from '@/lib/config';
import { requireUser } from '@/lib/apiAuth';
import { buildPlan } from '@/skills/planner';
import { getSearchProvider, runIntelligentSearch } from '@/skills/search';
import { evaluateSources } from '@/skills/evaluate';

export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ id: string; step: string }> }
) {
  const params = await props.params;
  const { user, error } = await requireUser();
  if (!user) return error;
  const run = await prisma.researchRun.findFirst({ where: { id: params.id, project: { userId: user.id } }, include: { question: true } });
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const plan = buildPlan(run.question.text);
  if (params.step === 'plan') return NextResponse.json({ plan });

  const noopAudit = async () => {};
  const provider = getSearchProvider({ provider: config.mockMode ? 'mock' : config.searchProvider, braveApiKey: config.braveApiKey });
  const search = await runIntelligentSearch(plan, provider, noopAudit);
  if (params.step === 'search') return NextResponse.json(search);

  if (params.step === 'evaluate') {
    const evaluated = evaluateSources(search.sources, plan, { maxSelected: config.maxSourcesPerRun, domainBlocklist: config.domainBlocklist });
    return NextResponse.json({ evaluated });
  }
  return NextResponse.json({ error: `Unknown step "${params.step}". Use plan | search | evaluate. Full runs use POST /api/questions.` }, { status: 400 });
}
