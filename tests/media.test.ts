import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import { buildMediaArguments } from '../server/engines/mediaArguments';
import { applyMediaProgress } from '../server/engines/media';
import { prepareMediaCookies } from '../server/engines/cookies';
import { runEngineProcess } from '../server/engines/runProcess';

const directories: string[] = [];
const MAXIMUM_BYTES = 1_024;
const RECEIVED_BYTES = 512;
const SPEED_BYTES = 128;
const OPTION_TERMINATOR_POSITION = -2;
/** Baseline site job with no third-party network dependency. */
const VIDEO_JOB: DownloadJob = {
  id: 'job-id',
  url: 'https://youtube.com/watch?v=abc&title=$(anything)',
  filename: 'video',
  sourceType: SOURCE_TYPE.video,
  quality: '1080',
  status: DOWNLOAD_STATUS.downloading,
  receivedBytes: 0,
  totalBytes: null,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
};
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('media engine contract', () => {
  it('passes positive engine rate limits and omits the argument for unlimited media transfers', () => {
    for (const sourceType of [SOURCE_TYPE.video, SOURCE_TYPE.instagram]) {
      const job = { ...VIDEO_JOB, sourceType };
      const limited = buildMediaArguments(
        job,
        '/data/output',
        'http://127.0.0.1:1234',
        MAXIMUM_BYTES,
        undefined,
        SPEED_BYTES,
      );
      expect(limited[limited.indexOf('--limit-rate') + 1]).toBe(String(SPEED_BYTES));
      expect(buildMediaArguments(job, '/data/output', 'http://127.0.0.1:1234', MAXIMUM_BYTES)).not.toContain(
        '--limit-rate',
      );
    }
  });
  it('passes URLs after the terminator, enforces quality and uses the checked proxy', () => {
    const argumentsList = buildMediaArguments(VIDEO_JOB, '/data/output', 'http://127.0.0.1:1234', MAXIMUM_BYTES);
    expect(argumentsList.slice(-1)).toEqual([VIDEO_JOB.url]);
    expect(argumentsList.at(OPTION_TERMINATOR_POSITION)).toBe('--');
    expect(argumentsList).toContain('bv*[height<=1080]+ba/b[height<=1080]');
    expect(argumentsList).toContain('http://127.0.0.1:1234');
    expect(argumentsList).toContain('--no-playlist');
    expect(argumentsList).toContain('--no-remote-components');
  });
  it('uses the Instagram image/video collector with an exact output directory', () => {
    const job = { ...VIDEO_JOB, sourceType: SOURCE_TYPE.instagram };
    const argumentsList = buildMediaArguments(job, '/data/output', 'http://127.0.0.1:1234', MAXIMUM_BYTES);
    expect(argumentsList).toContain('--directory');
    expect(argumentsList).toContain('extractor.instagram.videos=merged');
    expect(argumentsList).toContain(':memory:');
  });
  it('parses structured progress and ignores unrelated output', () => {
    const job = { ...VIDEO_JOB };
    applyMediaProgress(
      job,
      `LINKDOCK:${JSON.stringify({
        downloaded_bytes: RECEIVED_BYTES,
        total_bytes: MAXIMUM_BYTES,
        speed: SPEED_BYTES,
        status: 'downloading',
      })}`,
    );
    expect(job.receivedBytes).toBe(RECEIVED_BYTES);
    expect(job.totalBytes).toBe(MAXIMUM_BYTES);
    expect(job.bytesPerSecond).toBe(SPEED_BYTES);
    applyMediaProgress(job, 'LINKDOCK:not-json');
    expect(job.receivedBytes).toBe(RECEIVED_BYTES);
  });
  it('copies login cookies outside public output with private permissions and removes the session copy', async () => {
    const directory = mkdtempSync(path.resolve('tests/.media-'));
    directories.push(directory);
    const source = path.join(directory, 'owner-cookies.txt');
    writeFileSync(source, '# Netscape HTTP Cookie File\n');
    const cookies = await prepareMediaCookies(directory, source);
    expect(cookies.filename).not.toContain('downloads');
    expect(readFileSync(cookies.filename ?? '', 'utf8')).toBe(readFileSync(source, 'utf8'));
    const ownerMode = 0o600;
    const permissionMask = 0o777;
    expect(statSync(cookies.filename ?? '').mode & permissionMask).toBe(ownerMode);
    await cookies.cleanup();
    expect(readFileSync(source, 'utf8')).toContain('Netscape');
  });
  it('runs a real child without a shell and cancels the worker after its ready signal', async () => {
    const controller = new AbortController();
    const onLine = vi.fn((line: string) => {
      if (line === 'READY') {
        controller.abort(new Error('Cancelled test worker'));
      }
    });
    const program = "process.stdout.write('READY\\n'); setInterval(() => {}, 1000);";
    await expect(runEngineProcess(process.execPath, ['-e', program], controller.signal, onLine)).rejects.toThrow(
      'Cancelled test worker',
    );
    expect(onLine).toHaveBeenCalledWith('READY');
  });
});
