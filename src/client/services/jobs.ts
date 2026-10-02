import type { AssetJob, JobResult } from '../../shared/sprite/jobs';

/**
 * Startet Asset-Jobs im Web-Worker (Fallback: Hauptthread).
 */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: JobResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/assetWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: JobResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result!);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Worker-Fehler'));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export async function runAssetJob(job: AssetJob): Promise<JobResult> {
  const w = getWorker();
  if (!w) {
    const { runJob } = await import('../../shared/sprite/jobs');
    return runJob(job);
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, job });
  });
}
