import { describe, expect, it } from 'vitest';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { formatBytes, getProgressPercent, matchesFilter } from '../src/features/downloads/utils/formatDownload';

/** Representative public contract used by presentation tests. */
export const TEST_JOB: DownloadJob = {
  id: 'test-id',
  url: 'https://example.com/archive.zip',
  filename: 'archive.zip',
  status: DOWNLOAD_STATUS.downloading,
  receivedBytes: 50,
  totalBytes: 100,
  bytesPerSecond: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  errorMessage: null,
};

/**
 * Groups behavior checks: download presentation.
 */
describe('download presentation', () => {
  /**
   * Verifies: distinguishes zero, unknown and binary storage units.
   */
  it('distinguishes zero, unknown and binary storage units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(null)).toBe('Unknown size');
    const kibibyte = 1_024;
    expect(formatBytes(kibibyte)).toBe('1.0 KiB');
  });
  /**
   * Verifies: uses indeterminate progress for unknown size and clamps known progress.
   */
  it('uses indeterminate progress for unknown size and clamps known progress', () => {
    const halfway = 50;
    const completed = 100;
    const oversizedProgress = 200;
    expect(getProgressPercent(TEST_JOB)).toBe(halfway);
    expect(getProgressPercent({ ...TEST_JOB, totalBytes: null })).toBeUndefined();
    expect(getProgressPercent({ ...TEST_JOB, receivedBytes: oversizedProgress })).toBe(completed);
  });
  /**
   * Verifies: groups queued and downloading jobs together and cancelled jobs under attention.
   */
  it('groups queued and downloading jobs together and cancelled jobs under attention', () => {
    expect(matchesFilter(TEST_JOB, 'active')).toBe(true);
    expect(matchesFilter(TEST_JOB, 'completed')).toBe(false);
    expect(matchesFilter({ ...TEST_JOB, status: DOWNLOAD_STATUS.cancelled }, 'failed')).toBe(true);
  });
});
