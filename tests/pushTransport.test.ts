import https from 'node:https';
import { EventEmitter } from 'node:events';
import { createECDH, randomBytes } from 'node:crypto';
import webPush from 'web-push';
import { afterEach, expect, it, vi } from 'vitest';
import { sendPush } from '../server/notifications/send';
import { resolvePublicTarget } from '../server/security/target';
import { PUSH_LIMIT, type BrowserSubscription } from '../shared/notifications';

vi.mock('node:https', () => ({ default: { request: vi.fn() } }));
vi.mock('../server/security/target', async (original) => ({
  ...(await original<typeof import('../server/security/target')>()),
  resolvePublicTarget: vi.fn(),
}));
const PUBLIC_ADDRESS = { address: '93.184.216.34', family: 4 };
const ACCEPTED_STATUS = 201;
const EXPIRED_STATUS = 410;
const REDIRECT_STATUS = 307;
const CONTACT = 'mailto:owner@example.com';
const keys = webPush.generateVAPIDKeys();
const browserKey = createECDH('prime256v1');
browserKey.generateKeys();
const subscription: BrowserSubscription = {
  endpoint: 'https://push.example/private-device-identifier',
  keys: {
    p256dh: browserKey.getPublicKey().toString('base64url'),
    auth: randomBytes(PUSH_LIMIT.authenticationBytes).toString('base64url'),
  },
};

/**
 * Captures the transport without issuing network requests or retaining provider response bodies.
 * @param {number} statusCode - Fake provider HTTP status.
 * @returns {object} Encrypted request and response controls.
 */
function fakeProvider(statusCode: number) {
  const destroy = vi.fn();
  const end = vi.fn((_body: Buffer) => {
    const [, , callback] = vi.mocked(https.request).mock.calls[0]!;
    queueMicrotask(() => callback!({ statusCode, destroy } as unknown as import('node:http').IncomingMessage));
  });
  const request = Object.assign(new EventEmitter(), { end });
  vi.mocked(https.request).mockReturnValue(request as unknown as import('node:http').ClientRequest);
  vi.mocked(resolvePublicTarget).mockResolvedValue(PUBLIC_ADDRESS);
  return { end, destroy };
}
afterEach(() => {
  vi.mocked(https.request).mockReset();
  vi.mocked(resolvePublicTarget).mockReset();
});

it('encrypts Web Push and pins HTTPS without redirects, pooling or response buffering', async () => {
  const provider = fakeProvider(ACCEPTED_STATUS);
  const payload = 'A download is ready on your station.';
  await sendPush(subscription, payload, keys, CONTACT);
  const [target, options] = vi.mocked(https.request).mock.calls[0]!;
  expect(target).toEqual(new URL(subscription.endpoint));
  expect(options).toMatchObject({ method: 'POST', agent: false, family: PUBLIC_ADDRESS.family });
  expect(options!.signal).toBeInstanceOf(AbortSignal);
  const callback = vi.fn();
  const lookup = options!.lookup as import('node:net').LookupFunction;
  lookup('push.example', {}, callback);
  expect(callback).toHaveBeenCalledWith(null, PUBLIC_ADDRESS.address, PUBLIC_ADDRESS.family);
  expect(options!.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: PUSH_LIMIT.timeToLiveSeconds });
  const encrypted = provider.end.mock.calls[0]![0] as Buffer;
  expect(Buffer.isBuffer(encrypted)).toBe(true);
  expect(encrypted.includes(Buffer.from(payload))).toBe(false);
  expect(provider.destroy).toHaveBeenCalledTimes(1);
});

it('rejects private DNS destinations before starting transport', async () => {
  fakeProvider(ACCEPTED_STATUS);
  vi.mocked(resolvePublicTarget).mockRejectedValueOnce(new Error('Private destination blocked.'));
  await expect(sendPush(subscription, 'Generic alert', keys, CONTACT)).rejects.toThrow('Private destination');
  expect(https.request).not.toHaveBeenCalled();
});

it.each([EXPIRED_STATUS, REDIRECT_STATUS])('retains only status for rejected provider response %s', async (status) => {
  fakeProvider(status);
  await expect(sendPush(subscription, 'Generic alert', keys, CONTACT)).rejects.toMatchObject({ statusCode: status });
  expect(https.request).toHaveBeenCalledTimes(1);
});
