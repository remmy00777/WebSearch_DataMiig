// Background worker (BullMQ) + Skill 9 — Scheduled Research Monitoring.
// - Processes queued research runs.
// - Every minute, checks enabled ScheduledJobs (cron expressions) and enqueues runs when due.
// Run with: npm run worker  (requires Redis; docker-compose starts it automatically)

import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@/lib/db';
import { config } from '@/lib/config';
import { runPipeline } from '@/pipeline/runPipeline';
import { RESEARCH_QUEUE } from '@/pipeline/queue';

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

// --- Minimal 5-field cron matcher (min hour dom mon dow), supports *, lists, steps, ranges ---
function fieldMatches(expr: string, value: number): boolean {
  return expr.split(',').some((part) => {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    let lo = 0, hi = 59;
    if (rangePart === '*') { /* full range */ }
    else if (rangePart.includes('-')) { const [a, b] = rangePart.split('-').map(Number); lo = a; hi = b; }
    else { lo = hi = parseInt(rangePart, 10); }
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

export function cronMatches(cron: string, date: Date): boolean {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  if (!dow) return false;
  return fieldMatches(min, date.getMinutes()) && fieldMatches(hour, date.getHours()) &&
    fieldMatches(dom, date.getDate()) && fieldMatches(mon, date.getMonth() + 1) &&
    fieldMatches(dow, date.getDay());
}

async function tickScheduler(queue: Queue) {
  const now = new Date();
  const jobs = await prisma.scheduledJob.findMany({ where: { enabled: true } });
  for (const job of jobs) {
    try {
      if (!cronMatches(job.cron, now)) continue;
      // Guard: don't double-fire within the same minute.
      if (job.lastRunAt && now.getTime() - job.lastRunAt.getTime() < 60_000) continue;
      const project = job.projectId
        ? await prisma.researchProject.findUnique({ where: { id: job.projectId } })
        : await prisma.researchProject.create({ data: { userId: job.userId, title: job.questionText.slice(0, 80) } });
      if (!project) continue;
      const question = await prisma.researchQuestion.create({ data: { projectId: project.id, text: job.questionText } });
      const run = await prisma.researchRun.create({
        data: { projectId: project.id, questionId: question.id, triggeredBy: 'SCHEDULE', scheduledJobId: job.id }
      });
      await queue.add('run', { runId: run.id }, { removeOnComplete: 100, removeOnFail: 500 });
      await prisma.scheduledJob.update({ where: { id: job.id }, data: { lastRunAt: now } });
      console.log(`[scheduler] enqueued run ${run.id} for job ${job.id} ("${job.questionText}")`);
    } catch (e) {
      console.error(`[scheduler] job ${job.id} failed to enqueue:`, e);
    }
  }
}

async function main() {
  const queue = new Queue(RESEARCH_QUEUE, { connection });
  const worker = new Worker(
    RESEARCH_QUEUE,
    async (job) => { await runPipeline(job.data.runId as string); },
    { connection, concurrency: 2 }
  );
  worker.on('completed', (job) => console.log(`[worker] run ${job.data.runId} completed`));
  worker.on('failed', (job, err) => console.error(`[worker] run ${job?.data?.runId} failed:`, err.message));
  setInterval(() => tickScheduler(queue).catch(console.error), 60_000);
  console.log('[worker] Prospect worker started: processing research runs + scheduler tick every 60s');
}

main().catch((e) => { console.error(e); process.exit(1); });
