import { afterEach, expect, it, vi } from 'vitest';
import { downloadMedia } from '../server/engines/media';
import { runEngineProcess } from '../server/engines/runProcess';
import { createPublicProxy } from '../server/engines/publicProxy';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

vi.mock('../server/engines/runProcess', () => ({ runEngineProcess: vi.fn() }));
vi.mock('../server/engines/publicProxy', () => ({ createPublicProxy: vi.fn() }));
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.mocked(runEngineProcess).mockReset();
  vi.mocked(createPublicProxy).mockReset();
});

it('keeps the video worker on its guarded proxy and reports missing browser support', async () => {
  const { configuration, queue } = await createDeliveryFixture();
  configuration.runtimeEnvironment = { PATH: '/fixed/bin', NO_PROXY: '*', HTTPS_PROXY: 'http://ambient-proxy' };
  const close = vi.fn();
  vi.mocked(createPublicProxy).mockResolvedValue({ url: 'http://127.0.0.1:12345', close });
  vi.mocked(runEngineProcess).mockImplementation(async (_command, args, _signal, _progress, options) => {
    expect(args[args.indexOf('--proxy') + 1]).toBe('http://127.0.0.1:12345');
    expect(options?.env).toEqual({ PATH: '/fixed/bin' });
    throw options?.failure?.('no impersonate target is available; private-session=secret', 1);
  });
  const job = queue.add('https://www.youtube.com/watch?v=offline-example');
  await expect(
    downloadMedia(job, queue.store.filesDirectory, new AbortController().signal, configuration),
  ).rejects.toMatchObject({ message: expect.stringContaining('VIDEO-BROWSER-MISSING') });
  expect(close).toHaveBeenCalledOnce();
  expect(configuration.runtimeEnvironment.NO_PROXY).toBe('*');
});
