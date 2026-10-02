/// <reference lib="webworker" />
import { runJob, type AssetJob } from '../../shared/sprite/jobs';

/**
 * Web-Worker: führt Asset-Generierungen im Hintergrund aus, damit die
 * Oberfläche bei großen Sprite-Sheets (z.B. 64×64, 13 Animationen,
 * 4 Richtungen) flüssig bleibt.
 */
self.onmessage = (e: MessageEvent<{ id: number; job: AssetJob }>) => {
  const { id, job } = e.data;
  try {
    const result = runJob(job);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
