import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveUtility } from '../server/utilities/resolve';
import { PassThrough, Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../server/downloads/queue';
import { openSource } from '../server/downloads/openSource';
import { TorrentRpc } from '../server/engines/torrent/rpc';
import { ENGINE_LIMIT } from '../server/engines/constants';
import { UtilityStore } from '../server/utilities/storage';
import { createUtilityRelease } from './helpers/utilityFixture';
import type { ServerConfig } from '../server/config';

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const directories: string[] = [];
const queues: DownloadQueue[] = [];
const engines: TorrentRpc[] = [];
const PORT = 8_080;
const BYTE_LIMIT = 1_024;
const CLOSE_DELAY = 50;
const PROBE_TIMEOUT = 1_000;
const RELEASE = '05d38859-b5ef-4ef3-92cc-8459544746df';
/** Creates private queue/engine storage. @returns {string} Isolated data root. */
function directory(): string {
  const value = mkdtempSync(path.resolve('tests/.utility-queue-'));
  directories.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(queues.splice(0).map((queue) => queue.stop()));
  await Promise.all(engines.splice(0).map((engine) => engine.stopAndWait()));
  directories.splice(0).forEach((value) => rmSync(value, { recursive: true, force: true }));
  vi.restoreAllMocks();
});
it('waits for workers, holds new submissions during maintenance and resumes queue scheduling afterward', async () => {
  const dataDirectory = directory();
  const config: ServerConfig = {
    dataDirectory,
    port: PORT,
    concurrency: 1,
    maximumFileBytes: BYTE_LIMIT,
    accessToken: 'test-utility-queue-password-more-than-thirty-two',
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const source = Object.assign(new PassThrough(), { headers: {} }) as unknown as IncomingMessage;
  vi.mocked(openSource)
    .mockResolvedValueOnce(source)
    .mockResolvedValueOnce(Object.assign(Readable.from(['done']), { headers: {} }) as unknown as IncomingMessage);
  const queue = new DownloadQueue(config);
  queues.push(queue);
  const first = queue.add('https://example.com/first');
  await vi.waitFor(() => expect(openSource).toHaveBeenCalledTimes(1));
  const work = vi.fn().mockResolvedValue(undefined);
  expect(await queue.maintainUtilities(work)).toBe(false);
  expect(work).not.toHaveBeenCalled();
  await queue.pause(first);
  let release: (() => void) | undefined;
  let entered = false;
  const maintenance = queue.maintainUtilities(async () => {
    entered = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await vi.waitFor(() => expect(entered).toBe(true));
  const second = queue.add('https://example.com/second');
  expect(second.status).toBe('queued');
  expect(queue.snapshot().policy?.holdReason).toContain('Updating download utilities');
  expect(openSource).toHaveBeenCalledTimes(1);
  release?.();
  expect(await maintenance).toBe(true);
  await vi.waitFor(() => expect(second.status).toBe('completed'));
  expect(first.status).toBe('paused');
});
it('reaps a real old daemon before a replacement binds the private RPC port', async () => {
  const data = directory();
  const store = new UtilityStore(data, false);
  const release = createUtilityRelease(data, RELEASE, 'fixture');
  store.save({ ...store.state, current: RELEASE, versions: release.versions });
  const filename = path.join(store.directory, 'releases', RELEASE, 'native/usr/bin/aria2c');
  const program = [
    '#!/usr/bin/env node',
    "import { createServer } from 'node:http';",
    "if(process.argv.includes('--version')){process.stdout.write('fixture');process.exit(0);}",
    'const server=createServer((_request,response)=>{',
    "response.setHeader('Content-Type','application/json');",
    "response.end(JSON.stringify({result:{version:'fixture'}}));",
    `}).listen(${ENGINE_LIMIT.rpcPort},'127.0.0.1');`,
    `process.on('SIGTERM',()=>setTimeout(()=>server.close(()=>process.exit(0)),${CLOSE_DELAY}));`,
  ].join('\n');
  writeFileSync(filename, `${program}\n`, { mode: 0o700 });
  const execution = resolveUtility('torrent', data);
  expect(execution.command).toBe(filename);
  const probe = spawnSync(filename, ['--version'], {
    encoding: 'utf8',
    env: execution.environment,
    timeout: PROBE_TIMEOUT,
  });
  expect(probe.error?.message ?? probe.stderr).toBe('');
  expect(probe.status).toBe(0);
  const engine = new TorrentRpc(data);
  engines.push(engine);
  await engine.start();
  await engine.stopAndWait();
  await engine.start();
  expect(await engine.call('getVersion', [])).toEqual({ version: 'fixture' });
  await engine.stopAndWait();
});
