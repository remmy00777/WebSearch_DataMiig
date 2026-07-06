// Job dispatch: BullMQ (Redis) in production, inline execution for local dev (RUN_JOBS_INLINE=true).

import { config } from '@/lib/config';
import { runPipeline } from './runPipeline';

export const RESEARCH_QUEUE = 'research-runs';

export async function enqueueRun(runId: string): Promise<void> {
  if (config.runJobsInline) {
    // Fire-and-forget in-process; failure state is recorded on the run itself.
    setImmediate(() => runPipeline(runId).catch((e) => console.error(`[inline-run:${runId}]`, e)));
    return;
  }
  const { Queue } = await import('bullmq');
  const { default: IORedis } = await import('ioredis');
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(RESEARCH_QUEUE, { connection });
  await queue.add('run', { runId }, { removeOnComplete: 100, removeOnFail: 500 });
  await queue.close();
  connection.disconnect();
}
