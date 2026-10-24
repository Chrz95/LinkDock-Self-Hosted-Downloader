import http from 'node:http';
import net from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { createPublicProxy } from '../server/engines/publicProxy';

const BAD_GATEWAY = 502;
const dns = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup: dns }));
afterEach(() => {
  vi.restoreAllMocks();
  dns.mockReset();
});

it('rejects fake-IP CONNECT requests with a safe DNS signal before opening any upstream connection', async () => {
  dns.mockResolvedValue([{ address: '198.18.0.7', family: 4 }]);
  const outgoing = vi.spyOn(net, 'connect');
  const onRejection = vi.fn();
  const proxy = await createPublicProxy({ onRejection });
  try {
    const code = await new Promise<number | undefined>((resolve, reject) => {
      const request = http.request(proxy.url, { method: 'CONNECT', path: 'www.deviantart.com:443' });
      request.on('connect', (response, socket) => {
        socket.on('error', () => undefined);
        socket.destroy();
        resolve(response.statusCode);
      });
      request.on('error', reject);
      request.end();
    });
    expect(code).toBe(BAD_GATEWAY);
    expect(onRejection).toHaveBeenCalledWith('non-public-dns');
    expect(outgoing).not.toHaveBeenCalled();
    expect(JSON.stringify(onRejection.mock.calls)).not.toMatch(/198\.18|deviantart/);
  } finally {
    proxy.close();
  }
});

it('reports a system resolver failure without exposing its private error text', async () => {
  dns.mockRejectedValue(new Error('DNS upstream private-value'));
  const onRejection = vi.fn();
  const proxy = await createPublicProxy({ onRejection });
  try {
    const code = await new Promise<number | undefined>((resolve, reject) => {
      const request = http.get(proxy.url, { path: 'http://source.example/file?token=private-secret' }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
    });
    expect(code).toBe(BAD_GATEWAY);
    expect(onRejection.mock.calls).toEqual([['dns-unavailable']]);
  } finally {
    proxy.close();
  }
});
