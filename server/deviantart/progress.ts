import { createHash } from 'node:crypto';
import type { DownloadJob } from '../../shared/contracts.js';
import { MEDIA_FAILURE } from '../../shared/mediaFailures.js';
import { EngineProcessError } from '../engines/failures.js';
import { ENGINE_LIMIT } from '../engines/constants.js';
/**
 * Bounds upstream's infinite 429/CloudFront loops and silent stalls without retaining private diagnostic text.
 * @param {DownloadJob} job - Visible, application-authored progress only.
 * @param {AbortController} controller - Worker failure cancellation; the engine kills its process group.
 * @param {number} initialBytes - Existing staging bytes before this run.
 * @returns {object} Private diagnostic handler and a byte-progress watchdog.
 */
export function createDeviantartProgress(job: DownloadJob, controller: AbortController, initialBytes: number) {
  let previousBytes = initialBytes;
  let lastProgress = Date.now();
  const visited = new Set<string>();
  return {
    /**
     * Treats each completed/skipped file as progress during resume without accepting repeated log spam as activity.
     * @param {string} line - Private gallery-dl stdout.
     * @param {string} directory - Isolated worker output root.
     */
    output(line: string, directory: string): void {
      const filename = line.startsWith('# ') ? line.slice('# '.length) : line;
      if (!filename.startsWith(`${directory}/`)) {
        return;
      }
      const key = createHash('sha256').update(filename).digest('hex');
      if (!visited.has(key) && visited.size < ENGINE_LIMIT.maximumFiles) {
        visited.add(key);
        lastProgress = Date.now();
        job.stage = 'Collecting DeviantArt gallery & stories';
      }
    },
    /**
     * Handles fixed upstream hints without putting raw URLs, tokens, paths or prose in history.
     * @param {string} diagnostic - One private engine stderr line.
     */
    diagnostic(diagnostic: string): void {
      const message = diagnostic.replace(/https?:\/\/\S+/giu, '[source]');
      if (/API responded with 429|HTTP(?: Error)?[: ]+429|Too Many Requests/iu.test(message)) {
        controller.abort(new EngineProcessError(MEDIA_FAILURE.rate));
      } else if (/CloudFront block|\b(?:captcha|turnstile)\b/iu.test(message)) {
        controller.abort(new EngineProcessError(MEDIA_FAILURE.verification));
      } else if (/AuthenticationError|\binvalid_(?:grant|client)\b/iu.test(message)) {
        controller.abort(
          new EngineProcessError(
            MEDIA_FAILURE.login,
            'DeviantArt account access expired or was rejected. Reconnect in Settings, then restart this download.',
          ),
        );
      } else if (/Refreshing private access token/iu.test(message)) {
        job.stage = 'Authorizing DeviantArt account';
      } else if (/Requesting download URL/iu.test(message)) {
        job.stage = 'Requesting DeviantArt media';
      }
    },
    /**
     * Uses actual disk progress so repeated logs cannot keep a stalled worker alive indefinitely.
     * @param {number} bytes - Current staging bytes, including a growing partial file.
     */
    sample(bytes: number): void {
      if (bytes !== previousBytes) {
        lastProgress = Date.now();
        previousBytes = bytes;
        job.stage = 'Collecting DeviantArt gallery & stories';
      } else if (Date.now() - lastProgress >= ENGINE_LIMIT.deviantartStallMilliseconds) {
        controller.abort(
          new EngineProcessError(
            MEDIA_FAILURE.network,
            'DeviantArt made no file progress for 3 minutes. Check source access, reconnect in Settings, then restart.',
          ),
        );
      }
    },
  };
}
