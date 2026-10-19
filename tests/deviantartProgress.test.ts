import { afterEach, expect, it, vi } from 'vitest';
import { createDeviantartProgress } from '../server/deviantart/progress';
import { ENGINE_LIMIT } from '../server/engines/constants';
import { runEngineProcess } from '../server/engines/runProcess';
import { MEDIA_FAILURE } from '../shared/mediaFailures';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';
const STALL_WINDOWS = 2;
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupDeliveryFixtures();
});

it.each([
  ['[deviantart][warning] API responded with 429 Too Many Requests. Using 4s delay.', MEDIA_FAILURE.rate],
  ['[deviantart][info] Waiting 300 seconds (CloudFront block)', MEDIA_FAILURE.verification],
  ['[deviantart][error] AuthenticationError: invalid_grant private-token', MEDIA_FAILURE.login],
])('interrupts upstream infinite waits using a fixed private diagnostic category: %s', async (diagnostic, reason) => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add('https://www.deviantart.com/artist');
  const controller = new AbortController();
  createDeviantartProgress(job, controller, 0).diagnostic(`${diagnostic} https://example.com/?secret=token`);
  expect(controller.signal.aborted).toBe(true);
  expect(controller.signal.reason).toMatchObject({ reason });
  expect(String(controller.signal.reason)).not.toMatch(/private-token|example.com|secret=token/);
  expect(JSON.stringify(job)).not.toMatch(/private-token|example.com|secret=token/);
});

it('reports safe authorization stages and fails only after three minutes without actual disk progress', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add('https://www.deviantart.com/artist');
  const controller = new AbortController();
  const start = Date.now();
  const now = vi.spyOn(Date, 'now').mockReturnValue(start);
  const progress = createDeviantartProgress(job, controller, 0);
  progress.diagnostic('Refreshing private access token');
  expect(job.stage).toBe('Authorizing DeviantArt account');
  progress.sample(0);
  expect(job.stage).toBe('Authorizing DeviantArt account');
  progress.diagnostic('Requesting download URL with private token');
  expect(job.stage).toBe('Requesting DeviantArt media');
  now.mockReturnValue(start + ENGINE_LIMIT.deviantartStallMilliseconds - 1);
  progress.sample(1);
  expect(controller.signal.aborted).toBe(false);
  now.mockReturnValue(start + ENGINE_LIMIT.deviantartStallMilliseconds);
  progress.sample(1);
  expect(controller.signal.aborted).toBe(false);
  now.mockReturnValue(start + ENGINE_LIMIT.deviantartStallMilliseconds * STALL_WINDOWS);
  progress.diagnostic('Unrecognized progress private token https://example.com/');
  progress.sample(1);
  expect(controller.signal.aborted).toBe(true);
  expect(controller.signal.reason).toMatchObject({ reason: MEDIA_FAILURE.network });
  expect(controller.signal.reason.message).toContain('3 minutes');
});

it('terminates a real worker looping on rate limits', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add('https://www.deviantart.com/artist');
  const controller = new AbortController();
  const progress = createDeviantartProgress(job, controller, 0);
  const program =
    "process.stderr.write('[deviantart][warning] API responded with 429 Too Many Requests\\n');" +
    'setInterval(()=>{},1000);';
  await expect(
    runEngineProcess(process.execPath, ['-e', program], controller.signal, () => {}, {
      onDiagnostic: progress.diagnostic,
    }),
  ).rejects.toMatchObject({ reason: MEDIA_FAILURE.rate });
});

it('keeps resumed gallery scans alive for distinct skipped files and ignores repeated output', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add('https://www.deviantart.com/artist');
  const controller = new AbortController();
  const start = Date.now();
  const now = vi.spyOn(Date, 'now').mockReturnValue(start);
  const progress = createDeviantartProgress(job, controller, 1);
  now.mockReturnValue(start + ENGINE_LIMIT.deviantartStallMilliseconds - 1);
  progress.output('# /work/art.jpg', '/work');
  progress.sample(1);
  expect(controller.signal.aborted).toBe(false);
  now.mockReturnValue(start + ENGINE_LIMIT.deviantartStallMilliseconds);
  progress.output('/work/another.jpg', '/work');
  progress.sample(1);
  expect(controller.signal.aborted).toBe(false);
  now.mockReturnValue(start + ENGINE_LIMIT.deviantartStallMilliseconds * STALL_WINDOWS);
  progress.output('# /work/art.jpg', '/work');
  progress.output('/other-work/art.jpg', '/work');
  progress.sample(1);
  expect(controller.signal.reason).toMatchObject({ reason: MEDIA_FAILURE.network });
});
