import { describe, expect, it } from 'vitest';
import { validateHistory } from '../server/downloads/validateHistory';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';

const VALID_JOB: DownloadJob = {
  id: '2973533c-346f-49cf-9c9e-378378d820f8',
  url: 'https://example.com/file',
  filename: 'file',
  status: DOWNLOAD_STATUS.completed,
  receivedBytes: 1,
  totalBytes: 1,
  bytesPerSecond: 0,
  createdAt: '2026-01-01T00:00:00Z',
  finishedAt: '2026-01-01T00:00:01Z',
  errorMessage: null,
};

/**
 * Groups behavior checks: persisted history validation.
 */
describe('persisted history validation', () => {
  /**
   * Verifies: restores valid records and an empty queue.
   */
  it('restores valid records and an empty queue', () => {
    expect(validateHistory([VALID_JOB])).toEqual([VALID_JOB]);
    expect(validateHistory([])).toEqual([]);
  });
  it.each([
    null,
    {},
    [{ ...VALID_JOB, id: '../escape' }],
    [{ ...VALID_JOB, status: 'invented' }],
    [{ ...VALID_JOB, receivedBytes: -1 }],
    [{ ...VALID_JOB, resumeValidator: 'W/"weak"' }],
    [{ ...VALID_JOB, resumeValidator: '"header\r\ninjection"' }],
    [{ ...VALID_JOB, resumeValidator: 1 }],
    [VALID_JOB, VALID_JOB],
  ])(
    'refuses corrupt or unsafe state' /**
     * Verifies: refuses corrupt or unsafe state.
     * @param {unknown} history - Persisted data under test.
     */,
    (history) => {
      expect(() => validateHistory(history)).toThrow('History is invalid');
    },
  );
});
